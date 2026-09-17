import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceGuard } from "@/domains/identity/guards";
import { ProjectHealthService } from "@/domains/project/project-health.service";

// GET /api/projects/[id]/health - Retrieve explainable project health signals
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await context.params;
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");

    const guard = await requireWorkspaceGuard(req, workspaceId || undefined);
    if (guard.errorResponse || !guard.auth) {
      return guard.errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const healthSignals = await ProjectHealthService.calculateHealthSignals(
      projectId,
      guard.auth.workspaceId
    );

    return NextResponse.json({
      success: true,
      data: healthSignals,
    });
  } catch (err: any) {
    console.error("[ProjectHealthAPI] Error:", err);
    return NextResponse.json(
      { success: false, error: "Internal Error", message: err?.message || "Failed to calculate health signals" },
      { status: 500 }
    );
  }
}
