import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceGuard, requireProjectGuard } from "@/domains/identity/guards";
import { applyRateLimit, apiRateLimiter } from "@/lib/rateLimit";
import { ActivityService } from "@/domains/activity/activity.service";

export async function GET(req: NextRequest) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { searchParams } = new URL(req.url);
    const workspaceIdParam = searchParams.get("workspaceId");
    const projectIdParam = searchParams.get("projectId");
    const actorIdParam = searchParams.get("actorId");
    const entityTypeParam = searchParams.get("entityType");
    const actionParam = searchParams.get("action");
    const searchParam = searchParams.get("search");
    const pageParam = searchParams.get("page");
    const limitParam = searchParams.get("limit");
    const cursorParam = searchParams.get("cursor");

    let workspaceId: string;

    // 1. Authorize: Two-tier RBAC check
    if (projectIdParam) {
      const guard = await requireProjectGuard(req, projectIdParam, workspaceIdParam || undefined);
      if (guard.errorResponse || !guard.auth) {
        return guard.errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      }
      workspaceId = guard.auth.workspaceId;
    } else {
      const guard = await requireWorkspaceGuard(req, workspaceIdParam || undefined);
      if (guard.errorResponse || !guard.auth) {
        return guard.errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      }
      workspaceId = guard.auth.workspaceId;
    }

    // 2. Parse pagination bounds
    const page = pageParam ? parseInt(pageParam, 10) : 1;
    const limit = limitParam ? parseInt(limitParam, 10) : 20;

    // 3. Query PostgreSQL Activity Feed via domain service
    const result = await ActivityService.getActivityFeed({
      workspaceId,
      projectId: projectIdParam || undefined,
      actorId: actorIdParam || undefined,
      entityType: entityTypeParam || undefined,
      action: actionParam || undefined,
      search: searchParam || undefined,
      page: isNaN(page) ? 1 : page,
      limit: isNaN(limit) ? 20 : limit,
      cursor: cursorParam || undefined,
    });

    return NextResponse.json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error: any) {
    console.error("[API:Activity] Failed to fetch activity feed:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal Server Error",
        message: error?.message || "Failed to retrieve activity feed",
      },
      { status: 500 }
    );
  }
}
