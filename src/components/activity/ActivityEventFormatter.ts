import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  PlusCircle,
  Trash2,
  UserCheck,
  MessageSquare,
  FolderPlus,
  Bot,
  Zap,
  GitFork,
  Clock,
  Layers,
  Shield,
  Activity,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { ActivityItem } from "@/domains/activity/activity.service";

export interface FormattedActivityEvent {
  icon: LucideIcon;
  iconBgClass: string;
  iconColorClass: string;
  badgeBorderClass: string;
  actionVerb: string;
  entityTitle: string;
  entityTypeBadge: string;
  destinationLink: string | null;
  contextSnippet: {
    type: "status_transition" | "comment" | "assignment" | "text" | "none";
    from?: string;
    to?: string;
    text?: string;
  };
  relativeTime: string;
  fullTime: string;
}

/**
 * Calculates human-readable relative time and accessible full datetime string.
 */
export function formatActivityTimestamp(isoString: string): { relativeTime: string; fullTime: string } {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
      return { relativeTime: "Recently", fullTime: isoString };
    }

    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    let relativeTime: string;
    if (diffSeconds < 45) {
      relativeTime = "Just now";
    } else if (diffMinutes < 60) {
      relativeTime = `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      relativeTime = `${diffHours}h ago`;
    } else if (diffDays === 1) {
      relativeTime = "Yesterday";
    } else if (diffDays < 7) {
      relativeTime = `${diffDays}d ago`;
    } else {
      relativeTime = date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    }

    const fullTime = date.toLocaleString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    return { relativeTime, fullTime };
  } catch {
    return { relativeTime: "Recently", fullTime: isoString };
  }
}

/**
 * Date grouping helper: classifies activities into Today, Yesterday, This Week, or Earlier.
 */
export type ActivityDateGroup = "Today" | "Yesterday" | "This Week" | "Earlier";

export function getActivityDateGroup(isoString: string): ActivityDateGroup {
  try {
    const date = new Date(isoString);
    const now = new Date();

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
    const startOfWeek = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);

    if (date >= startOfToday) return "Today";
    if (date >= startOfYesterday) return "Yesterday";
    if (date >= startOfWeek) return "This Week";
    return "Earlier";
  } catch {
    return "Earlier";
  }
}

/**
 * Centralized formatting engine for all Synplan activity and audit events.
 */
export function formatActivityEvent(item: ActivityItem): FormattedActivityEvent {
  const { relativeTime, fullTime } = formatActivityTimestamp(item.timestamp);
  const action = (item.action || "").toUpperCase();
  const meta = item.metadata || {};

  // Resolve entity name
  const entityTitle =
    meta.taskTitle ||
    meta.title ||
    meta.projectName ||
    meta.name ||
    item.target ||
    "Delivery item";

  // Resolve destination link
  let destinationLink: string | null = null;
  const resolvedProjectId = item.projectId || meta.projectId;

  if (item.entityType === "TASK" || action.includes("TASK")) {
    if (item.entityId) {
      destinationLink = `/tasks?taskId=${item.entityId}`;
    }
  } else if (item.entityType === "PROJECT" || action.includes("PROJECT")) {
    const targetProjId = item.entityId || resolvedProjectId;
    if (targetProjId) {
      destinationLink = `/projects/${targetProjId}`;
    }
  } else if (item.entityType === "MEMBER" || action.includes("MEMBER")) {
    destinationLink = "/team";
  }

  // Action mapping
  switch (action) {
    case "TASK_CREATED":
    case "CREATE_TASK":
      return {
        icon: PlusCircle,
        iconBgClass: "bg-primary/10",
        iconColorClass: "text-primary",
        badgeBorderClass: "border-primary/25",
        actionVerb: "created task",
        entityTitle,
        entityTypeBadge: "Task",
        destinationLink,
        contextSnippet: { type: "none" },
        relativeTime,
        fullTime,
      };

    case "TASK_STATUS_CHANGED": {
      const toStatus = meta.toStatus || meta.newStatus || "updated status";
      const fromStatus = meta.fromStatus || meta.previousStatus;
      return {
        icon: ArrowRight,
        iconBgClass: "bg-indigo-500/10",
        iconColorClass: "text-indigo-500 dark:text-indigo-400",
        badgeBorderClass: "border-indigo-500/25",
        actionVerb: "changed status of",
        entityTitle,
        entityTypeBadge: "Task",
        destinationLink,
        contextSnippet: {
          type: "status_transition",
          from: fromStatus ? fromStatus.replace(/_/g, " ") : undefined,
          to: toStatus.replace(/_/g, " "),
        },
        relativeTime,
        fullTime,
      };
    }

    case "TASK_COMPLETED":
      return {
        icon: CheckCircle2,
        iconBgClass: "bg-emerald-500/10",
        iconColorClass: "text-emerald-500 dark:text-emerald-400",
        badgeBorderClass: "border-emerald-500/25",
        actionVerb: "completed task",
        entityTitle,
        entityTypeBadge: "Task",
        destinationLink,
        contextSnippet: { type: "none" },
        relativeTime,
        fullTime,
      };

    case "TASK_ASSIGNED": {
      const assignee = meta.assigneeName || (meta.assigneeId ? "team member" : "unassigned");
      return {
        icon: UserCheck,
        iconBgClass: "bg-sky-500/10",
        iconColorClass: "text-sky-500 dark:text-sky-400",
        badgeBorderClass: "border-sky-500/25",
        actionVerb: "assigned task",
        entityTitle,
        entityTypeBadge: "Task",
        destinationLink,
        contextSnippet: {
          type: "assignment",
          text: `Assigned to ${assignee}`,
        },
        relativeTime,
        fullTime,
      };
    }

    case "TASK_UPDATED":
    case "UPDATE_TASK":
      return {
        icon: Activity,
        iconBgClass: "bg-slate-500/10",
        iconColorClass: "text-slate-400",
        badgeBorderClass: "border-slate-500/25",
        actionVerb: "updated task",
        entityTitle,
        entityTypeBadge: "Task",
        destinationLink,
        contextSnippet: { type: "none" },
        relativeTime,
        fullTime,
      };

    case "TASK_DELETED":
    case "DELETE_TASK":
      return {
        icon: Trash2,
        iconBgClass: "bg-rose-500/10",
        iconColorClass: "text-rose-500 dark:text-rose-400",
        badgeBorderClass: "border-rose-500/25",
        actionVerb: "deleted task",
        entityTitle,
        entityTypeBadge: "Task",
        destinationLink: null, // deleted entity
        contextSnippet: { type: "none" },
        relativeTime,
        fullTime,
      };

    case "TASK_DEPENDENCY_CREATED":
      return {
        icon: GitFork,
        iconBgClass: "bg-amber-500/10",
        iconColorClass: "text-amber-500 dark:text-amber-400",
        badgeBorderClass: "border-amber-500/25",
        actionVerb: "linked dependency on",
        entityTitle,
        entityTypeBadge: "Dependency",
        destinationLink,
        contextSnippet: { type: "none" },
        relativeTime,
        fullTime,
      };

    case "TASK_DEPENDENCY_REMOVED":
      return {
        icon: GitFork,
        iconBgClass: "bg-amber-500/10",
        iconColorClass: "text-amber-500/70",
        badgeBorderClass: "border-amber-500/25",
        actionVerb: "removed dependency from",
        entityTitle,
        entityTypeBadge: "Dependency",
        destinationLink,
        contextSnippet: { type: "none" },
        relativeTime,
        fullTime,
      };

    case "COMMENT_CREATED":
    case "ADD_COMMENT": {
      const snippet = meta.content ? `"${meta.content.slice(0, 75)}${meta.content.length > 75 ? "..." : ""}"` : undefined;
      return {
        icon: MessageSquare,
        iconBgClass: "bg-blue-500/10",
        iconColorClass: "text-blue-500 dark:text-blue-400",
        badgeBorderClass: "border-blue-500/25",
        actionVerb: "commented on",
        entityTitle,
        entityTypeBadge: "Comment",
        destinationLink,
        contextSnippet: snippet ? { type: "comment", text: snippet } : { type: "none" },
        relativeTime,
        fullTime,
      };
    }

    case "DELETE_COMMENT":
      return {
        icon: Trash2,
        iconBgClass: "bg-rose-500/10",
        iconColorClass: "text-rose-500/70",
        badgeBorderClass: "border-rose-500/25",
        actionVerb: "deleted a comment on",
        entityTitle,
        entityTypeBadge: "Comment",
        destinationLink,
        contextSnippet: { type: "none" },
        relativeTime,
        fullTime,
      };

    case "PROJECT_CREATED":
    case "CREATE_PROJECT":
      return {
        icon: FolderPlus,
        iconBgClass: "bg-primary/10",
        iconColorClass: "text-primary",
        badgeBorderClass: "border-primary/25",
        actionVerb: "created project",
        entityTitle,
        entityTypeBadge: "Project",
        destinationLink,
        contextSnippet: { type: "none" },
        relativeTime,
        fullTime,
      };

    case "PROJECT_UPDATED":
    case "UPDATE_PROJECT":
      return {
        icon: Activity,
        iconBgClass: "bg-primary/10",
        iconColorClass: "text-primary/80",
        badgeBorderClass: "border-primary/25",
        actionVerb: "updated project",
        entityTitle,
        entityTypeBadge: "Project",
        destinationLink,
        contextSnippet: { type: "none" },
        relativeTime,
        fullTime,
      };

    case "PROJECT_DELETED":
    case "DELETE_PROJECT":
      return {
        icon: Trash2,
        iconBgClass: "bg-rose-500/10",
        iconColorClass: "text-rose-500 dark:text-rose-400",
        badgeBorderClass: "border-rose-500/25",
        actionVerb: "deleted project",
        entityTitle,
        entityTypeBadge: "Project",
        destinationLink: null,
        contextSnippet: { type: "none" },
        relativeTime,
        fullTime,
      };

    case "CREATE_PHASE":
    case "UPDATE_PHASE":
    case "DELETE_PHASE":
    case "REORDER_PHASES":
      return {
        icon: Layers,
        iconBgClass: "bg-purple-500/10",
        iconColorClass: "text-purple-500 dark:text-purple-400",
        badgeBorderClass: "border-purple-500/25",
        actionVerb: action.toLowerCase().replace(/_/g, " "),
        entityTitle,
        entityTypeBadge: "Phase",
        destinationLink,
        contextSnippet: { type: "none" },
        relativeTime,
        fullTime,
      };

    case "INVITE_MEMBER":
    case "UPDATE_MEMBER_ROLE":
    case "REMOVE_MEMBER":
      return {
        icon: Shield,
        iconBgClass: "bg-cyan-500/10",
        iconColorClass: "text-cyan-500 dark:text-cyan-400",
        badgeBorderClass: "border-cyan-500/25",
        actionVerb: action.toLowerCase().replace(/_/g, " "),
        entityTitle,
        entityTypeBadge: "Member",
        destinationLink: "/team",
        contextSnippet: { type: "none" },
        relativeTime,
        fullTime,
      };

    case "AI_EXECUTION_COMPLETED":
      return {
        icon: Bot,
        iconBgClass: "bg-violet-500/10",
        iconColorClass: "text-violet-500 dark:text-violet-400",
        badgeBorderClass: "border-violet-500/25",
        actionVerb: "executed AI plan",
        entityTitle,
        entityTypeBadge: "AI",
        destinationLink: null,
        contextSnippet: { type: "none" },
        relativeTime,
        fullTime,
      };

    default:
      // Graceful unknown event fallback
      return {
        icon: item.actorType === "SYSTEM" ? Zap : Clock,
        iconBgClass: "bg-muted/40",
        iconColorClass: "text-muted-foreground",
        badgeBorderClass: "border-border/60",
        actionVerb: action.toLowerCase().replace(/_/g, " "),
        entityTitle,
        entityTypeBadge: item.entityType || "Audit",
        destinationLink,
        contextSnippet: { type: "none" },
        relativeTime,
        fullTime,
      };
  }
}
