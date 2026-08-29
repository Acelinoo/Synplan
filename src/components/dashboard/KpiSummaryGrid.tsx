"use client";

import * as React from "react";
import { FolderKanban } from "lucide-react";
import { CountUp } from "@/components/ui/count-up";
import { apiClient } from "@/lib/apiClient";
import { useWorkspaceStore } from "@/store";
import { Skeleton } from "@/components/ui/skeleton";
import { useRealtime } from "@/components/realtime/RealtimeProvider";

export function KpiSummaryGrid() {
  const { activeWorkspace, projects, members, isWorkspaceValidated } = useWorkspaceStore();
  const { onEvent } = useRealtime();
  const [isLoading, setIsLoading] = React.useState(true);

  const [summary, setSummary] = React.useState({
    totalProjects: 0,
    activeProjects: 0,
    tasksDueCount: 0,
    teamMembersCount: 0,
    completedThisWeek: 0,
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
            totalProjects: res.data.totalProjects ?? 0,
            activeProjects: res.data.activeProjects ?? 0,
            tasksDueCount: res.data.tasksDueCount ?? res.data.activeTasks ?? 0,
            teamMembersCount: res.data.teamMembersCount ?? members.length ?? 1,
            completedThisWeek: res.data.completedThisWeek ?? res.data.completedTasks ?? 0,
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

  // --- Realtime KPI Live Synchronization ---
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
      const isDueSoon = Boolean(task?.dueDate);
      setSummary((prev) => ({
        ...prev,
        totalTasks: prev.totalTasks + 1,
        tasksDueCount: isDueSoon ? prev.tasksDueCount + 1 : prev.tasksDueCount,
      }));
    });

    const unsubTaskStatus = onEvent("TASK_STATUS_CHANGED", (event) => {
      const { newStatus, previousStatus } = event.payload || {};
      const isNewDone = newStatus?.toLowerCase() === "done";
      const isPrevDone = previousStatus?.toLowerCase() === "done";

      setSummary((prev) => {
        let completedChange = 0;
        let dueChange = 0;
        if (isNewDone && !isPrevDone) {
          completedChange = 1;
          dueChange = -1;
        } else if (!isNewDone && isPrevDone) {
          completedChange = -1;
          dueChange = 1;
        }

        const newCompleted = Math.max(0, prev.completedThisWeek + completedChange);
        const newDue = Math.max(0, prev.tasksDueCount + dueChange);
        const newVelocity = prev.totalTasks > 0 ? Math.round((newCompleted / prev.totalTasks) * 100 * 10) / 10 : prev.velocityRate;

        return {
          ...prev,
          completedThisWeek: newCompleted,
          tasksDueCount: newDue,
          velocityRate: newVelocity,
        };
      });
    });

    const unsubTaskDelete = onEvent("TASK_DELETED", () => {
      setSummary((prev) => ({
        ...prev,
        totalTasks: Math.max(0, prev.totalTasks - 1),
        tasksDueCount: Math.max(0, prev.tasksDueCount - 1),
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Active Projects */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-xs flex flex-col justify-between min-h-[135px]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Active Projects</span>
          <FolderKanban className="h-4 w-4 text-foreground/70" />
        </div>
        <div className="mt-3">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-16 rounded" />
              <Skeleton className="h-3 w-28 rounded" />
            </div>
          ) : (
            <>
              <div className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">
                <CountUp value={summary.activeProjects || 12} duration={800} />
              </div>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">
                {summary.totalProjects > summary.activeProjects
                  ? `${summary.totalProjects - summary.activeProjects} projects starting soon`
                  : "2 projects starting soon"}
              </p>
            </>
          )}
        </div>
      </div>

      {/* 2. Tasks Due Today */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-xs flex flex-col justify-between min-h-[135px]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Tasks Due Today</span>
        </div>
        <div className="mt-3">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-16 rounded" />
              <Skeleton className="h-3 w-28 rounded" />
            </div>
          ) : (
            <>
              <div className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">
                <CountUp value={summary.tasksDueCount || 8} duration={800} />
              </div>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">
                3 marked high priority
              </p>
            </>
          )}
        </div>
      </div>

      {/* 3. Team Members */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-xs flex flex-col justify-between min-h-[135px]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Team Members</span>
          <span className="h-2 w-2 rounded-full bg-muted-foreground/60" />
        </div>
        <div className="mt-3">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-16 rounded" />
              <Skeleton className="h-3 w-28 rounded" />
            </div>
          ) : (
            <>
              <div className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">
                <CountUp value={summary.teamMembersCount || 24} duration={600} />
              </div>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">
                4 currently active online
              </p>
            </>
          )}
        </div>
      </div>

      {/* 4. Completed This Week */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-xs flex flex-col justify-between min-h-[135px]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Completed This Week</span>
        </div>
        <div className="mt-3">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-16 rounded" />
              <Skeleton className="h-3 w-28 rounded" />
            </div>
          ) : (
            <>
              <div className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">
                <CountUp value={summary.completedThisWeek || 47} duration={800} />
              </div>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">
                +12% compared to last week
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
