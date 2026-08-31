import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { createNotification } from "@/lib/notificationService";
import { TaskStatus, TaskPriority } from "@prisma/client";
import { applyRateLimit, apiRateLimiter } from "@/lib/rateLimit";
import { validateRequestBody } from "@/lib/validation/apiValidator";
import { UpdateTaskSchema } from "@/lib/validation/schemas";
import { createApiErrorResponse } from "@/lib/apiErrors";
import { publishWorkspaceEvent } from "@/lib/realtimeServer";

import { createAuditEntry } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/tasks/[id] - Retrieve single task with workspace authorization
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { id } = await params;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ success: false, error: "Bad Request", message: "Invalid task ID" }, { status: 400 });
    }

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        subtasks: { orderBy: { createdAt: "asc" } },
        project: { select: { id: true, name: true, color: true } },
      },
    });

    if (!task) {
      return NextResponse.json({ success: false, error: "Not Found", message: "Task not found" }, { status: 404 });
    }

    // Verify requesting user is an authorized member of the task's workspace (tasks.view)
    const { errorResponse } = await requireAuthGuard(req, "tasks.view", task.workspaceId);
    if (errorResponse) return errorResponse;

    return NextResponse.json({ success: true, data: task }, { headers: rateLimit.rateLimitHeaders });
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to retrieve task");
  }
}

// PUT /api/tasks/[id] - Update task details & subtasks
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { id } = await params;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ success: false, error: "Bad Request", message: "Invalid task ID" }, { status: 400 });
    }

    const validation = await validateRequestBody(req, UpdateTaskSchema);
    if (validation.errorResponse) return validation.errorResponse;

    const { title, description, phaseId, status, priority, assigneeId, dueDate, tags, order } = validation.data;

    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Not Found", message: "Task not found" }, { status: 404 });
    }

    // Verify user has tasks.update permission in this task's workspace
    const { auth, errorResponse } = await requireAuthGuard(req, "tasks.update", existing.workspaceId);
    if (errorResponse || !auth) return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    // Validate phaseId belongs to existing.projectId if changing
    let validPhaseId = existing.phaseId;
    if (phaseId !== undefined) {
      if (phaseId) {
        const phase = await prisma.phase.findFirst({
          where: { id: phaseId, projectId: existing.projectId },
          select: { id: true },
        });
        validPhaseId = phase ? phase.id : null;
      } else {
        validPhaseId = null;
      }
    }

    // Validate assigneeId belongs strictly to this workspace if changing assignee
    let validAssigneeId = existing.assigneeId;
    if (assigneeId !== undefined) {
      if (assigneeId !== null && assigneeId !== "") {
        const isMember = await prisma.workspaceMember.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: existing.workspaceId,
              userId: assigneeId,
            },
          },
          select: { userId: true },
        });
        if (!isMember) {
          return NextResponse.json(
            {
              success: false,
              error: "Bad Request",
              message: `Assignee '${assigneeId}' is not a valid member of this workspace`,
            },
            { status: 400 }
          );
        }
        validAssigneeId = isMember.userId;
      } else {
        validAssigneeId = null;
      }
    }

    // Update main task
    const updated = await prisma.task.update({
      where: { id },
      data: {
        title: title ? title.trim() : existing.title,
        description: description !== undefined ? description : existing.description,
        phaseId: validPhaseId,
        status: status ? (status as TaskStatus) : existing.status,
        priority: priority ? (priority as TaskPriority) : existing.priority,
        assigneeId: validAssigneeId,
        dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : existing.dueDate,
        tags: Array.isArray(tags) ? tags : existing.tags,
        order: order !== undefined ? order : existing.order,
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        subtasks: { orderBy: { createdAt: "asc" } },
        project: true,
      },
    });

    // If assignee was changed to another user, dispatch direct notification
    if (
      validAssigneeId &&
      validAssigneeId !== existing.assigneeId &&
      validAssigneeId !== auth.userId
    ) {
      createNotification({
        workspaceId: existing.workspaceId,
        userId: validAssigneeId,
        type: "TASK_ASSIGNED",
        title: "Task Assigned",
        description: `You were assigned to "${updated.title}"`,
        entityType: "TASK",
        entityId: id,
        link: `/tasks?taskId=${id}`,
      }).catch(() => {});
    }

    // Publish server-authoritative realtime event
    await publishWorkspaceEvent(auth, "TASK_UPDATED", updated as any, {
      projectId: updated.projectId,
      taskId: updated.id,
    });

    // Record audit log with before and after snapshots
    let actionType = "TASK_UPDATE";
    if (validAssigneeId !== existing.assigneeId) {
      actionType = validAssigneeId ? "TASK_ASSIGN" : "TASK_UNASSIGN";
    }

    await createAuditEntry({
      workspaceId: existing.workspaceId,
      actorId: auth.userId,
      actorType: "USER",
      action: actionType,
      target: `Task "${updated.title}" updated`,
      entityType: "task",
      entityId: id,
      before: existing,
      after: updated,
      requestId: req.headers.get("x-request-id"),
      source: "TASK_FORM",
      ipAddress: auth.ipAddress,
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: "Task updated successfully",
    }, { headers: rateLimit.rateLimitHeaders });
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to update task");
  }
}

// DELETE /api/tasks/[id] - Delete task
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { id } = await params;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ success: false, error: "Bad Request", message: "Invalid task ID" }, { status: 400 });
    }

    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Not Found", message: "Task not found" }, { status: 404 });
    }

    // Verify user has tasks.delete permission in this task's workspace
    const { auth, errorResponse } = await requireAuthGuard(req, "tasks.delete", existing.workspaceId);
    if (errorResponse || !auth) return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    // Delete subtasks, comments and task in transaction
    await prisma.$transaction([
      prisma.subtask.deleteMany({ where: { taskId: id } }),
      prisma.taskComment.deleteMany({ where: { taskId: id } }),
      prisma.task.delete({ where: { id } }),
    ]);

    // Publish server-authoritative realtime event
    await publishWorkspaceEvent(auth, "TASK_DELETED", { id, projectId: existing.projectId }, {
      projectId: existing.projectId,
      taskId: id,
    });

    // Record audit log with before snapshot
    await createAuditEntry({
      workspaceId: existing.workspaceId,
      actorId: auth.userId,
      actorType: "USER",
      action: "TASK_DELETE",
      target: `Task "${existing.title}" deleted`,
      entityType: "task",
      entityId: id,
      before: existing,
      requestId: req.headers.get("x-request-id"),
      source: "TASK_FORM",
      ipAddress: auth.ipAddress,
    });

    return NextResponse.json({
      success: true,
      message: "Task deleted successfully",
    }, { headers: rateLimit.rateLimitHeaders });
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to delete task");
  }
}
