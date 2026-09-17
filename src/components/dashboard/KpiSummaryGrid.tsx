"use client";

import * as React from "react";
import { FolderKanban, Clock, Ban, Users2, CheckCircle2 } from "lucide-react";
import { CountUp } from "@/components/ui/count-up";
import { apiClient } from "@/lib/apiClient";
import { useWorkspaceStore } from "@/store";
import { Skeleton } from "@/components/ui/skeleton";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import { cn } from "@/lib/utils";

export function KpiSummaryGrid() {
  const { activeWorkspace, projects, members, isWorkspaceValidated } = useWorkspaceStore();
  const { onEvent } = useRealtime();
  const [isLoading, setIsLoading] = React.useState(true);

  const [summary, setSummary] = React.useState({
    totalProjects: 0,
    activeProjects: 0,
    tasksDueCount: 0,
    overdueTasks: 0,
    blockedTasks: 0,
    teamMembersCount: 0,
    completedTasks: 0,
    velocityRate: 0,
    totalTasks: 0,
  });

  React.useEffect(() => {
    if (!activeWorkspace?.id || !isWorkspaceValidated) {
      setIsLoading(true);
      return;
    }

    let isMounted = true;
    async function loadSummary(wsId: string) {
      setIsLoading(true);
      try {
        const res = await apiClient.getDashboardSummary(wsId);
        if (!isMounted) return;
        if (res.success && res.data) {
          setSummary({
            totalProjects: res.data.totalProjects ?? projects.length,
            activeProjects: res.data.activeProjects ?? 0,
            tasksDueCount: res.data.tasksDueCount ?? res.data.activeTasks ?? 0,
            overdueTasks: res.data.overdueTasks ?? 0,
            blockedTasks: res.data.blockedTasks ?? 0,
            teamMembersCount: res.data.teamMembersCount ?? members.length ?? 1,
            completedTasks: res.data.completedTasks ?? 0,
            velocityRate: res.data.velocityRate ?? 0,
            totalTasks: res.data.totalTasks ?? 0,
          });
        }
      } catch (e) {
        if (!isMounted) return;
        console.warn("Dashboard summary API fallback:", e);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    loadSummary(activeWorkspace.id);

    return () => {
      isMounted = false;
    };
  }, [activeWorkspace?.id, isWorkspaceValidated, projects.length, members.length]);

  // Realtime KPI Live Synchronization
  React.useEffect(() => {
    const unsubProjCreate = onEvent("PROJECT_CREATED", () => {
      setSummary((prev) => ({
        ...prev,
        totalProjects: prev.totalProjects + 1,
        activeProjects: prev.activeProjects + 1,
      }));
    });

    const unsubProjDelete = onEvent("PROJECT_DELETED", () => {
      setSummary((prev) => ({
        ...prev,
        totalProjects: Math.max(0, prev.totalProjects - 1),
        activeProjects: Math.max(0, prev.activeProjects - 1),
      }));
    });

    const unsubTaskCreate = onEvent("TASK_CREATED", (event) => {
      const task = event.payload;
      const isDue = Boolean(task?.dueDate);
      setSummary((prev) => ({
        ...prev,
        totalTasks: prev.totalTasks + 1,
        tasksDueCount: isDue ? prev.tasksDueCount + 1 : prev.tasksDueCount,
      }));
    });

    const unsubTaskStatus = onEvent("TASK_STATUS_CHANGED", (event) => {
      const { newStatus, previousStatus } = event.payload || {};
      const isNewDone = newStatus?.toLowerCase() === "done";
      const isPrevDone = previousStatus?.toLowerCase() === "done";
      const isNewBlocked = newStatus?.toLowerCase() === "blocked";
      const isPrevBlocked = previousStatus?.toLowerCase() === "blocked";

      setSummary((prev) => {
        let completedDelta = 0;
        if (isNewDone && !isPrevDone) completedDelta = 1;
        else if (!isNewDone && isPrevDone) completedDelta = -1;

        let blockedDelta = 0;
        if (isNewBlocked && !isPrevBlocked) blockedDelta = 1;
        else if (!isNewBlocked && isPrevBlocked) blockedDelta = -1;

        const newCompleted = Math.max(0, prev.completedTasks + completedDelta);
        const newBlocked = Math.max(0, prev.blockedTasks + blockedDelta);

        return {
          ...prev,
          completedTasks: newCompleted,
          blockedTasks: newBlocked,
        };
      });
    });

    const unsubTaskDelete = onEvent("TASK_DELETED", () => {
      setSummary((prev) => ({
        ...prev,
        totalTasks: Math.max(0, prev.totalTasks - 1),
      }));
    });

    return () => {
      unsubProjCreate();
      unsubProjDelete();
      unsubTaskCreate();
      unsubTaskStatus();
      unsubTaskDelete();
    };
  }, [onEvent]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
      {/* 1. Active Projects */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-2xs flex flex-col justify-between min-h-[110px] transition-colors hover:border-border-strong">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
            Active Projects
          </span>
          <FolderKanban className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="mt-2">
          {isLoading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-7 w-14 rounded" />
              <Skeleton className="h-3 w-24 rounded" />
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold font-mono tracking-tight text-foreground">
                <CountUp value={summary.activeProjects} duration={600} />
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                {summary.totalProjects} total in workspace
              </p>
            </>
          )}
        </div>
      </div>

      {/* 2. Scheduled Work */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-2xs flex flex-col justify-between min-h-[110px] transition-colors hover:border-border-strong">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
            Scheduled Tasks
          </span>
          <Clock className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="mt-2">
          {isLoading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-7 w-14 rounded" />
              <Skeleton className="h-3 w-24 rounded" />
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold font-mono tracking-tight text-foreground">
                <CountUp value={summary.tasksDueCount} duration={600} />
              </div>
              <p className={cn(
                "text-[11px] mt-0.5 font-mono",
                summary.overdueTasks > 0 ? "text-destructive font-semibold" : "text-muted-foreground"
              )}>
                {summary.overdueTasks > 0
                  ? `${summary.overdueTasks} overdue`
                  : "All on schedule"}
              </p>
            </>
          )}
        </div>
      </div>

      {/* 3. Blocked Work */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-2xs flex flex-col justify-between min-h-[110px] transition-colors hover:border-border-strong">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
            Blocked Work
          </span>
          <Ban className={cn("h-3.5 w-3.5", summary.blockedTasks > 0 ? "text-destructive" : "text-muted-foreground")} />
        </div>
        <div className="mt-2">
          {isLoading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-7 w-14 rounded" />
              <Skeleton className="h-3 w-24 rounded" />
            </div>
          ) : (
            <>
              <div className={cn(
                "text-2xl font-bold font-mono tracking-tight",
                summary.blockedTasks > 0 ? "text-destructive" : "text-foreground"
              )}>
                <CountUp value={summary.blockedTasks} duration={600} />
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                {summary.blockedTasks > 0 ? "Needs dependency unblocking" : "Zero active blockers"}
              </p>
            </>
          )}
        </div>
      </div>

      {/* 4. Team Capacity */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-2xs flex flex-col justify-between min-h-[110px] transition-colors hover:border-border-strong">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
            Team Squad
          </span>
          <Users2 className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="mt-2">
          {isLoading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-7 w-14 rounded" />
              <Skeleton className="h-3 w-24 rounded" />
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold font-mono tracking-tight text-foreground">
                <CountUp value={summary.teamMembersCount} duration={600} />
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                Collaborators assigned
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
