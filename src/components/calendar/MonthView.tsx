"use client";

import * as React from "react";
import { Task, TaskStatus } from "@/types";
import { cn } from "@/lib/utils";

interface MonthViewProps {
  currentDate: Date;
  tasks: Task[];
  onSelectDate?: (dateStr: string) => void;
  onSelectTask?: (task: Task) => void;
}

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const statusColorMap: Record<TaskStatus, { bg: string; text: string }> = {
  todo: { bg: "bg-status-todo/15 hover:bg-status-todo/25", text: "text-muted-foreground" },
  in_progress: { bg: "bg-status-progress/15 hover:bg-status-progress/25", text: "text-status-progress" },
  in_review: { bg: "bg-status-review/15 hover:bg-status-review/25", text: "text-status-review" },
  done: { bg: "bg-status-done/15 hover:bg-status-done/25", text: "text-status-done" },
};

export function MonthView({ currentDate, tasks, onSelectDate, onSelectTask }: MonthViewProps) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const todayStr = new Date().toISOString().split("T")[0];

  // Build grid calendar cells (42 cells: 6 rows x 7 cols)
  const cells: { dateStr: string; dayNum: number; isCurrentMonth: boolean; isToday: boolean }[] = [];

  // Prev month filler
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ dateStr, dayNum: d, isCurrentMonth: false, isToday: dateStr === todayStr });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ dateStr, dayNum: d, isCurrentMonth: true, isToday: dateStr === todayStr });
  }

  // Next month filler to make 35 or 42
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ dateStr, dayNum: d, isCurrentMonth: false, isToday: dateStr === todayStr });
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Weekday labels */}
      <div className="grid grid-cols-7 border-b border-border bg-surface/60 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {weekDays.map((w) => (
          <div key={w} className="py-2.5">
            {w}
          </div>
        ))}
      </div>

      {/* Grid Cells */}
      <div className="grid grid-cols-7 divide-x divide-y divide-border/60">
        {cells.map((cell, idx) => {
          const dayTasks = tasks.filter((t) => t.dueDate === cell.dateStr);

          return (
            <div
              key={idx}
              onClick={() => onSelectDate?.(cell.dateStr)}
              className={cn(
                "group min-h-[105px] p-2 transition-colors flex flex-col justify-between",
                cell.isCurrentMonth ? "bg-card hover:bg-surface/50" : "bg-muted/10 text-muted-foreground/50",
                cell.isToday && "bg-primary/5"
              )}
            >
              {/* Day number */}
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-mono font-medium",
                    cell.isToday
                      ? "bg-primary text-primary-foreground font-bold"
                      : cell.isCurrentMonth
                      ? "text-foreground"
                      : "text-muted-foreground/60"
                  )}
                >
                  {cell.dayNum}
                </span>

                {dayTasks.length > 0 && (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {dayTasks.length} task{dayTasks.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Tasks List in Cell */}
              <div className="mt-1.5 space-y-1 overflow-hidden flex-1">
                {dayTasks.slice(0, 2).map((t) => {
                  const style = statusColorMap[t.status] || statusColorMap.todo;
                  return (
                    <div
                      key={t.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTask?.(t);
                      }}
                      className={cn(
                        "truncate rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer",
                        style.bg,
                        style.text
                      )}
                      title={t.title}
                    >
                      {t.title}
                    </div>
                  );
                })}
                {dayTasks.length > 2 && (
                  <p className="text-[9px] font-mono text-muted-foreground pl-1">
                    +{dayTasks.length - 2} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
