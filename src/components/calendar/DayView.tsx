"use client";

import * as React from "react";
import { Clock, Calendar, CheckSquare, Flag } from "lucide-react";
import { Task, TaskStatus } from "@/types";
import { cn } from "@/lib/utils";

interface DayViewProps {
  currentDate: Date;
  tasks: Task[];
  onSelectTask?: (task: Task) => void;
}

const hours = [
  "08:00", "09:00", "10:00", "11:00", "12:00",
  "13:00", "14:00", "15:00", "16:00", "17:00", "18:00",
];

const statusColorMap: Record<TaskStatus, { bg: string; text: string; border: string }> = {
  todo: { bg: "bg-status-todo/10", text: "text-muted-foreground", border: "border-status-todo/30" },
  in_progress: { bg: "bg-status-progress/10", text: "text-status-progress", border: "border-status-progress/30" },
  in_review: { bg: "bg-status-review/10", text: "text-status-review", border: "border-status-review/30" },
  done: { bg: "bg-status-done/10", text: "text-status-done", border: "border-status-done/30" },
};

export function DayView({ currentDate, tasks, onSelectTask }: DayViewProps) {
  const dateStr = currentDate.toISOString().split("T")[0];
  const dayTasks = tasks.filter((t) => t.dueDate === dateStr || true); // show today's tasks or active backlog

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Date Header */}
      <div className="border-b border-border bg-surface/60 p-4 text-center">
        <h3 className="text-sm font-bold text-foreground">
          {currentDate.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5 font-mono">
          {dayTasks.length} Scheduled Deliverable{dayTasks.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Hourly Timeline */}
      <div className="divide-y divide-border/60">
        {hours.map((hour, idx) => {
          const taskForHour = dayTasks.length > 0 ? dayTasks[idx % dayTasks.length] : null;

          return (
            <div key={hour} className="flex items-start min-h-[56px] p-3 hover:bg-surface/30 transition-colors">
              <span className="w-16 shrink-0 text-xs font-mono font-semibold text-muted-foreground">
                {hour}
              </span>

              <div className="flex-1 min-w-0 pl-4 border-l border-border/80">
                {taskForHour && idx < dayTasks.length ? (
                  <div
                    onClick={() => onSelectTask?.(taskForHour)}
                    className={cn(
                      "cursor-pointer rounded-lg border p-2.5 transition-all hover:scale-[1.01]",
                      statusColorMap[taskForHour.status].bg,
                      statusColorMap[taskForHour.status].border
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-bold text-foreground">
                        {taskForHour.title}
                      </h4>
                      <span className="rounded px-1.5 py-0.5 text-[9px] font-mono uppercase font-bold bg-card border border-border">
                        {taskForHour.priority}
                      </span>
                    </div>
                    {taskForHour.description && (
                      <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">
                        {taskForHour.description}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="h-full flex items-center">
                    <span className="text-[11px] text-muted-foreground/30 italic">
                      No events scheduled
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
