import { prisma } from "@/lib/prisma";
import { publishWorkspaceEvent } from "@/lib/realtimeServer";
import { NotificationType, NotificationItem } from "@/types";

export interface CreateNotificationParams {
  workspaceId: string;
  userId: string;
  type: NotificationType;
  title: string;
  description: string;
  actorId?: string;
  entityType?: "TASK" | "PROJECT" | "TEAM" | "SYSTEM";
  entityId?: string;
  link?: string;
}

/**
 * Centralized Notification Service
 * Creates notification in PostgreSQL with sliding-window deduplication,
 * actor self-notification suppression, and broadcasts realtime events.
 */
export async function createNotification(params: CreateNotificationParams): Promise<NotificationItem | null> {
  try {
    if (!params.userId || !params.workspaceId) {
      return null;
    }

    // 1. Anti-self notification suppression: Do not notify actor for their own actions
    if (params.actorId && params.actorId === params.userId) {
      return null;
    }

    // 2. Verify recipient user exists
    const recipient = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true, name: true },
    });

    if (!recipient) {
      return null;
    }

    // 3. Sliding-window deduplication check (10-second window for identical event)
    const duplicateWindowMs = 10 * 1000;
    const threshold = new Date(Date.now() - duplicateWindowMs);

    const existingRecent = await prisma.notification.findFirst({
      where: {
        workspaceId: params.workspaceId,
        userId: params.userId,
        type: params.type,
        link: params.link || null,
        title: params.title,
        createdAt: { gte: threshold },
      },
    });

    if (existingRecent) {
      return {
        id: existingRecent.id,
        workspaceId: existingRecent.workspaceId,
        userId: existingRecent.userId,
        title: existingRecent.title,
        description: existingRecent.description,
        type: existingRecent.type as NotificationType,
        entityType: params.entityType || null,
        entityId: params.entityId || null,
        link: existingRecent.link,
        read: existingRecent.read,
        createdAt: existingRecent.createdAt.toISOString(),
        updatedAt: existingRecent.updatedAt.toISOString(),
      };
    }

    // 4. Persist to PostgreSQL database
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

    // 5. Format payload
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

    // 6. Broadcast Realtime Event to workspace channel
    await publishWorkspaceEvent(params.workspaceId, "NOTIFICATION_CREATED", payload, {
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
