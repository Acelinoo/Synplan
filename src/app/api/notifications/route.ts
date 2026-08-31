import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { publishWorkspaceEvent } from "@/lib/realtimeServer";
import { Role } from "@prisma/client";
import { applyRateLimit, apiRateLimiter } from "@/lib/rateLimit";
import { validateRequestBody } from "@/lib/validation/apiValidator";
import { MarkNotificationSchema } from "@/lib/validation/schemas";
import { createApiErrorResponse } from "@/lib/apiErrors";

import { parsePaginationParams } from "@/lib/pagination";

// GET /api/notifications - List user notifications for authenticated session
export async function GET(req: NextRequest) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { auth, errorResponse } = await requireAuthGuard(req, Role.VIEWER);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const filter = searchParams.get("filter") || "all";
    const pagination = parsePaginationParams(req, { defaultLimit: 20, maxLimit: 100 });

    const whereClause: any = {
      userId: auth.userId,
      workspaceId: auth.workspaceId,
    };

    if (filter === "unread") {
      whereClause.read = false;
    } else if (filter === "read") {
      whereClause.read = true;
    }

    const total = await prisma.notification.count({ where: whereClause });

    const queryOptions: any = {
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: pagination.limit,
    };

    if (pagination.cursor) {
      queryOptions.skip = 1;
      queryOptions.cursor = { id: pagination.cursor };
    } else {
      queryOptions.skip = pagination.skip;
    }

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany(queryOptions),
      prisma.notification.count({
        where: {
          userId: auth.userId,
          workspaceId: auth.workspaceId,
          read: false,
        },
      }),
    ]);

    const totalPages = Math.ceil(total / pagination.limit) || 1;
    const hasMore = pagination.page < totalPages || (notifications.length === pagination.limit && notifications.length > 0);
    const nextCursor = hasMore && notifications.length > 0 ? notifications[notifications.length - 1].id : null;

    return NextResponse.json({
      success: true,
      data: notifications,
      unreadCount,
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
    return createApiErrorResponse(error, "Failed to retrieve notifications");
  }
}

// PATCH /api/notifications - Mark single or all notifications as read
export async function PATCH(req: NextRequest) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { auth, errorResponse } = await requireAuthGuard(req, Role.VIEWER);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const validation = await validateRequestBody(req, MarkNotificationSchema);
    if (validation.errorResponse) return validation.errorResponse;

    const { id, markAll } = validation.data;

    if (markAll) {
      await prisma.notification.updateMany({
        where: {
          userId: auth.userId,
          workspaceId: auth.workspaceId,
          read: false,
        },
        data: { read: true },
      });

      // Broadcast mark-all to connected clients of this user
      await publishWorkspaceEvent(auth, "NOTIFICATIONS_READ_ALL", {
        userId: auth.userId,
        workspaceId: auth.workspaceId,
      });

      return NextResponse.json({
        success: true,
        message: "All notifications marked as read",
      }, { headers: rateLimit.rateLimitHeaders });
    }

    if (id) {
      // Ensure user owns this notification
      const existing = await prisma.notification.findFirst({
        where: { id, userId: auth.userId },
      });

      if (!existing) {
        return NextResponse.json(
          { success: false, error: "Not Found", message: "Notification not found or unauthorized" },
          { status: 404 }
        );
      }

      const updated = await prisma.notification.update({
        where: { id },
        data: { read: true },
      });

      // Broadcast single mark-read
      await publishWorkspaceEvent(auth, "NOTIFICATION_READ", {
        id: updated.id,
        userId: auth.userId,
      });

      return NextResponse.json({
        success: true,
        data: updated,
        message: "Notification marked as read",
      }, { headers: rateLimit.rateLimitHeaders });
    }

    return NextResponse.json(
      { success: false, error: "Bad Request", message: "Missing notification id or markAll flag" },
      { status: 400 }
    );
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to update notification");
  }
}
