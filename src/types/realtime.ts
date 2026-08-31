/**
 * SYNPLAN — Realtime Event & Transport Type Definitions
 * Phase 3: Real-Time Sync & Live Collaboration Engine
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
  | "MEMBER_INVITED"
  | "MEMBER_UPDATED"
  | "MEMBER_ROLE_UPDATED"
  | "MEMBER_REMOVED"
  // Comment Events
  | "COMMENT_CREATED"
  | "COMMENT_UPDATED"
  | "COMMENT_DELETED"
  // Activity / Audit Events
  | "ACTIVITY_CREATED"
  // Notification Events
  | "NOTIFICATION_CREATED"
  | "NOTIFICATION_READ"
  | "NOTIFICATIONS_READ_ALL"
  // AI Batch Mutations
  | "BATCH_MUTATION"
  // Presence & Ping Events
  | "USER_PRESENCE"
  | "PING";

export interface BatchMutationPayload {
  tasksCreated?: Task[];
  tasksUpdated?: Array<Partial<Task> & { id: string }>;
  tasksDeleted?: string[];
  phasesUpdated?: Phase[];
  projectsUpdated?: Array<Partial<Project> & { id: string }>;
  summary?: string;
}

export interface RealtimeEventPayloadMap {
  TASK_CREATED: Task;
  TASK_UPDATED: Partial<Task> & { id: string };
  TASK_DELETED: { id: string; projectId?: string };
  TASK_STATUS_CHANGED: {
    taskId: string;
    previousStatus?: string;
    newStatus: string;
    projectId?: string;
    completedAt?: string;
    evaluator?: {
      timingSummary?: string;
      milestoneTriggered?: boolean;
      projectCompleted?: boolean;
      projectProgress?: number;
    };
  };
  TASK_ASSIGNED: { taskId: string; assigneeId?: string; assigneeName?: string };

  PROJECT_CREATED: Project;
  PROJECT_UPDATED: Partial<Project> & { id: string };
  PROJECT_DELETED: { id: string };

  PHASE_CREATED: Phase;
  PHASE_UPDATED: Partial<Phase> & { id: string; projectId?: string };
  PHASE_DELETED: { id: string; projectId: string };
  PHASES_REORDERED: { projectId: string; phases: { id: string; order: number }[] };

  MEMBER_ADDED: WorkspaceMember;
  MEMBER_INVITED: WorkspaceMember;
  MEMBER_UPDATED: Partial<WorkspaceMember> & { id: string };
  MEMBER_ROLE_UPDATED: Partial<WorkspaceMember> & { id: string; userId?: string; newRole?: string };
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

  BATCH_MUTATION: BatchMutationPayload;

  USER_PRESENCE: { userId: string; userName: string; avatarUrl?: string | null; activeTab?: string };
  PING: { timestamp: number };
}

export interface RealtimeEvent<T extends RealtimeEventType = RealtimeEventType> {
  id: string;
  eventId?: string;
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
