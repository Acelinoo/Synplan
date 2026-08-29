import { prisma } from "@/lib/prisma";
import { realtimeClient } from "@/lib/realtime";
import { NotificationType, NotificationItem } from "@/types";

interface CreateNotificationParams {
  workspaceId: string;
  userId: string;
  type: NotificationType;
  title: string;
  description: string;
  entityType?: "TASK" | "PROJECT" | "TEAM" | "SYSTEM";
  entityId?: string;
  link?: string;
}

/**
 * Centralized Notification Service
 * Creates notification in PostgreSQL and broadcasts realtime event to authorized recipient.
 */
export async function createNotification(params: CreateNotificationParams): Promise<NotificationItem | null> {
  try {
    if (!params.userId || !params.workspaceId) {
      return null;
    }

    // 1. Verify recipient user exists
    const recipient = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true, name: true },
    });

    if (!recipient) {
      return null;
    }

    // 2. Persist to PostgreSQL database
    const notification = await prisma.notification.create({
      data: {
        workspaceId: params.workspaceId,
        userId: params.userId,
        type: params.type,
        title: params.title,
        description: params.description,
        link: params.link,
        read: false,
      },
    });

    // 3. Format payload
    const payload: NotificationItem = {
      id: notification.id,
      workspaceId: notification.workspaceId,
      userId: notification.userId,
      title: notification.title,
      description: notification.description,
      type: notification.type as NotificationType,
      entityType: params.entityType || null,
      entityId: params.entityId || null,
      link: notification.link,
      read: notification.read,
      createdAt: notification.createdAt.toISOString(),
      updatedAt: notification.updatedAt.toISOString(),
    };

    // 4. Broadcast Realtime Event to workspace channel
    realtimeClient.broadcast(`workspace:${params.workspaceId}`, "NOTIFICATION_CREATED", payload, {
      workspaceId: params.workspaceId,
      taskId: params.entityType === "TASK" ? params.entityId : undefined,
      projectId: params.entityType === "PROJECT" ? params.entityId : undefined,
    });

    return payload;
  } catch (err: any) {
    console.error("[NotificationService] Failed to create notification:", err?.message || err);
    // Non-blocking: Do not fail parent business mutation if notification fails
    return null;
  }
}
