import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { realtimeClient } from "@/lib/realtime";
import { Role } from "@prisma/client";

// GET /api/notifications - List user notifications for authenticated session
export async function GET(req: NextRequest) {
  try {
    const { auth, errorResponse } = await requireAuthGuard(req, Role.VIEWER);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const filter = searchParams.get("filter") || "all";
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

    const whereClause: any = {
      userId: auth.userId,
      workspaceId: auth.workspaceId,
    };

    if (filter === "unread") {
      whereClause.read = false;
    } else if (filter === "read") {
      whereClause.read = true;
    }

    const notifications = await prisma.notification.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const unreadCount = await prisma.notification.count({
      where: {
        userId: auth.userId,
        workspaceId: auth.workspaceId,
        read: false,
      },
    });

    return NextResponse.json({
      success: true,
      data: notifications,
      unreadCount,
    });
  } catch (error: any) {
    console.error("GET /api/notifications error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to retrieve notifications",
        message: error?.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}

// PATCH /api/notifications - Mark single or all notifications as read
export async function PATCH(req: NextRequest) {
  try {
    const { auth, errorResponse } = await requireAuthGuard(req, Role.VIEWER);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id, markAll } = body;

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
      realtimeClient.broadcast(`workspace:${auth.workspaceId}`, "NOTIFICATIONS_READ_ALL", {
        userId: auth.userId,
        workspaceId: auth.workspaceId,
      }, { workspaceId: auth.workspaceId });

      return NextResponse.json({
        success: true,
        message: "All notifications marked as read",
      });
    }

    if (id) {
      // Ensure user owns this notification
      const existing = await prisma.notification.findFirst({
        where: { id, userId: auth.userId },
      });

      if (!existing) {
        return NextResponse.json(
          { success: false, error: "Notification not found or unauthorized" },
          { status: 404 }
        );
      }

      const updated = await prisma.notification.update({
        where: { id },
        data: { read: true },
      });

      // Broadcast single mark-read
      realtimeClient.broadcast(`workspace:${auth.workspaceId}`, "NOTIFICATION_READ", {
        id: updated.id,
        userId: auth.userId,
      }, { workspaceId: auth.workspaceId });

      return NextResponse.json({
        success: true,
        data: updated,
        message: "Notification marked as read",
      });
    }

    return NextResponse.json(
      { success: false, error: "Missing notification id or markAll flag" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("PATCH /api/notifications error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update notification",
        message: error?.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}
