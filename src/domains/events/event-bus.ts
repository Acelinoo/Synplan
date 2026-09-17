import { prisma } from "@/lib/prisma";
import {
  DomainEvent,
  DomainEventType,
  TaskAssignedEvent,
  TaskCompletedEvent,
  CommentCreatedEvent,
} from "./types";

export type EventHandler<E extends DomainEvent = DomainEvent> = (event: E) => Promise<void> | void;

class DomainEventBus {
  private handlers: Map<DomainEventType, Set<EventHandler>> = new Map();
  private wildcardHandlers: Set<EventHandler> = new Set();

  /**
   * Subscribe to a specific domain event.
   * Returns an unsubscribe function.
   */
  subscribe<E extends DomainEvent = DomainEvent>(
    type: DomainEventType,
    handler: EventHandler<E>
  ): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    const set = this.handlers.get(type)!;
    set.add(handler as EventHandler);

    return () => {
      set.delete(handler as EventHandler);
    };
  }

  /**
   * Subscribe to all domain events (for auditing, logging, or testing).
   */
  subscribeAll(handler: EventHandler): () => void {
    this.wildcardHandlers.add(handler);
    return () => {
      this.wildcardHandlers.delete(handler);
    };
  }

  /**
   * Dispatches a domain event to all registered consumers.
   */
  async publish(event: DomainEvent): Promise<void> {
    const promises: Promise<void>[] = [];

    // Notify specific type subscribers
    const specificHandlers = this.handlers.get(event.type);
    if (specificHandlers) {
      for (const handler of specificHandlers) {
        try {
          const res = handler(event);
          if (res instanceof Promise) promises.push(res);
        } catch (err) {
          console.error(`[EventBus] Error in handler for ${event.type}:`, err);
        }
      }
    }

    // Notify wildcard subscribers
    for (const handler of this.wildcardHandlers) {
      try {
        const res = handler(event);
        if (res instanceof Promise) promises.push(res);
      } catch (err) {
        console.error(`[EventBus] Error in wildcard handler for ${event.type}:`, err);
      }
    }

    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }

  /**
   * Convenience alias to publish an event with auto-generated id and timestamp if omitted.
   */
  async emit(
    event: Omit<DomainEvent, "id" | "timestamp"> & {
      id?: string;
      timestamp?: string;
    }
  ): Promise<void> {
    const fullEvent: DomainEvent = {
      id: event.id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: event.timestamp || new Date().toISOString(),
      ...event,
    } as DomainEvent;
    return this.publish(fullEvent);
  }

  /**
   * Clears all subscribers (useful for isolated unit tests).
   */
  clear(): void {
    this.handlers.clear();
    this.wildcardHandlers.clear();
    this.registerDefaultConsumers();
  }

  /**
   * Attaches default system consumers: Audit & Notification.
   */
  registerDefaultConsumers(): void {
    // 1. Audit Log Consumer
    this.subscribeAll(async (event) => {
      try {
        if (!event.workspaceId || event.type === "NOTIFICATION_CREATED") return;

        const payload = (event.payload as any) || {};
        const entityId = payload.taskId || payload.projectId || payload.dependencyId || payload.commentId || event.id;
        const entityType = payload.taskId ? "TASK" : payload.projectId ? "PROJECT" : payload.commentId ? "COMMENT" : "ENTITY";
        const projectId = event.projectId || payload.projectId;

        const isSystem = !event.actorId || event.actorId === "SYSTEM" || event.actorId.startsWith("system_") || event.actorId.startsWith("automation_");
        const actorType = isSystem ? "SYSTEM" : "USER";
        const actorId = isSystem ? null : event.actorId;

        await prisma.auditLog.create({
          data: {
            workspaceId: event.workspaceId,
            actorId,
            actorType,
            action: event.type,
            target: entityId,
            entityType,
            entityId,
            metadata: projectId ? { projectId } : undefined,
            after: {
              eventId: event.id,
              eventType: event.type,
              payload: event.payload,
              timestamp: event.timestamp,
            },
          },
        });
      } catch (err) {
        // Never let audit logging fail the primary domain flow
        console.warn("[EventBus:Audit] Failed to log audit event:", err);
      }
    });

    // 2. Notification Consumer for TASK_ASSIGNED
    this.subscribe<TaskAssignedEvent>("TASK_ASSIGNED", async (event) => {
      try {
        const { assigneeId, taskTitle, taskId } = event.payload;
        // Don't notify if user assigned themselves
        if (assigneeId === event.actorId) return;

        const notif = await prisma.notification.create({
          data: {
            workspaceId: event.workspaceId,
            userId: assigneeId,
            title: "Task Ditugaskan",
            description: `Anda ditugaskan pada task: "${taskTitle}"`,
            type: "ASSIGNED",
            link: `/tasks?selected=${taskId}`,
          },
        });

        await this.emit({
          type: "NOTIFICATION_CREATED",
          workspaceId: event.workspaceId,
          projectId: event.projectId,
          actorId: event.actorId,
          payload: {
            notificationId: notif.id,
            userId: notif.userId,
            title: notif.title,
            description: notif.description,
            type: notif.type,
            link: notif.link,
          },
        });
      } catch (err) {
        console.warn("[EventBus:Notification] Failed to create assignment notification:", err);
      }
    });

    // 3. Notification Consumer for TASK_COMPLETED
    this.subscribe<TaskCompletedEvent>("TASK_COMPLETED", async (event) => {
      try {
        const { taskId, taskTitle } = event.payload;
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          select: { creatorId: true, assigneeId: true },
        });

        // Notify creator if someone else completed their task
        if (task?.creatorId && task.creatorId !== event.actorId) {
          const notif = await prisma.notification.create({
            data: {
              workspaceId: event.workspaceId,
              userId: task.creatorId,
              title: "Task Selesai",
              description: `Task "${taskTitle}" telah diselesaikan.`,
              type: "TASK_COMPLETED",
              link: `/tasks?selected=${taskId}`,
            },
          });

          await this.emit({
            type: "NOTIFICATION_CREATED",
            workspaceId: event.workspaceId,
            projectId: event.projectId,
            actorId: event.actorId,
            payload: {
              notificationId: notif.id,
              userId: notif.userId,
              title: notif.title,
              description: notif.description,
              type: notif.type,
              link: notif.link,
            },
          });
        }
      } catch (err) {
        console.warn("[EventBus:Notification] Failed to create completion notification:", err);
      }
    });

    // 4. Notification Consumer for COMMENT_CREATED
    this.subscribe<CommentCreatedEvent>("COMMENT_CREATED", async (event) => {
      try {
        const { taskId, taskTitle, authorId, content } = event.payload;
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          select: { assigneeId: true, creatorId: true },
        });

        const targetUserIds = new Set<string>();
        if (task?.assigneeId && task.assigneeId !== authorId) targetUserIds.add(task.assigneeId);
        if (task?.creatorId && task.creatorId !== authorId) targetUserIds.add(task.creatorId);

        for (const userId of targetUserIds) {
          const notif = await prisma.notification.create({
            data: {
              workspaceId: event.workspaceId,
              userId,
              title: "Komentar Baru",
              description: `Komentar baru pada task "${taskTitle}": "${content.slice(0, 80)}"`,
              type: "COMMENT",
              link: `/tasks?selected=${taskId}`,
            },
          });

          await this.emit({
            type: "NOTIFICATION_CREATED",
            workspaceId: event.workspaceId,
            projectId: event.projectId,
            actorId: event.actorId,
            payload: {
              notificationId: notif.id,
              userId: notif.userId,
              title: notif.title,
              description: notif.description,
              type: notif.type,
              link: notif.link,
            },
          });
        }
      } catch (err) {
        console.warn("[EventBus:Notification] Failed to create comment notification:", err);
      }
    });
  }
}

export const eventBus = new DomainEventBus();
eventBus.registerDefaultConsumers();
