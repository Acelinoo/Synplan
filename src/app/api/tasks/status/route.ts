import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { createNotification } from "@/lib/notificationService";
import { TaskStatus, Role } from "@prisma/client";

// PATCH /api/tasks/status - Update Kanban task status & evaluate micro-feedback metadata
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { taskId, status, actorId } = body;

    if (!taskId || !status) {
      return NextResponse.json(
        { success: false, error: "taskId and status are required" },
        { status: 400 }
      );
    }

    const validStatus = Object.values(TaskStatus).find(
      (s) => s.toLowerCase() === status.toLowerCase()
    );

    if (!validStatus) {
      return NextResponse.json(
        { success: false, error: `Invalid task status: ${status}` },
        { status: 400 }
      );
    }

    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true },
    });

    if (!existingTask) {
      return NextResponse.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      );
    }

    // Verify requesting user is authorized in this task's workspace
    const { auth, errorResponse } = await requireAuthGuard(req, Role.MEMBER, existingTask.workspaceId);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const isMovingToDone = validStatus === TaskStatus.DONE;
    const now = new Date();

    const updatedTask = await prisma.task.update({
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

    // Evaluate Project Progress & Milestone
    let projectCompleted = false;
    let milestoneTriggered = false;
    let newProjectProgress = 0;

    if (existingTask.projectId) {
      const [totalTasks, doneTasks] = await Promise.all([
        prisma.task.count({ where: { projectId: existingTask.projectId } }),
        prisma.task.count({ where: { projectId: existingTask.projectId, status: TaskStatus.DONE } }),
      ]);

      newProjectProgress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
      projectCompleted = totalTasks > 0 && doneTasks === totalTasks;

      if ([25, 50, 75, 100].includes(newProjectProgress)) {
        milestoneTriggered = true;
      }

      let nextProjectStatus = existingTask.project.status;
      if (existingTask.project.status !== "ARCHIVED") {
        if (projectCompleted) {
          nextProjectStatus = "COMPLETED";
        } else if (existingTask.project.status === "COMPLETED") {
          nextProjectStatus = "ACTIVE";
        }
      }

      await prisma.project.update({
        where: { id: existingTask.projectId },
        data: {
          progress: newProjectProgress,
          status: nextProjectStatus,
        },
      });
    }

    // Record audit trail
    try {
      await prisma.auditLog.create({
        data: {
          workspaceId: existingTask.workspaceId,
          actorId: actorId || "system",
          action: "TASK_STATUS_UPDATE",
          target: `Task "${existingTask.title}" -> ${validStatus} (${timingSummary})`,
        },
      });
    } catch (auditErr) {
      console.warn("Audit log creation skipped:", auditErr);
    }

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
    });
  } catch (error: any) {
    console.error("PATCH /api/tasks/status error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update task status",
        message: error?.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}
