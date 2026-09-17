"use client";

import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { MyWorkTaskItem } from "@/types";
import { MyWorkTaskRow } from "./MyWorkTaskRow";
import { EmptyState, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";

interface MyWorkQueueSectionProps {
  id: string;
  title: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  tasks: MyWorkTaskItem[];
  variant?: "default" | "overdue" | "blocked" | "completed";
  emptyTitle: string;
  emptyDescription: string;
  onSelectTask: (task: MyWorkTaskItem) => void;
  onQuickComplete?: (taskId: string, currentStatus: string) => void;
  defaultExpanded?: boolean;
  className?: string;
}

export function MyWorkQueueSection({
  id,
  title,
  description,
  icon: Icon,
  tasks,
  variant = "default",
  emptyTitle,
  emptyDescription,
  onSelectTask,
  onQuickComplete,
  defaultExpanded = true,
  className,
}: MyWorkQueueSectionProps) {
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);

  return (
    <section
      id={id}
      className={cn(
        "rounded-lg border bg-card transition-colors overflow-hidden",
        variant === "overdue" && tasks.length > 0
          ? "border-rose-500/30"
          : variant === "blocked" && tasks.length > 0
          ? "border-amber-500/30"
          : "border-border",
        className
      )}
      aria-labelledby={`${id}-header`}
    >
      {/* Section Header Bar */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "flex w-full items-center justify-between px-4 py-3 text-left transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          variant === "overdue" && tasks.length > 0
            ? "bg-rose-500/5 hover:bg-rose-500/10"
            : variant === "blocked" && tasks.length > 0
            ? "bg-amber-500/5 hover:bg-amber-500/10"
            : "bg-surface-muted/40 hover:bg-surface-muted/70"
        )}
        aria-expanded={isExpanded}
        aria-controls={`${id}-content`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              variant === "overdue" && tasks.length > 0
                ? "text-rose-600 dark:text-rose-400"
                : variant === "blocked" && tasks.length > 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-primary"
            )}
          />
          <div className="flex items-center gap-2 min-w-0">
            <h2
              id={`${id}-header`}
              className="text-xs font-bold text-foreground uppercase tracking-wider truncate"
            >
              {title}
            </h2>
            <Badge
              variant={
                variant === "overdue" && tasks.length > 0
                  ? "destructive"
                  : variant === "blocked" && tasks.length > 0
                  ? "warning"
                  : "secondary"
              }
              size="sm"
            >
              {tasks.length}
            </Badge>
          </div>
          {description && (
            <span className="text-[11px] text-muted-foreground hidden md:inline truncate">
              — {description}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>
      </button>

      {/* Queue Task Rows Container */}
      {isExpanded && (
        <div id={`${id}-content`} className="p-3">
          {tasks.length === 0 ? (
            <EmptyState
              icon={Icon}
              title={emptyTitle}
              description={emptyDescription}
              className="p-6 border-transparent bg-transparent"
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              {tasks.map((task) => (
                <MyWorkTaskRow
                  key={task.id}
                  task={task}
                  onSelect={onSelectTask}
                  onQuickComplete={onQuickComplete}
                  variant={variant}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
