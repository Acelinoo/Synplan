import { NextRequest, NextResponse } from "next/server";
import { requireAuthGuard } from "@/lib/authGuard";
import { applyRateLimit, apiRateLimiter } from "@/lib/rateLimit";
import { createApiErrorResponse } from "@/lib/apiErrors";
import { checkWorkspaceDataConsistency } from "@/lib/dataConsistency";

export async function GET(req: NextRequest) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { searchParams } = new URL(req.url);
    const workspaceIdParam = searchParams.get("workspaceId");

    // Strict Permission Guard: workspace.update (ADMIN / OWNER only)
    const { auth, errorResponse } = await requireAuthGuard(req, "workspace.update", workspaceIdParam || undefined);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const targetWorkspaceId = auth.workspaceId;

    const consistencyReport = await checkWorkspaceDataConsistency(targetWorkspaceId);

    return NextResponse.json({
      success: true,
      data: consistencyReport,
    }, {
      headers: {
        ...rateLimit.rateLimitHeaders,
        "x-consistency-status": consistencyReport.healthy ? "HEALTHY" : "DEGRADED",
      },
    });
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to run data consistency health check");
  }
}
