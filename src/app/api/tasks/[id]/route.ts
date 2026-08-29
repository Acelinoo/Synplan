import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { createNotification } from "@/lib/notificationService";
import { Role } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/tasks/[id] - Retrieve single task with workspace authorization
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        subtasks: { orderBy: { createdAt: "asc" } },
        project: { select: { id: true, name: true, color: true } },
      },
    });

    if (!task) {
      return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
    }

    // Verify requesting user is an authorized member of the task's workspace (tasks.view)
    const { errorResponse } = await requireAuthGuard(req, "tasks.view", task.workspaceId);
    if (errorResponse) return errorResponse;

    return NextResponse.json({ success: true, data: task });
  } catch (error: any) {
    console.error("GET /api/tasks/[id] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to retrieve task",
        message: error?.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}

// PUT /api/tasks/[id] - Update task details & subtasks
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { title, description, phaseId, status, priority, assigneeId, dueDate, tags, subtasks } = body;

    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
    }

    // Verify user has tasks.update permission in this task's workspace
    const { auth, errorResponse } = await requireAuthGuard(req, "tasks.update", existing.workspaceId);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

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

    // Validate assigneeId belongs to this workspace if changing assignee
    let validAssigneeId = existing.assigneeId;
    if (assigneeId !== undefined) {
      if (assigneeId) {
        const isMember = await prisma.workspaceMember.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: existing.workspaceId,
              userId: assigneeId,
            },
          },
          select: { userId: true },
        });
        validAssigneeId = isMember ? isMember.userId : null;
      } else {
        validAssigneeId = null;
      }
    }

    // Update main task
    await prisma.task.update({
      where: { id },
      data: {
        title: title ? title.trim() : existing.title,
        description: description !== undefined ? description : existing.description,
        phaseId: validPhaseId,
        status: status || existing.status,
        priority: priority || existing.priority,
        assigneeId: validAssigneeId,
        dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : existing.dueDate,
        tags: Array.isArray(tags) ? tags : existing.tags,
      },
    });

    // Sync subtasks if provided
    if (Array.isArray(subtasks)) {
      await prisma.subtask.deleteMany({ where: { taskId: id } });
      if (subtasks.length > 0) {
        await prisma.subtask.createMany({
          data: subtasks.map((st: { title: string; completed?: boolean }) => ({
            taskId: id,
            title: st.title.trim(),
            completed: !!st.completed,
          })),
        });
      }
    }

    const reloaded = await prisma.task.findUnique({
      where: { id },
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
        description: `You were assigned to "${reloaded?.title || existing.title}"`,
        entityType: "TASK",
        entityId: id,
        link: `/tasks?taskId=${id}`,
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      data: reloaded,
      message: "Task updated successfully",
    });
  } catch (error: any) {
    console.error("PUT /api/tasks/[id] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update task",
        message: error?.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}

// DELETE /api/tasks/[id] - Delete task
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
    }

    // Verify user has tasks.delete permission in this task's workspace
    const { auth, errorResponse } = await requireAuthGuard(req, "tasks.delete", existing.workspaceId);
    if (errorResponse) return errorResponse;

    // Delete subtasks and task in transaction
    await prisma.$transaction([
      prisma.subtask.deleteMany({ where: { taskId: id } }),
      prisma.task.delete({ where: { id } }),
    ]);

    return NextResponse.json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (error: any) {
    console.error("DELETE /api/tasks/[id] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete task",
        message: error?.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}
