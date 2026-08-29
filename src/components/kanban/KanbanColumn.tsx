"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Task, TaskStatus } from "@/types";
import { KanbanCard } from "./KanbanCard";
import { cn } from "@/lib/utils";

interface KanbanColumnProps {
  status: TaskStatus;
  title: string;
  dotColor: string;
  tasks: Task[];
  onAddTask: (status: TaskStatus) => void;
  onEditTask: (task: Task) => void;
  onSelectTask: (task: Task) => void;
}

export function KanbanColumn({
  status,
  title,
  dotColor,
  tasks,
  onAddTask,
  onEditTask,
  onSelectTask,
}: KanbanColumnProps) {
  return (
    <div className="flex h-full min-w-[280px] max-w-[320px] flex-1 flex-col rounded-xl border border-border/80 bg-surface/40 p-3 shadow-inner">
      {/* Column Header */}
      <div className="flex items-center justify-between pb-3 px-1 border-b border-border/50">
        <div className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 rounded-full", dotColor)} />
          <h3 className="text-xs font-bold text-foreground tracking-wide uppercase">
            {title}
          </h3>
          <span className="rounded-full bg-card border border-border px-2 py-0.5 text-[10px] font-mono font-bold text-muted-foreground">
            {tasks.length}
          </span>
        </div>

        <button
          onClick={() => onAddTask(status)}
          className="rounded p-1 text-muted-foreground hover:bg-card hover:text-foreground transition-colors"
          title={`Add task to ${title}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Cards List */}
      <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-0.5 min-h-[300px]">
        {tasks.length === 0 ? (
          <div className="flex h-28 flex-col items-center justify-center rounded-lg border border-dashed border-border/60 p-4 text-center">
            <p className="text-[11px] text-muted-foreground">No tasks in this lane</p>
            <button
              onClick={() => onAddTask(status)}
              className="mt-1 text-[11px] font-semibold text-primary hover:underline"
            >
              + Add a task
            </button>
          </div>
        ) : (
          tasks.map((task) => (
            <KanbanCard
              key={task.id}
              task={task}
              onEdit={onEditTask}
              onSelect={onSelectTask}
            />
          ))
        )}
      </div>
    </div>
  );
}
