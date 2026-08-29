export type DueDateStatus =
  | "completed"
  | "overdue"
  | "due_today"
  | "due_tomorrow"
  | "due_soon"
  | "scheduled"
  | "no_date";

export interface DueDateInfo {
  status: DueDateStatus;
  label: string;
  badgeClass: string;
  daysRemaining?: number;
}

/**
 * Deterministic calculation of progress percentage (0 - 100).
 * Always returns 0 when totalTasks is 0, never NaN.
 */
export function calculateProgress(completedTasks: number, totalTasks: number): number {
  if (!totalTasks || totalTasks <= 0) return 0;
  if (completedTasks <= 0) return 0;
  const percentage = Math.round((completedTasks / totalTasks) * 100);
  return Math.min(100, Math.max(0, percentage));
}

/**
 * Due Date Intelligence: computes exact deterministic state and humanized presentation.
 */
export function getDueDateState(
  dueDate?: string | Date | null,
  taskStatus?: string,
  completedAt?: string | Date | null
): DueDateInfo {
  const isDone = taskStatus?.toLowerCase() === "done" || Boolean(completedAt);

  if (!dueDate) {
    return {
      status: "no_date",
      label: isDone ? "Completed" : "No Due Date",
      badgeClass: "bg-muted text-muted-foreground border-border",
    };
  }

  if (isDone) {
    return {
      status: "completed",
      label: "Completed",
      badgeClass: "bg-status-done/10 text-status-done border-status-done/30",
    };
  }

  const due = new Date(dueDate);
  const now = new Date();

  // Reset hours to start of day for clean day diff comparison
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const diffMs = dueDay - todayDay;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return {
      status: "overdue",
      label: overdueDays === 1 ? "Overdue by 1 day" : `Overdue by ${overdueDays} days`,
      badgeClass: "bg-destructive/10 text-destructive border-destructive/30",
      daysRemaining: diffDays,
    };
  }

  if (diffDays === 0) {
    return {
      status: "due_today",
      label: "Due Today",
      badgeClass: "bg-priority-urgent/15 text-priority-urgent border-priority-urgent/40",
      daysRemaining: 0,
    };
  }

  if (diffDays === 1) {
    return {
      status: "due_tomorrow",
      label: "Due Tomorrow",
      badgeClass: "bg-priority-high/15 text-priority-high border-priority-high/40",
      daysRemaining: 1,
    };
  }

  if (diffDays <= 3) {
    return {
      status: "due_soon",
      label: `Due in ${diffDays} days`,
      badgeClass: "bg-priority-medium/15 text-priority-medium border-priority-medium/40",
      daysRemaining: diffDays,
    };
  }

  return {
    status: "scheduled",
    label: due.toISOString().split("T")[0],
    badgeClass: "bg-muted/40 text-muted-foreground border-border/60",
    daysRemaining: diffDays,
  };
}
