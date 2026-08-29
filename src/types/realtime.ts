/**
 * SYNPLAN — Realtime Event & Transport Type Definitions
 * Phase 12B: Realtime Infrastructure Foundation
 */

import { Task, Project, Phase, WorkspaceMember, Subtask, NotificationItem } from "./index";

export type RealtimeConnectionState =
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "DISCONNECTED"
  | "ERROR";

export type RealtimeEventType =
  // Task Events
  | "TASK_CREATED"
  | "TASK_UPDATED"
  | "TASK_DELETED"
  | "TASK_STATUS_CHANGED"
  | "TASK_ASSIGNED"
  // Project Events
  | "PROJECT_CREATED"
  | "PROJECT_UPDATED"
  | "PROJECT_DELETED"
  // Phase Events
  | "PHASE_CREATED"
  | "PHASE_UPDATED"
  | "PHASE_DELETED"
  | "PHASES_REORDERED"
  // Member Events
  | "MEMBER_ADDED"
  | "MEMBER_UPDATED"
  | "MEMBER_REMOVED"
  // Comment Events
  | "COMMENT_CREATED"
  | "COMMENT_UPDATED"
  | "COMMENT_DELETED"
  // Activity / Audit Events
  | "ACTIVITY_CREATED"
  // Notification Events (Phase 13)
  | "NOTIFICATION_CREATED"
  | "NOTIFICATION_READ"
  | "NOTIFICATIONS_READ_ALL"
  // Presence & Ping Events
  | "USER_PRESENCE"
  | "PING";

export interface RealtimeEventPayloadMap {
  TASK_CREATED: Task;
  TASK_UPDATED: Partial<Task> & { id: string };
  TASK_DELETED: { id: string; projectId?: string };
  TASK_STATUS_CHANGED: {
    taskId: string;
    previousStatus: string;
    newStatus: string;
    projectId?: string;
    completedAt?: string;
    evaluator?: {
      timingSummary: string;
      milestoneTriggered: boolean;
      projectCompleted: boolean;
      projectProgress: number;
    };
  };
  TASK_ASSIGNED: { taskId: string; assigneeId?: string; assigneeName?: string };

  PROJECT_CREATED: Project;
  PROJECT_UPDATED: Partial<Project> & { id: string };
  PROJECT_DELETED: { id: string };

  PHASE_CREATED: Phase;
  PHASE_UPDATED: Partial<Phase> & { id: string };
  PHASE_DELETED: { id: string; projectId: string };
  PHASES_REORDERED: { projectId: string; phases: { id: string; order: number }[] };

  MEMBER_ADDED: WorkspaceMember;
  MEMBER_UPDATED: Partial<WorkspaceMember> & { id: string };
  MEMBER_REMOVED: { id: string; userId?: string };

  COMMENT_CREATED: {
    id: string;
    taskId: string;
    content: string;
    author: { id: string; name: string; avatarUrl?: string };
    createdAt: string;
  };
  COMMENT_UPDATED: { id: string; taskId: string; content: string };
  COMMENT_DELETED: { id: string; taskId: string };

  ACTIVITY_CREATED: {
    id: string;
    actor: { name: string; initial: string };
    action: string;
    target: string;
    timestamp: string;
    entityType?: string;
    entityId?: string;
    link?: string;
  };

  NOTIFICATION_CREATED: NotificationItem;
  NOTIFICATION_READ: { id: string; userId: string };
  NOTIFICATIONS_READ_ALL: { userId: string; workspaceId?: string };

  USER_PRESENCE: { userId: string; userName: string; activeTab?: string };
  PING: { timestamp: number };
}

export interface RealtimeEvent<T extends RealtimeEventType = RealtimeEventType> {
  id: string;
  type: T;
  workspaceId: string;
  projectId?: string;
  taskId?: string;
  actorId?: string;
  timestamp: string;
  version?: number;
  payload: RealtimeEventPayloadMap[T];
}

export type RealtimeEventHandler<T extends RealtimeEventType = RealtimeEventType> = (
  event: RealtimeEvent<T>
) => void;

export type RealtimeWildcardHandler = (event: RealtimeEvent<any>) => void;

export interface RealtimeSubscription {
  channel: string;
  unsubscribe: () => void;
}

export interface ChannelSubscriptionOptions {
  onJoin?: () => void;
  onError?: (error: Error | any) => void;
  onLeave?: () => void;
}
