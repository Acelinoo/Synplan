/**
 * SYNPLAN 2.0 — Realtime Event Envelope & Types
 *
 * Realtime only transports facts; PostgreSQL remains authoritative.
 */

export type RealtimeEventType =
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
  | "PROJECT_MEMBER_ADDED"
  | "PROJECT_MEMBER_UPDATED"
  | "PROJECT_MEMBER_REMOVED"
  | "NOTIFICATION_CREATED";

export interface RealtimeEnvelope<T = unknown> {
  id: string;
  type: RealtimeEventType;
  workspaceId: string;
  projectId?: string;
  entityId?: string;
  actorId?: string;
  timestamp: string;
  version?: number;
  payload: T;
}

export interface TaskRealtimePayload {
  taskId: string;
  title: string;
  status?: string;
  priority?: string;
  assigneeId?: string | null;
  phaseId?: string | null;
  milestoneId?: string | null;
  changes?: Record<string, any>;
}

export interface NotificationRealtimePayload {
  notificationId: string;
  userId: string;
  title: string;
  description: string;
  type: string;
  link?: string | null;
}
