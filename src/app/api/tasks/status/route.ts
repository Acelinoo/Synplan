import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { createNotification } from "@/lib/notificationService";
import { TaskStatus, ProjectStatus } from "@prisma/client";
import { applyRateLimit, apiRateLimiter } from "@/lib/rateLimit";
import { validateRequestBody } from "@/lib/validation/apiValidator";
import { UpdateTaskStatusSchema } from "@/lib/validation/schemas";
import { createApiErrorResponse } from "@/lib/apiErrors";
import { publishWorkspaceEvent } from "@/lib/realtimeServer";
import { createAuditEntry } from "@/lib/audit";

// PATCH /api/tasks/status - Update Kanban task status & evaluate micro-feedback metadata atomically
export async function PATCH(req: NextRequest) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const validation = await validateRequestBody(req, UpdateTaskStatusSchema);
    if (validation.errorResponse) return validation.errorResponse;

    const { taskId, status } = validation.data;

    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true },
    });

    if (!existingTask) {
      return NextResponse.json(
        { success: false, error: "Not Found", message: "Task not found" },
        { status: 404 }
      );
    }

    // Verify requesting user is authorized in this task's workspace (tasks.change_status)
    const { auth, errorResponse } = await requireAuthGuard(req, "tasks.change_status", existingTask.workspaceId);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const validStatus = status as TaskStatus;
    const isMovingToDone = validStatus === TaskStatus.DONE;
    const now = new Date();

    // Timing evaluation
    let timingSummary = "On track";
    if (isMovingToDone) {
      if (existingTask.dueDate) {
        const due = new Date(existingTask.dueDate);
        if (now.getTime() <= due.getTime()) {
          timingSummary = "Ahead of schedule / On-time";
        } else {
          timingSummary = "Completed post-deadline";
        }
      } else {
        timingSummary = "Completed on-time";
      }
    }

    // Execute atomic transaction for task status + project progress & milestone synchronization
    const {
      updatedTask,
      newProjectProgress,
      nextProjectStatus,
      milestoneTriggered,
      projectCompleted,
    } = await prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data: {
          status: validStatus,
          completedAt: isMovingToDone ? now : null,
        },
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          subtasks: true,
          project: true,
        },
      });

      let progress = 0;
      let nextStatus = existingTask.project?.status || ProjectStatus.ACTIVE;
      let pCompleted = false;
      let mTriggered = false;

      if (existingTask.projectId) {
        const [totalTasks, doneTasks] = await Promise.all([
          tx.task.count({ where: { projectId: existingTask.projectId } }),
          tx.task.count({ where: { projectId: existingTask.projectId, status: TaskStatus.DONE } }),
        ]);

        progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
        pCompleted = totalTasks > 0 && doneTasks === totalTasks;

        if ([25, 50, 75, 100].includes(progress)) {
          mTriggered = true;
        }

        if (existingTask.project?.status !== ProjectStatus.ARCHIVED) {
          if (pCompleted) {
            nextStatus = ProjectStatus.COMPLETED;
          } else if (existingTask.project?.status === ProjectStatus.COMPLETED) {
            nextStatus = ProjectStatus.ACTIVE;
          }
        }

        await tx.project.update({
          where: { id: existingTask.projectId },
          data: {
            progress,
            status: nextStatus,
          },
        });
      }

      return {
        updatedTask: updated,
        newProjectProgress: progress,
        nextProjectStatus: nextStatus,
        milestoneTriggered: mTriggered,
        projectCompleted: pCompleted,
      };
    }, { maxWait: 10000, timeout: 20000 });

    // Publish server-authoritative project progress update if project exists
    if (existingTask.projectId) {
      publishWorkspaceEvent(auth, "PROJECT_UPDATED", {
        id: existingTask.projectId,
        progress: newProjectProgress,
        status: nextProjectStatus,
      } as any, {
        projectId: existingTask.projectId,
      }).catch(() => {});
    }

    // Publish server-authoritative task status change event
    await publishWorkspaceEvent(auth, "TASK_STATUS_CHANGED", {
      taskId,
      previousStatus: existingTask.status,
      newStatus: validStatus,
      projectId: existingTask.projectId,
      completedAt: updatedTask.completedAt ? updatedTask.completedAt.toISOString() : undefined,
      evaluator: {
        timingSummary,
        milestoneTriggered,
        projectCompleted,
        projectProgress: newProjectProgress,
      },
    }, {
      projectId: existingTask.projectId,
      taskId,
    });

    // Record audit trail with user identity and IP tracking
    await createAuditEntry({
      workspaceId: existingTask.workspaceId,
      actorId: auth.userId,
      actorType: "USER",
      action: "TASK_STATUS_CHANGE",
      target: `Task "${existingTask.title}" -> ${validStatus} (${timingSummary})`,
      entityType: "task",
      entityId: taskId,
      before: { status: existingTask.status, title: existingTask.title, projectId: existingTask.projectId },
      after: { status: validStatus, title: updatedTask.title, projectId: updatedTask.projectId, completedAt: updatedTask.completedAt },
      requestId: req.headers.get("x-request-id"),
      source: "TASK_FORM",
      ipAddress: auth.ipAddress,
    });

    // Dispatch direct notification to task assignee if changed by another user
    if (existingTask.assigneeId && existingTask.assigneeId !== auth.userId) {
      createNotification({
        workspaceId: existingTask.workspaceId,
        userId: existingTask.assigneeId,
        type: "TASK_STATUS_CHANGED",
        title: "Task Status Updated",
        description: `Status of "${existingTask.title}" was moved to ${validStatus.toLowerCase().replace(/_/g, " ")}`,
        entityType: "TASK",
        entityId: existingTask.id,
        link: `/tasks?taskId=${existingTask.id}`,
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      data: updatedTask,
      evaluator: {
        taskId: updatedTask.id,
        previousStatus: existingTask.status,
        currentStatus: updatedTask.status,
        timingSummary,
        milestoneTriggered,
        projectCompleted,
        projectProgress: newProjectProgress,
      },
      message: `Task moved to ${validStatus}`,
    }, { headers: rateLimit.rateLimitHeaders });
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to update task status");
  }
}
