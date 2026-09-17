"use client";

import * as React from "react";
import {
  Check,
  CheckCircle2,
  Circle,
  Clock,
  ArrowRight,
  ExternalLink,
  FolderKanban,
  Flag,
} from "lucide-react";
import { MyWorkTaskItem, TaskStatus, TaskPriority } from "@/types";
import {
  StatusBadge,
  PriorityBadge,
  TaskBlockedChip,
  TaskDependencyChip,
  SubtaskProgressChip,
  DueDateChip,
} from "@/components/ui";
import { cn } from "@/lib/utils";

interface MyWorkTaskRowProps {
  task: MyWorkTaskItem;
  onSelect: (task: MyWorkTaskItem) => void;
  onQuickComplete?: (taskId: string, currentStatus: string) => void;
  variant?: "default" | "overdue" | "blocked" | "completed";
  className?: string;
}

export function MyWorkTaskRow({
  task,
  onSelect,
  onQuickComplete,
  variant = "default",
  className,
}: MyWorkTaskRowProps) {
  const normalizedStatus = (task.status?.toLowerCase() || "todo") as TaskStatus;
  const normalizedPriority = (task.priority?.toLowerCase() || "medium") as TaskPriority;
  const isCompleted = normalizedStatus === "done";

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(task);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(task)}
      onKeyDown={handleKeyDown}
      className={cn(
        "group relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border p-3 text-xs transition-all duration-150 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        variant === "overdue"
          ? "border-rose-500/25 bg-card hover:border-rose-500/50 hover:bg-rose-500/5"
          : variant === "blocked"
          ? "border-amber-500/25 bg-card hover:border-amber-500/50 hover:bg-amber-500/5"
          : variant === "completed"
          ? "border-border/50 bg-surface-muted/30 opacity-75 hover:opacity-100 hover:border-border"
          : "border-border bg-card hover:border-primary/40 hover:bg-muted/30",
        className
      )}
      aria-label={`Task: ${task.title}`}
    >
      {/* Left side: Status toggle / indicator + Title + Project context */}
      <div className="flex min-w-0 items-start gap-3 flex-1">
        {/* Quick action button or status icon */}
        {onQuickComplete ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onQuickComplete(task.id, normalizedStatus);
            }}
            className={cn(
              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-ring",
              isCompleted
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-border hover:border-primary hover:bg-primary/10 text-transparent hover:text-primary"
            )}
            title={isCompleted ? "Mark as Incomplete" : "Mark as Complete"}
            aria-label={isCompleted ? "Mark as Incomplete" : "Mark as Complete"}
          >
            <Check className="h-3 w-3 stroke-[3]" />
          </button>
        ) : (
          <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
            {isCompleted ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : task.isBlocked ? (
              <span className="h-2 w-2 rounded-full bg-rose-500" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-primary" />
            )}
          </div>
        )}

        <div className="min-w-0 flex-1">
          {/* Title */}
          <p
            className={cn(
              "font-medium text-xs leading-snug truncate transition-colors",
              isCompleted
                ? "text-muted-foreground line-through"
                : "text-foreground group-hover:text-primary"
            )}
          >
            {task.title}
          </p>

          {/* Project & Phase breadcrumb */}
          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground flex-wrap">
            {task.project && (
              <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: task.project.color || "#0F3D64" }}
                />
                <span className="truncate max-w-[120px]">{task.project.name}</span>
              </span>
            )}
            {task.phase && (
              <>
                <span className="text-muted-foreground/40">/</span>
                <span className="truncate max-w-[100px] text-muted-foreground">
                  {task.phase.name}
                </span>
              </>
            )}
            {task.milestone && (
              <>
                <span className="text-muted-foreground/40">/</span>
                <span className="truncate max-w-[100px] text-muted-foreground">
                  {task.milestone.title}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right side: Metadata Chips & Badges */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-2.5 flex-wrap sm:flex-nowrap">
        {/* Blocked Chip */}
        {task.isBlocked && (
          <TaskBlockedChip
            reason={
              task.blockersCount && task.blockersCount > 0
                ? `${task.blockersCount} active blocker${task.blockersCount > 1 ? "s" : ""}`
                : undefined
            }
          />
        )}

        {/* Subtask Progress */}
        {task.subtasksSummary && task.subtasksSummary.total > 0 && (
          <SubtaskProgressChip
            completed={task.subtasksSummary.completed}
            total={task.subtasksSummary.total}
          />
        )}

        {/* Due Date */}
        {task.dueDate && <DueDateChip dueDate={task.dueDate} />}

        {/* Priority Badge */}
        <PriorityBadge priority={normalizedPriority} size="sm" />

        {/* Status Badge */}
        <StatusBadge status={normalizedStatus} size="sm" />

        {/* Hover inspect arrow */}
        <ArrowRight className="hidden sm:block h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-primary" />
      </div>
    </div>
  );
}
