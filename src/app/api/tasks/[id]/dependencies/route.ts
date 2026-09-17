import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceGuard } from "@/domains/identity/guards";
import { DependencyService } from "@/domains/task/dependency.service";

// GET /api/tasks/[id]/dependencies - Retrieve all dependencies for a task
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

    const dependencies = await DependencyService.getTaskDependencies(taskId);
    return NextResponse.json({ success: true, data: dependencies });
  } catch (err: any) {
    console.error("[TaskDependenciesAPI:GET] Error:", err);
    return NextResponse.json(
      { success: false, error: "Internal Error", message: err?.message || "Failed to fetch dependencies" },
      { status: 500 }
    );
  }
}

// POST /api/tasks/[id]/dependencies - Add a blocking dependency
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: blockedTaskId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const { blockingTaskId, workspaceId } = body;

    if (!blockingTaskId) {
      return NextResponse.json(
        { success: false, error: "blockingTaskId is required in request body" },
        { status: 400 }
      );
    }

    const guard = await requireWorkspaceGuard(req, workspaceId);
    if (guard.errorResponse || !guard.auth) {
      return guard.errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const dep = await DependencyService.addDependency({
      actorUserId: guard.auth.userId,
      blockingTaskId,
      blockedTaskId,
      workspaceId: guard.auth.workspaceId,
    });

    return NextResponse.json({ success: true, data: dep }, { status: 201 });
  } catch (err: any) {
    console.error("[TaskDependenciesAPI:POST] Error:", err);
    return NextResponse.json(
      { success: false, error: "Dependency Error", message: err?.message || "Failed to create dependency" },
      { status: 400 }
    );
  }
}

// DELETE /api/tasks/[id]/dependencies?dependencyId=xxx - Remove a dependency
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(req.url);
    const dependencyId = searchParams.get("dependencyId");
    const workspaceId = searchParams.get("workspaceId");

    if (!dependencyId) {
      return NextResponse.json(
        { success: false, error: "dependencyId parameter is required" },
        { status: 400 }
      );
    }

    const guard = await requireWorkspaceGuard(req, workspaceId || undefined);
    if (guard.errorResponse || !guard.auth) {
      return guard.errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const deleted = await DependencyService.removeDependency(
      guard.auth.userId,
      dependencyId,
      guard.auth.workspaceId
    );

    return NextResponse.json({ success: true, data: deleted });
  } catch (err: any) {
    console.error("[TaskDependenciesAPI:DELETE] Error:", err);
    return NextResponse.json(
      { success: false, error: "Bad Request", message: err?.message || "Failed to remove dependency" },
      { status: 400 }
    );
  }
}
