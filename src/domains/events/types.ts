import { TaskStatus, TaskPriority, Role } from "@prisma/client";

export type DomainEventType =
  | "TASK_CREATED"
  | "TASK_UPDATED"
  | "TASK_ASSIGNED"
  | "TASK_STATUS_CHANGED"
  | "TASK_COMPLETED"
  | "TASK_DELETED"
  | "TASK_DEPENDENCY_CREATED"
  | "TASK_DEPENDENCY_REMOVED"
  | "COMMENT_CREATED"
  | "PROJECT_UPDATED"
  | "NOTIFICATION_CREATED";

export interface BaseDomainEvent<T extends DomainEventType, P = Record<string, any>> {
  id: string;
  type: T;
  workspaceId: string;
  projectId?: string;
  actorId: string;
  timestamp: string;
  payload: P;
}

export type TaskCreatedEvent = BaseDomainEvent<
  "TASK_CREATED",
  {
    taskId: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    assigneeId?: string | null;
    phaseId?: string | null;
    milestoneId?: string | null;
  }
>;

export type TaskUpdatedEvent = BaseDomainEvent<
  "TASK_UPDATED",
  {
    taskId: string;
    changes: Record<string, any>;
    previous?: Record<string, any>;
  }
>;

export type TaskAssignedEvent = BaseDomainEvent<
  "TASK_ASSIGNED",
  {
    taskId: string;
    taskTitle: string;
    assigneeId: string;
    previousAssigneeId?: string | null;
  }
>;

export type TaskStatusChangedEvent = BaseDomainEvent<
  "TASK_STATUS_CHANGED",
  {
    taskId: string;
    taskTitle: string;
    previousStatus: TaskStatus;
    newStatus: TaskStatus;
  }
>;

export type TaskCompletedEvent = BaseDomainEvent<
  "TASK_COMPLETED",
  {
    taskId: string;
    taskTitle: string;
    completedAt: string;
  }
>;

export type TaskDeletedEvent = BaseDomainEvent<
  "TASK_DELETED",
  {
    taskId: string;
    taskTitle: string;
  }
>;

export type TaskDependencyCreatedEvent = BaseDomainEvent<
  "TASK_DEPENDENCY_CREATED",
  {
    dependencyId: string;
    blockingTaskId: string;
    blockedTaskId: string;
  }
>;

export type TaskDependencyRemovedEvent = BaseDomainEvent<
  "TASK_DEPENDENCY_REMOVED",
  {
    dependencyId: string;
    blockingTaskId: string;
    blockedTaskId: string;
  }
>;

export type CommentCreatedEvent = BaseDomainEvent<
  "COMMENT_CREATED",
  {
    commentId: string;
    taskId: string;
    taskTitle: string;
    authorId: string;
    content: string;
  }
>;

export type ProjectUpdatedEvent = BaseDomainEvent<
  "PROJECT_UPDATED",
  {
    projectId: string;
    projectName: string;
    changes: Record<string, any>;
  }
>;

export type NotificationCreatedEvent = BaseDomainEvent<
  "NOTIFICATION_CREATED",
  {
    notificationId: string;
    userId: string;
    title: string;
    description: string;
    type: string;
    link?: string | null;
  }
>;

export type DomainEvent =
  | TaskCreatedEvent
  | TaskUpdatedEvent
  | TaskAssignedEvent
  | TaskStatusChangedEvent
  | TaskCompletedEvent
  | TaskDeletedEvent
  | TaskDependencyCreatedEvent
  | TaskDependencyRemovedEvent
  | CommentCreatedEvent
  | ProjectUpdatedEvent
  | NotificationCreatedEvent;
