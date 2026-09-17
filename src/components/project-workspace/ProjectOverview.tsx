"use client";

import * as React from "react";
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Clock,
  Calendar,
  Users2,
  Ban,
  Activity,
  ArrowRight,
  Shield,
  Layers,
} from "lucide-react";
import { ProjectHealthSignals, Task } from "@/types";
import {
  PriorityBadge,
  StatusBadge,
  DueDateChip,
  TaskBlockedChip,
} from "@/components/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ProjectOverviewProps {
  project: any;
  health: ProjectHealthSignals | null;
  tasks: any[];
  activity: any[];
  onSelectTask: (task: any) => void;
  onNavigateTab: (tabId: string) => void;
}

export function ProjectOverview({
  project,
  health,
  tasks,
  activity,
  onSelectTask,
  onNavigateTab,
}: ProjectOverviewProps) {
  const members: any[] = Array.isArray(project.members) ? project.members : [];

  // Metrics from authoritative health signals if available, or computed directly from real tasks
  const metrics = health?.metrics || {
    totalTasks: tasks.length,
    completedTasks: tasks.filter((t) => (t.status || "").toLowerCase() === "done").length,
    completionRate:
      tasks.length > 0
        ? Math.round(
            (tasks.filter((t) => (t.status || "").toLowerCase() === "done").length /
              tasks.length) *
              100
          )
        : 0,
    overdueTasksCount: tasks.filter((t) => {
      if (!t.dueDate || (t.status || "").toLowerCase() === "done") return false;
      return new Date(t.dueDate).getTime() < Date.now();
    }).length,
    blockedTasksCount: tasks.filter((t) => Boolean(t.isBlocked) || (t.status || "").toLowerCase() === "blocked").length,
    unassignedTasksCount: tasks.filter((t) => !t.assigneeId && !t.assignee).length,
    upcomingDeadlinesCount: 0,
    highPriorityOpenCount: tasks.filter(
      (t) =>
        (t.priority === "urgent" || t.priority === "high") &&
        (t.status || "").toLowerCase() !== "done"
    ).length,
  };

  // Blocked tasks queue
  const blockedTasks = tasks.filter(
    (t) => Boolean(t.isBlocked) || (t.status || "").toLowerCase() === "blocked"
  );

  // Active in-progress or ready tasks
  const activeTasks = tasks
    .filter(
      (t) =>
        (t.status || "").toLowerCase() === "in_progress" ||
        (t.status || "").toLowerCase() === "in_review" ||
        (t.status || "").toLowerCase() === "todo"
    )
    .slice(0, 5);

  // Upcoming deadlines (from health signals or tasks with dates)
  const upcomingTasks = (health?.upcomingDeadlines && health.upcomingDeadlines.length > 0)
    ? health.upcomingDeadlines.slice(0, 5)
    : tasks
        .filter((t) => t.dueDate && (t.status || "").toLowerCase() !== "done")
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* 1. Authoritative Telemetry Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Metric 1: Completion */}
        <div className="rounded-xl border border-border bg-card p-3.5 space-y-1.5 shadow-2xs">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Progress
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-foreground">
              {metrics.completionRate}%
            </span>
            <span className="text-[11px] text-muted-foreground font-mono">
              ({metrics.completedTasks}/{metrics.totalTasks})
            </span>
          </div>
          <div className="h-1 w-full rounded-full bg-surface-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${metrics.completionRate}%` }}
            />
          </div>
        </div>

        {/* Metric 2: Blocked Tasks */}
        <div
          onClick={() => onNavigateTab("board")}
          className="rounded-xl border border-border bg-card p-3.5 space-y-1.5 shadow-2xs cursor-pointer hover:border-border-strong transition-colors"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Blocked Tasks
          </span>
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "text-xl font-bold font-mono",
                metrics.blockedTasksCount > 0
                  ? "text-destructive"
                  : "text-muted-foreground"
              )}
            >
              {metrics.blockedTasksCount}
            </span>
            <span className="text-[10px] text-muted-foreground">in project</span>
          </div>
        </div>

        {/* Metric 3: Overdue Tasks */}
        <div className="rounded-xl border border-border bg-card p-3.5 space-y-1.5 shadow-2xs">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Overdue Work
          </span>
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "text-xl font-bold font-mono",
                metrics.overdueTasksCount > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
              )}
            >
              {metrics.overdueTasksCount}
            </span>
            <span className="text-[10px] text-muted-foreground">tasks</span>
          </div>
        </div>

        {/* Metric 4: High Priority */}
        <div className="rounded-xl border border-border bg-card p-3.5 space-y-1.5 shadow-2xs">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            High Priority
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-foreground">
              {metrics.highPriorityOpenCount}
            </span>
            <span className="text-[10px] text-muted-foreground">open tasks</span>
          </div>
        </div>

        {/* Metric 5: Unassigned */}
        <div className="rounded-xl border border-border bg-card p-3.5 space-y-1.5 shadow-2xs col-span-2 sm:col-span-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Unassigned
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-foreground">
              {metrics.unassignedTasksCount}
            </span>
            <span className="text-[10px] text-muted-foreground">unclaimed</span>
          </div>
        </div>
      </div>

      {/* 2. Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 spans): Active Work & Blocked Work */}
        <div className="lg:col-span-2 space-y-6">
          {/* Blocked Work Alert Queue (if any) */}
          {blockedTasks.length > 0 && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-destructive font-semibold text-xs">
                  <Ban className="h-4 w-4" />
                  <span>Work Blocked by Dependencies ({blockedTasks.length})</span>
                </div>
                <button
                  onClick={() => onNavigateTab("board")}
                  className="text-xs text-destructive hover:underline font-medium cursor-pointer"
                >
                  View on Board
                </button>
              </div>

              <div className="divide-y divide-destructive/15">
                {blockedTasks.slice(0, 3).map((task) => (
                  <div
                    key={task.id}
                    onClick={() => onSelectTask(task)}
                    className="flex items-center justify-between py-2 cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <p className="text-xs font-semibold text-foreground truncate">{task.title}</p>
                      <span className="text-[10px] text-destructive">Requires preceding dependency completion</span>
                    </div>
                    <PriorityBadge priority={task.priority} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Work Queue */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Active Work Deliverables
              </h3>
              <button
                onClick={() => onNavigateTab("board")}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium cursor-pointer"
              >
                <span>View all ({tasks.length})</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>

            {activeTasks.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground italic">
                No active tasks in progress.
              </p>
            ) : (
              <div className="divide-y divide-border/40">
                {activeTasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => onSelectTask(task)}
                    className="flex items-center justify-between py-2.5 hover:bg-surface-muted/30 px-1 rounded-md transition-colors cursor-pointer"
                  >
                    <div className="min-w-0 flex-1 pr-4">
                      <p className="text-xs font-semibold text-foreground truncate">{task.title}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span>{task.assignee?.name || "Unassigned"}</span>
                        {task.dueDate && <span>· Due {new Date(task.dueDate).toLocaleDateString()}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <PriorityBadge priority={task.priority} />
                      <StatusBadge status={task.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Deadlines */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Upcoming Target Deadlines
                </h3>
              </div>
            </div>

            {upcomingTasks.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground italic">
                No scheduled delivery deadlines for this project.
              </p>
            ) : (
              <div className="divide-y divide-border/40">
                {upcomingTasks.map((t: any) => (
                  <div
                    key={t.id}
                    onClick={() => onSelectTask(t)}
                    className="flex items-center justify-between py-2.5 hover:bg-surface-muted/30 px-1 rounded-md transition-colors cursor-pointer"
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <p className="text-xs font-semibold text-foreground truncate">{t.title}</p>
                      <span className="text-[10px] text-muted-foreground">
                        {t.assigneeName || t.assignee?.name || "Unassigned"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <DueDateChip dueDate={t.dueDate} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (1 span): Squad Roster & Recent Activity */}
        <div className="space-y-6">
          {/* Team Members Roster */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Users2 className="h-3.5 w-3.5 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Assigned Team ({members.length})
                </h3>
              </div>
              <button
                onClick={() => onNavigateTab("members")}
                className="text-[11px] text-primary hover:underline cursor-pointer"
              >
                Manage
              </button>
            </div>

            {members.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground italic">
                No squad members assigned to this project.
              </p>
            ) : (
              <div className="space-y-2">
                {members.map((m: any) => {
                  const initial = (m.user?.name || "M").charAt(0).toUpperCase();
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-2.5 p-2 rounded-lg bg-surface-muted/40 border border-border/50"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-xs font-bold text-primary font-mono shrink-0">
                          {initial}
                        </div>
                        <div className="min-w-0 truncate">
                          <p className="text-xs font-semibold text-foreground truncate">
                            {m.user?.name || "Squad Member"}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {m.user?.email || ""}
                          </p>
                        </div>
                      </div>
                      <span className="rounded px-1.5 py-0.5 text-[9px] font-mono font-semibold text-muted-foreground bg-card border border-border uppercase">
                        {m.role || "MEMBER"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Activity Feed Preview */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Recent Activity
                </h3>
              </div>
              <button
                onClick={() => onNavigateTab("activity")}
                className="text-[11px] text-primary hover:underline cursor-pointer"
              >
                Full Stream
              </button>
            </div>

            {activity.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground italic">
                No activity recorded yet for this project.
              </p>
            ) : (
              <div className="divide-y divide-border/30">
                {activity.slice(0, 5).map((item: any) => {
                  const actorName = item.actor?.name || "System";
                  const initial = actorName.charAt(0).toUpperCase();

                  return (
                    <div key={item.id} className="py-2 space-y-0.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-foreground truncate max-w-[130px]">
                          {actorName}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {new Date(item.timestamp).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-tight">
                        <span className="capitalize font-mono text-[10px]">{item.action.toLowerCase().replace(/_/g, " ")}: </span>
                        {item.target}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
