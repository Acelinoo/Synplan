import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceGuard } from "@/domains/identity/guards";
import { TaskDomainService } from "@/domains/task/task.service";

// GET /api/tasks/[id]/subtasks - Get subtasks with completion metrics
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await context.params;
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");

    const guard = await requireWorkspaceGuard(req, workspaceId || undefined);
    if (guard.errorResponse || !guard.auth) {
      return guard.errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const data = await TaskDomainService.getSubtasksForTask(taskId);
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("[SubtasksAPI:GET] Error:", err);
    return NextResponse.json(
      { success: false, error: "Internal Error", message: err?.message || "Failed to fetch subtasks" },
      { status: 500 }
    );
  }
}

// POST /api/tasks/[id]/subtasks - Create subtask
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const { title, order, workspaceId } = body;

    if (!title || !title.trim()) {
      return NextResponse.json(
        { success: false, error: "Validation Error", message: "title is required" },
        { status: 400 }
      );
    }

    const guard = await requireWorkspaceGuard(req, workspaceId);
    if (guard.errorResponse || !guard.auth) {
      return guard.errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const subtask = await TaskDomainService.createSubtask(
      guard.auth.userId,
      taskId,
      title,
      order ?? 0
    );

    return NextResponse.json({ success: true, data: subtask }, { status: 201 });
  } catch (err: any) {
    console.error("[SubtasksAPI:POST] Error:", err);
    return NextResponse.json(
      { success: false, error: "Bad Request", message: err?.message || "Failed to create subtask" },
      { status: 400 }
    );
  }
}
