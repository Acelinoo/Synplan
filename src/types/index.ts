export type TaskStatus = "todo" | "in_progress" | "in_review" | "done";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type MemberRole = "owner" | "admin" | "member" | "viewer";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: MemberRole;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  ownerId?: string;
  logoUrl?: string | null;
  role?: MemberRole | string;
  membersCount?: number;
  projectsCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Phase {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  progress: number; // 0 - 100
  status: "active" | "completed" | "archived" | "on_hold" | "planning";
  deadline: string;
  color: string;
  totalTasks: number;
  completedTasks: number;
  assignedMemberIds: string[];
  phases?: Phase[];
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  phaseId?: string | null;
  phase?: Phase | null;
  workspaceId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: string;
  dueDate?: string;
  completedAt?: string;
  order: number;
  subtasks: Subtask[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  completed: boolean;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  user: UserProfile;
  role: MemberRole;
  joinedAt: string;
  assignedTasksCount: number;
  workloadScore: number; // 0 - 100 for capacity visualizer
}

export type CalendarViewMode = "month" | "week" | "day";

export type NotificationType =
  | "TASK_ASSIGNED"
  | "TASK_MENTIONED"
  | "TASK_UPDATED"
  | "TASK_STATUS_CHANGED"
  | "TASK_COMMENTED"
  | "PROJECT_MEMBER_ADDED"
  | "PROJECT_CREATED"
  | "PROJECT_UPDATED"
  | "TEAM_MEMBER_ADDED"
  | "TEAM_MEMBER_REMOVED"
  | "SYSTEM";

export interface NotificationItem {
  id: string;
  workspaceId: string;
  userId: string;
  title: string;
  description: string;
  type: NotificationType;
  entityType?: "TASK" | "PROJECT" | "TEAM" | "SYSTEM" | null;
  entityId?: string | null;
  link?: string | null;
  read: boolean;
  readAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "success" | "warning" | "danger" | "info";
  duration?: number;
}
