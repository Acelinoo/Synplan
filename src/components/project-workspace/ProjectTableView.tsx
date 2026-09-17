"use client";

import * as React from "react";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Layers,
  Flag,
  Calendar,
  CheckCircle2,
  MoreHorizontal,
} from "lucide-react";
import { TableViewRow, TaskStatus, TaskPriority } from "@/types";
import {
  PriorityBadge,
  StatusBadge,
  DueDateChip,
  TaskBlockedChip,
  SubtaskProgressChip,
} from "@/components/ui";
import { cn } from "@/lib/utils";

interface ProjectTableViewProps {
  tasks: any[];
  onSelectTask: (task: any) => void;
  onStatusToggle: (taskId: string, currentStatus: string) => void;
  showProject?: boolean;
  selectedTaskIds?: string[];
  onToggleSelectTask?: (taskId: string) => void;
  onSelectAllTasks?: (taskIds: string[]) => void;
}

type SortField = "title" | "project" | "status" | "priority" | "dueDate" | "phase";
type SortOrder = "asc" | "desc" | null;

const priorityWeight: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function ProjectTableView({
  tasks,
  onSelectTask,
  onStatusToggle,
  showProject,
  selectedTaskIds,
  onToggleSelectTask,
  onSelectAllTasks,
}: ProjectTableViewProps) {
  const [sortField, setSortField] = React.useState<SortField | null>(null);
  const [sortOrder, setSortOrder] = React.useState<SortOrder>(null);

  const hasProject = showProject ?? tasks.some((t) => Boolean(t.project));

  const handleSort = (field: SortField) => {
    if (sortField !== field) {
      setSortField(field);
      setSortOrder("asc");
    } else if (sortOrder === "asc") {
      setSortOrder("desc");
    } else {
      setSortField(null);
      setSortOrder(null);
    }
  };

  const sortedTasks = React.useMemo(() => {
    if (!sortField || !sortOrder) return tasks;

    return [...tasks].sort((a, b) => {
      let cmp = 0;
      if (sortField === "title") {
        cmp = (a.title || "").localeCompare(b.title || "");
      } else if (sortField === "project") {
        const pA = a.project?.name || "";
        const pB = b.project?.name || "";
        cmp = pA.localeCompare(pB);
      } else if (sortField === "status") {
        cmp = (a.status || "").localeCompare(b.status || "");
      } else if (sortField === "priority") {
        const pA = priorityWeight[(a.priority || "medium").toLowerCase()] || 0;
        const pB = priorityWeight[(b.priority || "medium").toLowerCase()] || 0;
        cmp = pA - pB;
      } else if (sortField === "dueDate") {
        const dA = a.dueDate ? new Date(a.dueDate).getTime() : 0;
        const dB = b.dueDate ? new Date(b.dueDate).getTime() : 0;
        cmp = dA - dB;
      } else if (sortField === "phase") {
        const phA = a.phase?.name || "";
        const phB = b.phase?.name || "";
        cmp = phA.localeCompare(phB);
      }
      return sortOrder === "desc" ? -cmp : cmp;
    });
  }, [tasks, sortField, sortOrder]);

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-12 text-center text-xs text-muted-foreground">
        No tasks matching criteria.
      </div>
    );
  }

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortOrder === "asc" ? (
      <ArrowUp className="h-3 w-3 text-primary" />
    ) : (
      <ArrowDown className="h-3 w-3 text-primary" />
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface-muted/60 text-muted-foreground font-semibold">
              {onToggleSelectTask && (
                <th className="w-8 py-2.5 pl-3">
                  <input
                    type="checkbox"
                    checked={sortedTasks.length > 0 && selectedTaskIds?.length === sortedTasks.length}
                    onChange={(e) => {
                      if (!onSelectAllTasks) return;
                      if (e.target.checked) {
                        onSelectAllTasks(sortedTasks.map((t) => t.id));
                      } else {
                        onSelectAllTasks([]);
                      }
                    }}
                    className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                    aria-label="Select all tasks"
                  />
                </th>
              )}
              <th className="w-8 py-2.5 pl-3"></th>
              <th
                onClick={() => handleSort("title")}
                className="py-2.5 px-3 cursor-pointer select-none hover:text-foreground transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Task</span>
                  {renderSortIcon("title")}
                </div>
              </th>
              {hasProject && (
                <th
                  onClick={() => handleSort("project")}
                  className="py-2.5 px-3 cursor-pointer select-none hover:text-foreground transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Project</span>
                    {renderSortIcon("project")}
                  </div>
                </th>
              )}
              <th
                onClick={() => handleSort("status")}
                className="py-2.5 px-3 cursor-pointer select-none hover:text-foreground transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Status</span>
                  {renderSortIcon("status")}
                </div>
              </th>
              <th
                onClick={() => handleSort("priority")}
                className="py-2.5 px-3 cursor-pointer select-none hover:text-foreground transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Priority</span>
                  {renderSortIcon("priority")}
                </div>
              </th>
              <th className="py-2.5 px-3">Assignee</th>
              <th
                onClick={() => handleSort("dueDate")}
                className="py-2.5 px-3 cursor-pointer select-none hover:text-foreground transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Due Date</span>
                  {renderSortIcon("dueDate")}
                </div>
              </th>
              <th
                onClick={() => handleSort("phase")}
                className="py-2.5 px-3 cursor-pointer select-none hover:text-foreground transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Phase</span>
                  {renderSortIcon("phase")}
                </div>
              </th>
              <th className="py-2.5 px-3">Subtasks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 font-normal">
            {sortedTasks.map((t) => {
              const isDone = (t.status || "").toLowerCase() === "done";
              const assigneeInitial = (t.assignee?.name || "U").charAt(0).toUpperCase();

              return (
                <tr
                  key={t.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`Inspect task: ${t.title}`}
                  onClick={() => onSelectTask(t)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectTask(t);
                    }
                  }}
                  className={cn(
                    "hover:bg-surface-muted/40 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                    selectedTaskIds?.includes(t.id) && "bg-primary/5",
                    t.isBlocked && "bg-destructive/5"
                  )}
                >
                  {/* Select row checkbox */}
                  {onToggleSelectTask && (
                    <td className="w-8 py-2.5 pl-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedTaskIds?.includes(t.id) || false}
                        onChange={() => onToggleSelectTask(t.id)}
                        className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                        aria-label={`Select task ${t.title}`}
                      />
                    </td>
                  )}

                  {/* Complete checkbox */}
                  <td className="w-8 py-2.5 pl-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStatusToggle(t.id, t.status);
                      }}
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors cursor-pointer",
                        isDone
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-border hover:border-foreground/60 bg-card"
                      )}
                      aria-label={isDone ? "Mark incomplete" : "Mark complete"}
                    >
                      {isDone && <CheckCircle2 className="h-3 w-3" />}
                    </button>
                  </td>

                  {/* Title & Blocked badge */}
                  <td className="py-2.5 px-3 font-semibold text-foreground max-w-xs truncate">
                    <div className="flex items-center gap-2 truncate">
                      <span className={cn(isDone && "line-through text-muted-foreground")}>
                        {t.title}
                      </span>
                      {t.isBlocked && <TaskBlockedChip isBlocked={true} blockersCount={1} />}
                    </div>
                  </td>

                  {/* Project Column */}
                  {hasProject && (
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {t.project ? (
                        <div className="flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: t.project.color || "#6366f1" }}
                          />
                          <span className="text-[11px] font-mono text-foreground font-medium truncate max-w-[120px]">
                            {t.project.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/50 italic text-[11px]">—</span>
                      )}
                    </td>
                  )}

                  {/* Status */}
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <StatusBadge status={t.status} />
                  </td>

                  {/* Priority */}
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <PriorityBadge priority={t.priority} />
                  </td>

                  {/* Assignee */}
                  <td className="py-2.5 px-3 whitespace-nowrap font-mono">
                    {t.assignee ? (
                      <div className="flex items-center gap-1.5">
                        <div className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary">
                          {assigneeInitial}
                        </div>
                        <span className="text-[11px] truncate max-w-[100px]">{t.assignee.name}</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/60 italic">Unassigned</span>
                    )}
                  </td>

                  {/* Due Date */}
                  <td className="py-2.5 px-3 whitespace-nowrap font-mono">
                    <DueDateChip dueDate={t.dueDate} />
                  </td>

                  {/* Phase */}
                  <td className="py-2.5 px-3 whitespace-nowrap text-muted-foreground font-mono">
                    {t.phase?.name ? (
                      <span className="truncate max-w-[120px] block">{t.phase.name}</span>
                    ) : (
                      <span className="text-muted-foreground/50 italic">—</span>
                    )}
                  </td>

                  {/* Subtasks progress */}
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {t.subtasksSummary && t.subtasksSummary.total > 0 ? (
                      <SubtaskProgressChip
                        completed={t.subtasksSummary.completed}
                        total={t.subtasksSummary.total}
                      />
                    ) : t.subtasks && t.subtasks.length > 0 ? (
                      <SubtaskProgressChip
                        completed={t.subtasks.filter((s: any) => s.completed).length}
                        total={t.subtasks.length}
                      />
                    ) : (
                      <span className="text-[10px] text-muted-foreground/50 font-mono italic">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
