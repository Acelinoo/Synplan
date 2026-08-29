"use client";

import * as React from "react";
import { Task, TaskStatus } from "@/types";
import { cn } from "@/lib/utils";

interface WeekViewProps {
  currentDate: Date;
  tasks: Task[];
  onSelectTask?: (task: Task) => void;
}

const statusColorMap: Record<TaskStatus, { bg: string; text: string; border: string }> = {
  todo: { bg: "bg-status-todo/10", text: "text-muted-foreground", border: "border-status-todo/30" },
  in_progress: { bg: "bg-status-progress/10", text: "text-status-progress", border: "border-status-progress/30" },
  in_review: { bg: "bg-status-review/10", text: "text-status-review", border: "border-status-review/30" },
  done: { bg: "bg-status-done/10", text: "text-status-done", border: "border-status-done/30" },
};

export function WeekView({ currentDate, tasks, onSelectTask }: WeekViewProps) {
  // Get Monday or Sunday of current week
  const startOfWeek = new Date(currentDate);
  const day = startOfWeek.getDay();
  startOfWeek.setDate(startOfWeek.getDate() - day);

  const todayStr = new Date().toISOString().split("T")[0];

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    return {
      date: d,
      dateStr,
      dayName: d.toLocaleDateString("en-US", { weekday: "short" }),
      dayNum: d.getDate(),
      isToday: dateStr === todayStr,
    };
  });

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      {/* 7 Days Column Header */}
      <div className="grid grid-cols-7 border-b border-border bg-surface/60 divide-x divide-border">
        {weekDays.map((wd) => (
          <div
            key={wd.dateStr}
            className={cn("p-3 text-center", wd.isToday && "bg-primary/5")}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {wd.dayName}
            </p>
            <span
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-mono font-bold mt-1",
                wd.isToday
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground"
              )}
            >
              {wd.dayNum}
            </span>
          </div>
        ))}
      </div>

      {/* Week Day Lanes */}
      <div className="grid grid-cols-7 divide-x divide-border min-h-[380px]">
        {weekDays.map((wd) => {
          const dayTasks = tasks.filter((t) => t.dueDate === wd.dateStr);

          return (
            <div
              key={wd.dateStr}
              className={cn("p-2 space-y-2", wd.isToday && "bg-primary/5")}
            >
              {dayTasks.length === 0 ? (
                <p className="text-[10px] text-muted-foreground/40 text-center pt-8 italic">
                  No tasks
                </p>
              ) : (
                dayTasks.map((t) => {
                  const style = statusColorMap[t.status] || statusColorMap.todo;
                  return (
                    <div
                      key={t.id}
                      onClick={() => onSelectTask?.(t)}
                      className={cn(
                        "cursor-pointer rounded-md border p-2 text-xs transition-all hover:scale-[1.02] shadow-xs",
                        style.bg,
                        style.border
                      )}
                    >
                      <p className="font-bold text-foreground text-[11px] line-clamp-1">
                        {t.title}
                      </p>
                      <div className="mt-1 flex items-center justify-between text-[9px] font-mono">
                        <span className={cn("capitalize font-semibold", style.text)}>
                          {t.status.replace("_", " ")}
                        </span>
                        <span className="uppercase font-bold text-foreground/80">
                          {t.priority}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
