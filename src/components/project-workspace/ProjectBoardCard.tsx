"use client";

import * as React from "react";
import {
  Calendar,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Layers,
  Ban,
  Clock,
  CheckCircle2,
  AlertOctagon,
} from "lucide-react";
import { Task, TaskStatus, TaskPriority, BoardTaskCard } from "@/types";
import {
  PriorityBadge,
  StatusBadge,
  DueDateChip,
  TaskBlockedChip,
  SubtaskProgressChip,
} from "@/components/ui";
import { cn } from "@/lib/utils";

interface ProjectBoardCardProps {
  task: BoardTaskCard;
  onSelect: (task: any) => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
}

const BOARD_STATUS_LIST: TaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "done",
  "cancelled",
];

export function ProjectBoardCard({
  task,
  onSelect,
  onStatusChange,
}: ProjectBoardCardProps) {
  const currentStatus = (task.status || "todo").toLowerCase() as TaskStatus;
  const currentIdx = BOARD_STATUS_LIST.indexOf(currentStatus);

  const canMovePrev = currentIdx > 0;
  const canMoveNext = currentIdx >= 0 && currentIdx < BOARD_STATUS_LIST.length - 1;

  const handleShiftStatus = (direction: "prev" | "next", e: React.MouseEvent) => {
    e.stopPropagation();
    const nextIdx = direction === "prev" ? currentIdx - 1 : currentIdx + 1;
    if (nextIdx >= 0 && nextIdx < BOARD_STATUS_LIST.length) {
      onStatusChange(task.id, BOARD_STATUS_LIST[nextIdx]);
    }
  };

  const handleSelectStatus = (e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    onStatusChange(task.id, e.target.value as TaskStatus);
  };

  const assigneeInitial = (task.assignee?.name || "U").charAt(0).toUpperCase();

  return (
    <div
      tabIndex={0}
      role="button"
      aria-label={`Inspect task: ${task.title}`}
      onClick={() => onSelect(task)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(task);
        }
      }}
      className={cn(
        "group relative flex flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-2xs transition-all",
        "hover:border-border-strong hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer",
        task.isBlocked && "border-destructive/40 bg-destructive/5"
      )}
    >
      {/* Top row: Priority & Status Controls */}
      <div className="flex items-center justify-between gap-1.5">
        <PriorityBadge priority={task.priority} />

        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
          {/* Quick status dropdown for accessible state transition */}
          <select
            value={currentStatus}
            onClick={(e) => e.stopPropagation()}
            onChange={handleSelectStatus}
            className="rounded border border-border/60 bg-surface-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer"
            aria-label="Change status"
          >
            {BOARD_STATUS_LIST.map((st) => (
              <option key={st} value={st}>
                {st.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Task Title */}
      <h4 className="text-xs font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
        {task.title}
      </h4>

      {/* Contextual Chips: Blocked & Subtasks */}
      <div className="flex flex-wrap items-center gap-1.5 empty:hidden">
        {task.isBlocked && <TaskBlockedChip isBlocked={true} blockersCount={1} />}
        {task.subtasksSummary && task.subtasksSummary.total > 0 && (
          <SubtaskProgressChip
            completed={task.subtasksSummary.completed}
            total={task.subtasksSummary.total}
          />
        )}
        {task.project && (
          <span
            className="inline-flex items-center gap-1 rounded bg-surface-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono truncate max-w-[120px]"
            title={task.project.name}
          >
            <span
              className="h-1.5 w-1.5 rounded-full shrink-0"
              style={{ backgroundColor: task.project.color || "#6366f1" }}
            />
            <span className="truncate">{task.project.name}</span>
          </span>
        )}
        {task.phase && (
          <span className="inline-flex items-center gap-1 rounded bg-surface-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono truncate max-w-[120px]">
            <Layers className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{task.phase.name}</span>
          </span>
        )}
      </div>

      {/* Bottom Metadata: Due Date & Assignee */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40 text-[11px] text-muted-foreground font-mono">
        <DueDateChip dueDate={task.dueDate} />

        {task.assignee ? (
          <div
            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary"
            title={task.assignee.name}
          >
            {assigneeInitial}
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground/60 italic">Unassigned</span>
        )}
      </div>
    </div>
  );
}
