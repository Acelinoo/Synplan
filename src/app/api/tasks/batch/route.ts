import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceGuard } from "@/domains/identity/guards";
import { TaskDomainService } from "@/domains/task/task.service";
import { TaskStatus, TaskPriority } from "@prisma/client";

// POST /api/tasks/batch - Perform atomic batch operations on tasks
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action, taskIds, workspaceId, payload } = body;

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "Validation Error", message: "taskIds must be a non-empty array of strings" },
        { status: 400 }
      );
    }

    const guard = await requireWorkspaceGuard(req, workspaceId);
    if (guard.errorResponse || !guard.auth) {
      return guard.errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const actorUserId = guard.auth.userId;
    const effectiveWorkspaceId = guard.auth.workspaceId;

    switch (action) {
      case "STATUS": {
        const newStatus = payload?.status as TaskStatus;
        if (!newStatus || !Object.values(TaskStatus).includes(newStatus)) {
          return NextResponse.json(
            { success: false, error: "Invalid status parameter" },
            { status: 400 }
          );
        }
        const result = await TaskDomainService.batchChangeStatus(
          actorUserId,
          taskIds,
          newStatus,
          effectiveWorkspaceId
        );
        return NextResponse.json({ success: true, data: result });
      }

      case "ASSIGN": {
        const assigneeId = payload?.assigneeId ?? null;
        const result = await TaskDomainService.batchAssign(
          actorUserId,
          taskIds,
          assigneeId,
          effectiveWorkspaceId
        );
        return NextResponse.json({ success: true, data: result });
      }

      case "PRIORITY": {
        const priority = payload?.priority as TaskPriority;
        if (!priority || !Object.values(TaskPriority).includes(priority)) {
          return NextResponse.json(
            { success: false, error: "Invalid priority parameter" },
            { status: 400 }
          );
        }
        const result = await TaskDomainService.batchChangePriority(
          actorUserId,
          taskIds,
          priority,
          effectiveWorkspaceId
        );
        return NextResponse.json({ success: true, data: result });
      }

      default:
        return NextResponse.json(
          {
            success: false,
            error: "Unsupported batch action",
            message: "Supported actions: STATUS, ASSIGN, PRIORITY",
          },
          { status: 400 }
        );
    }
  } catch (err: any) {
    console.error("[BatchTasksAPI] Error:", err);
    return NextResponse.json(
      { success: false, error: "Bad Request", message: err?.message || "Batch operation failed" },
      { status: 400 }
    );
  }
}
