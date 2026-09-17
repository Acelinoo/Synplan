"use client";

import * as React from "react";
import { AlertCircle, Ban, Clock, Calendar, Flame } from "lucide-react";
import { cn } from "@/lib/utils";

export type AttentionQueueKey = "all" | "overdue" | "blocked" | "dueToday" | "upcoming" | "highPriority";

interface AttentionMetric {
  key: AttentionQueueKey;
  label: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: "destructive" | "warning" | "primary" | "muted";
  description: string;
}

interface MyWorkAttentionBarProps {
  counts: {
    overdue: number;
    blocked: number;
    dueToday: number;
    upcoming: number;
    highPriority: number;
  };
  activeQueue: AttentionQueueKey;
  onSelectQueue: (queue: AttentionQueueKey) => void;
  className?: string;
}

export function MyWorkAttentionBar({
  counts,
  activeQueue,
  onSelectQueue,
  className,
}: MyWorkAttentionBarProps) {
  const metrics: AttentionMetric[] = [
    {
      key: "overdue",
      label: "Overdue",
      count: counts.overdue,
      icon: AlertCircle,
      tone: "destructive",
      description: "Needs immediate action",
    },
    {
      key: "blocked",
      label: "Blocked",
      count: counts.blocked,
      icon: Ban,
      tone: "warning",
      description: "Waiting on dependencies",
    },
    {
      key: "dueToday",
      label: "Due Today",
      count: counts.dueToday,
      icon: Clock,
      tone: "primary",
      description: "Today's delivery commitment",
    },
    {
      key: "upcoming",
      label: "Upcoming",
      count: counts.upcoming,
      icon: Calendar,
      tone: "muted",
      description: "Due in next 7 days",
    },
    {
      key: "highPriority",
      label: "High Priority",
      count: counts.highPriority,
      icon: Flame,
      tone: "warning",
      description: "Urgent & high tasks",
    },
  ];

  return (
    <div
      className={cn(
        "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 select-none",
        className
      )}
      role="region"
      aria-label="Attention Summary"
    >
      {metrics.map((m) => {
        const Icon = m.icon;
        const isSelected = activeQueue === m.key;
        const hasItems = m.count > 0;

        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onSelectQueue(activeQueue === m.key ? "all" : m.key)}
            className={cn(
              "flex flex-col justify-between rounded-md border p-3 text-left transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isSelected
                ? "border-primary bg-primary/5 ring-1 ring-primary/40 shadow-xs"
                : "border-border bg-card hover:border-border-strong hover:bg-muted/40",
              m.tone === "destructive" && hasItems && !isSelected && "border-rose-500/30 bg-rose-500/5",
              m.tone === "warning" && hasItems && !isSelected && "border-amber-500/30 bg-amber-500/5"
            )}
            aria-pressed={isSelected}
            aria-label={`${m.label}: ${m.count} tasks`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                {m.label}
              </span>
              <Icon
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  m.tone === "destructive" && hasItems
                    ? "text-rose-600 dark:text-rose-400"
                    : m.tone === "warning" && hasItems
                    ? "text-amber-600 dark:text-amber-400"
                    : m.tone === "primary" && hasItems
                    ? "text-primary"
                    : "text-muted-foreground/70"
                )}
              />
            </div>

            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span
                className={cn(
                  "font-mono text-xl sm:text-2xl font-bold tracking-tight",
                  m.tone === "destructive" && hasItems
                    ? "text-rose-600 dark:text-rose-400"
                    : m.tone === "warning" && hasItems
                    ? "text-amber-600 dark:text-amber-400"
                    : m.tone === "primary" && hasItems
                    ? "text-primary"
                    : "text-foreground"
                )}
              >
                {m.count}
              </span>
              <span className="text-[10px] text-muted-foreground truncate hidden xl:inline">
                {m.description}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
