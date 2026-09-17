export type TaskStatus = "todo" | "in_progress" | "in_review" | "done" | "backlog" | "blocked" | "cancelled";

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

export type ProjectStatus = "active" | "completed" | "archived" | "on_hold" | "planning";

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  progress: number; // 0 - 100
  status: ProjectStatus;
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
  capacityStatus?: "OPTIMAL" | "HIGH" | "OVERLOADED";
  activeTaskCount?: number;
  completedTaskCount?: number;
  totalAssignedCount?: number;
  projects?: Array<{
    id: string;
    name: string;
    slug?: string;
    color?: string;
    role?: string;
  }>;
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

export interface MyWorkTaskItem {
  id: string;
  title: string;
  status: TaskStatus | string;
  priority: TaskPriority | string;
  dueDate: string | Date | null;
  projectId?: string;
  project?: { id: string; name: string; slug: string; color: string } | null;
  phase?: { id: string; name: string } | null;
  milestone?: { id: string; title: string } | null;
  isBlocked?: boolean;
  blockersCount?: number;
  subtasksSummary?: {
    total: number;
    completed: number;
    percent: number;
  };
  completedAt?: string | Date | null;
  updatedAt: string | Date;
}

export interface MyWorkSummary {
  totalAssigned: number;
  dueTodayCount: number;
  overdueCount: number;
  blockedCount: number;
  highPriorityCount: number;
  completedRecentlyCount: number;
}

export interface MyWorkResult {
  summary?: MyWorkSummary;
  categories?: {
    overdue: MyWorkTaskItem[];
    dueToday: MyWorkTaskItem[];
    upcoming: MyWorkTaskItem[];
    blocked: MyWorkTaskItem[];
    highPriority: MyWorkTaskItem[];
    recentlyCompleted: MyWorkTaskItem[];
  };
  overdue: MyWorkTaskItem[];
  dueToday: MyWorkTaskItem[];
  upcoming: MyWorkTaskItem[];
  blocked: MyWorkTaskItem[];
  highPriority: MyWorkTaskItem[];
  recentlyCompleted: MyWorkTaskItem[];
  totalActiveCount: number;
}


export interface ActivityFeedItem {
  id: string;
  actor: {
    name: string;
    initial: string;
    avatarUrl?: string | null;
  };
  action: string;
  target: string;
  timestamp: string;
  entityType?: string;
  entityId?: string;
  link?: string;
}

export type ProjectHealthStatus = "ON_TRACK" | "AT_RISK" | "CRITICAL";

export interface ProjectHealthSignals {
  projectId: string;
  projectName: string;
  healthStatus: ProjectHealthStatus;
  reasons: string[];
  metrics: {
    totalTasks: number;
    completedTasks: number;
    completionRate: number;
    overdueTasksCount: number;
    blockedTasksCount: number;
    unassignedTasksCount: number;
    upcomingDeadlinesCount: number;
    highPriorityOpenCount: number;
  };
  upcomingDeadlines: Array<{
    id: string;
    title: string;
    dueDate: Date | string | null;
    status: TaskStatus;
    assigneeName?: string | null;
  }>;
}

export interface BoardTaskCard {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  order: number;
  dueDate?: string | Date | null;
  tags: string[];
  assignee?: { id: string; name: string; email: string; avatarUrl?: string | null } | null;
  project?: { id: string; name: string; slug: string; color: string } | null;
  phase?: { id: string; name: string } | null;
  milestone?: { id: string; title: string } | null;
  subtasksSummary: {
    total: number;
    completed: number;
    percent: number;
  };
  isBlocked: boolean;
}

export interface BoardColumnData {
  status: TaskStatus;
  label: string;
  count: number;
  tasks: BoardTaskCard[];
}

export interface BoardViewData {
  columns: Record<string, BoardColumnData>;
  totalTasks: number;
}

export interface StructuredListMilestone {
  id: string;
  title: string;
  targetDate: Date | string;
  isReached: boolean;
  tasks: any[];
  taskCount: number;
}

export interface StructuredListPhase {
  id: string;
  name: string;
  description: string | null;
  order: number;
  milestones: StructuredListMilestone[];
  directTasks: any[];
  totalTasks: number;
  completedTasks: number;
}

export interface StructuredListView {
  projectId: string;
  phases: StructuredListPhase[];
  ungroupedTasks: any[];
  totalTasks: number;
}

export interface TableViewRow {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  order: number;
  assignee?: { id: string; name: string; avatarUrl?: string | null } | null;
  project: { id: string; name: string; color: string };
  phase?: { id: string; name: string } | null;
  milestone?: { id: string; title: string } | null;
  startDate?: string | Date | null;
  dueDate?: string | Date | null;
  completedAt?: string | Date | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  tags: string[];
  isBlocked: boolean;
  subtasksCompleted: number;
  subtasksTotal: number;
  subtasksPercent: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface TaskDependencyItem {
  id: string;
  blockingTaskId: string;
  blockedTaskId: string;
  blockingTask?: {
    id: string;
    title: string;
    status: string;
  };
  blockedTask?: {
    id: string;
    title: string;
    status: string;
  };
  createdAt?: string;
}

