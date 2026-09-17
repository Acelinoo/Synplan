"use client";

import * as React from "react";
import { Plus, CheckSquare } from "lucide-react";
import { TaskStatus, BoardViewData, BoardTaskCard } from "@/types";
import { ProjectBoardCard } from "./ProjectBoardCard";
import { cn } from "@/lib/utils";

interface ProjectBoardViewProps {
  boardData: BoardViewData | null;
  onSelectTask: (task: any) => void;
  onAddTask: (status?: TaskStatus) => void;
  onStatusChange: (taskId: string, nextStatus: TaskStatus) => void;
  filteredTasks?: any[];
  isFiltered?: boolean;
}

interface ColumnMeta {
  status: TaskStatus;
  title: string;
  dotColor: string;
}

const DEFAULT_COLUMNS: ColumnMeta[] = [
  { status: "backlog", title: "Backlog", dotColor: "bg-slate-400" },
  { status: "todo", title: "To Do", dotColor: "bg-status-todo" },
  { status: "in_progress", title: "In Progress", dotColor: "bg-status-progress" },
  { status: "in_review", title: "In Review", dotColor: "bg-status-review" },
  { status: "blocked", title: "Blocked", dotColor: "bg-destructive" },
  { status: "done", title: "Done", dotColor: "bg-status-done" },
  { status: "cancelled", title: "Cancelled", dotColor: "bg-muted-foreground" },
];

export function ProjectBoardView({
  boardData,
  onSelectTask,
  onAddTask,
  onStatusChange,
  filteredTasks,
  isFiltered = false,
}: ProjectBoardViewProps) {
  // If client-side filters are active, re-distribute the filtered tasks into columns
  const columnsData = React.useMemo(() => {
    if (!boardData) return {};

    if (!isFiltered || !filteredTasks) {
      return boardData.columns || {};
    }

    const colMap: Record<string, { status: TaskStatus; label: string; count: number; tasks: BoardTaskCard[] }> = {};
    for (const col of DEFAULT_COLUMNS) {
      colMap[col.status] = {
        status: col.status,
        label: col.title,
        count: 0,
        tasks: [],
      };
    }

    for (const t of filteredTasks) {
      const st = (t.status || "todo").toLowerCase();
      if (colMap[st]) {
        colMap[st].tasks.push(t);
        colMap[st].count++;
      }
    }

    return colMap;
  }, [boardData, filteredTasks, isFiltered]);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 pt-1 min-h-[500px]">
      {DEFAULT_COLUMNS.map((col) => {
        const rawColKey = col.status.toUpperCase();
        const lowerColKey = col.status.toLowerCase();
        const colData = columnsData[rawColKey] || columnsData[lowerColKey] || {
          status: col.status,
          label: col.title,
          count: 0,
          tasks: [],
        };

        const tasksList = colData.tasks || [];

        return (
          <div
            key={col.status}
            className="flex h-full min-w-[270px] max-w-[310px] flex-1 flex-col rounded-lg border border-border bg-surface-muted/30 p-2.5"
          >
            {/* Column Header */}
            <div className="flex items-center justify-between pb-2 px-1 border-b border-border/60">
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", col.dotColor)} aria-hidden="true" />
                <h3 className="text-xs font-bold text-foreground tracking-wider uppercase font-mono">
                  {col.title}
                </h3>
                <span className="rounded-sm bg-surface border border-border px-1.5 py-0.5 text-[10px] font-mono font-medium text-muted-foreground">
                  {tasksList.length}
                </span>
              </div>

              <button
                onClick={() => onAddTask(col.status)}
                className="rounded p-1 text-muted-foreground hover:bg-card hover:text-foreground transition-colors cursor-pointer"
                title={`Add task to ${col.title}`}
                aria-label={`Add task to ${col.title}`}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Cards List in Lane */}
            <div className="mt-3 flex-1 space-y-2.5 overflow-y-auto pr-0.5 min-h-[300px]">
              {tasksList.length === 0 ? (
                <div className="flex h-28 flex-col items-center justify-center rounded-lg border border-dashed border-border/60 p-4 text-center">
                  <p className="text-[11px] text-muted-foreground">No tasks in this lane</p>
                  <button
                    onClick={() => onAddTask(col.status)}
                    className="mt-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                  >
                    + Add a task
                  </button>
                </div>
              ) : (
                tasksList.map((task) => (
                  <ProjectBoardCard
                    key={task.id}
                    task={task}
                    onSelect={onSelectTask}
                    onStatusChange={onStatusChange}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
