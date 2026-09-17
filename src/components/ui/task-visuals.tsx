import * as React from "react";
import { Ban, Link2, CheckSquare, Calendar, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

/** Blocked Task Status Chip */
export function TaskBlockedChip({
  reason,
  blockersCount,
  isBlocked,
  className,
}: {
  reason?: string;
  blockersCount?: number;
  isBlocked?: boolean;
  className?: string;
}) {
  const countLabel = blockersCount && blockersCount > 1 ? ` (${blockersCount})` : "";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 px-1.5 py-0.2 text-[10px] font-medium select-none",
        className
      )}
      title={reason ? `Blocked: ${reason}` : blockersCount ? `Blocked by ${blockersCount} tasks` : "Task is blocked"}
    >
      <Ban className="h-3 w-3 shrink-0" />
      <span>Blocked{countLabel}</span>
    </span>
  );
}

/** Dependency Indicator Chip */
export function TaskDependencyChip({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] text-muted-foreground font-mono select-none",
        className
      )}
      title={`${count} task dependencies`}
    >
      <Link2 className="h-3 w-3 shrink-0" />
      <span>{count}</span>
    </span>
  );
}

/** Subtask Progress Indicator */
export function SubtaskProgressChip({
  completed,
  total,
  className,
}: {
  completed: number;
  total: number;
  className?: string;
}) {
  if (total <= 0) return null;
  const isDone = completed === total;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-mono select-none",
        isDone ? "text-emerald-500" : "text-muted-foreground",
        className
      )}
      title={`${completed} of ${total} subtasks completed`}
    >
      <CheckSquare className="h-3 w-3 shrink-0" />
      <span>
        {completed}/{total}
      </span>
    </span>
  );
}

/** Due Date Indicator Chip */
export function DueDateChip({
  dueDate,
  className,
}: {
  dueDate?: string | Date | null;
  className?: string;
}) {
  if (!dueDate) return null;
  const dateObj = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  if (isNaN(dateObj.getTime())) return null;

  const now = new Date();
  const isOverdue = dateObj.getTime() < now.getTime() && dateObj.toDateString() !== now.toDateString();
  const isToday = dateObj.toDateString() === now.toDateString();

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-mono select-none",
        isOverdue
          ? "text-rose-600 dark:text-rose-400 font-semibold"
          : isToday
          ? "text-amber-600 dark:text-amber-400 font-medium"
          : "text-muted-foreground",
        className
      )}
      title={`Due: ${dateObj.toLocaleDateString()}`}
    >
      <Calendar className="h-3 w-3 shrink-0" />
      <span>
        {dateObj.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
      </span>
    </span>
  );
}

/** Comments Counter Chip */
export function CommentsChip({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] text-muted-foreground font-mono select-none",
        className
      )}
      title={`${count} comments`}
    >
      <MessageSquare className="h-3 w-3 shrink-0" />
      <span>{count}</span>
    </span>
  );
}
