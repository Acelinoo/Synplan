import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceGuard } from "@/domains/identity/guards";
import { MyWorkService } from "@/domains/task/my-work.service";

// GET /api/tasks/my-work - Retrieve deterministic My Work dashboard for authenticated user
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");

    const guard = await requireWorkspaceGuard(req, workspaceId || undefined);
    if (guard.errorResponse || !guard.auth) {
      return guard.errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const myWorkData = await MyWorkService.getMyWork(guard.auth.userId, guard.auth.workspaceId);

    return NextResponse.json({
      success: true,
      data: myWorkData,
    });
  } catch (err: any) {
    console.error("[MyWorkAPI] Error:", err);
    return NextResponse.json(
      { success: false, error: "Internal Server Error", message: err?.message || "Failed to fetch My Work" },
      { status: 500 }
    );
  }
}
