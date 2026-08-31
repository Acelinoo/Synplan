import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { applyRateLimit, apiRateLimiter } from "@/lib/rateLimit";
import { createApiErrorResponse } from "@/lib/apiErrors";
import { parsePaginationParams, createPaginatedResponse } from "@/lib/pagination";

export async function GET(req: NextRequest) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { searchParams } = new URL(req.url);
    const workspaceIdParam = searchParams.get("workspaceId");
    const entityType = searchParams.get("entityType");
    const entityId = searchParams.get("entityId");
    const action = searchParams.get("action");
    const actorId = searchParams.get("actorId");
    const actorType = searchParams.get("actorType");
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    // Strict Permission Guard: workspace.view
    const { auth, errorResponse } = await requireAuthGuard(req, "workspace.view", workspaceIdParam || undefined);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const targetWorkspaceId = auth.workspaceId;

    const pagination = parsePaginationParams(searchParams, {
      defaultLimit: 25,
      maxLimit: 100,
    });

    // Build filter criteria safely scoped to authenticated workspace
    const where: any = {
      workspaceId: targetWorkspaceId,
    };

    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (action) where.action = action;
    if (actorId) where.actorId = actorId;
    if (actorType) where.actorType = actorType;

    if (startDateParam || endDateParam) {
      where.timestamp = {};
      if (startDateParam) where.timestamp.gte = new Date(startDateParam);
      if (endDateParam) where.timestamp.lte = new Date(endDateParam);
    }

    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip: pagination.skip,
        take: pagination.limit,
      }),
    ]);

    // Format logs with user display names
    const actorIds = Array.from(new Set(items.map((l) => l.actorId).filter(Boolean))) as string[];
    const users = actorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true, avatarUrl: true },
        })
      : [];

    const userMap = new Map(users.map((u) => [u.id, u]));

    const formattedItems = items.map((log) => {
      const actor = log.actorId ? userMap.get(log.actorId) : null;
      return {
        id: log.id,
        workspaceId: log.workspaceId,
        actorId: log.actorId,
        actorType: log.actorType,
        actor: actor ? { id: actor.id, name: actor.name, email: actor.email, avatarUrl: actor.avatarUrl } : null,
        action: log.action,
        target: log.target,
        entityType: log.entityType,
        entityId: log.entityId,
        before: log.before,
        after: log.after,
        requestId: log.requestId,
        source: log.source,
        metadata: log.metadata,
        timestamp: log.timestamp.toISOString(),
      };
    });

    const totalPages = Math.ceil(total / pagination.limit) || 1;
    const hasMore = pagination.page < totalPages || (formattedItems.length === pagination.limit && formattedItems.length > 0);
    const nextCursor = hasMore && formattedItems.length > 0 ? formattedItems[formattedItems.length - 1].id : null;

    return NextResponse.json({
      success: true,
      data: formattedItems,
      pagination: {
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages,
        hasMore,
        nextCursor,
      },
    }, { headers: rateLimit.rateLimitHeaders });
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to fetch audit logs");
  }
}
