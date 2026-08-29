"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceStore } from "@/store";
import { apiClient } from "@/lib/apiClient";
import { Skeleton } from "@/components/ui/skeleton";
import { useRealtime } from "@/components/realtime/RealtimeProvider";

export function ProjectProgressList() {
  const router = useRouter();
  const { projects, setProjects, addProject, updateProject, deleteProject, activeWorkspace, members } = useWorkspaceStore();
  const { onEvent } = useRealtime();
  const [isLoading, setIsLoading] = React.useState(projects.length === 0);

  React.useEffect(() => {
    async function loadProjects() {
      setIsLoading(true);
      try {
        const res = await apiClient.getProjects({ workspaceId: activeWorkspace?.id });
        if (res.success && Array.isArray(res.data)) {
          setProjects(res.data);
        }
      } catch (err) {
        console.warn("ProjectProgressList getProjects fallback:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadProjects();
  }, [activeWorkspace?.id, setProjects]);

  // --- Realtime Recent Projects Synchronization ---
  React.useEffect(() => {
    const unsubCreate = onEvent("PROJECT_CREATED", (event) => {
      const raw = event.payload;
      if (raw && raw.id) {
        addProject(raw);
        apiClient.invalidate("/api/projects");
      }
    });

    const unsubUpdate = onEvent("PROJECT_UPDATED", (event) => {
      const raw = event.payload;
      if (raw && raw.id) {
        updateProject(raw.id, raw);
        apiClient.invalidate("/api/projects");
      }
    });

    const unsubDelete = onEvent("PROJECT_DELETED", (event) => {
      const raw = event.payload;
      if (raw && raw.id) {
        deleteProject(raw.id);
        apiClient.invalidate("/api/projects");
      }
    });

    const unsubTaskStatus = onEvent("TASK_STATUS_CHANGED", (event) => {
      const { projectId, evaluator } = event.payload || {};
      if (projectId && evaluator?.projectProgress !== undefined) {
        updateProject(projectId, { progress: evaluator.projectProgress });
      }
    });

    return () => {
      unsubCreate();
      unsubUpdate();
      unsubDelete();
      unsubTaskStatus();
    };
  }, [onEvent, addProject, updateProject, deleteProject]);

  const activeProjects = projects.slice(0, 4);

  const getStatusBadge = (status?: string) => {
    const s = (status || "active").toLowerCase();
    if (s === "completed" || s === "done") {
      return (
        <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
          Done
        </span>
      );
    }
    if (s === "planning") {
      return (
        <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
          Planning
        </span>
      );
    }
    if (s === "on_hold" || s === "review" || s === "in_review") {
      return (
        <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium bg-sky-500/15 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400">
          Review
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium bg-blue-500/15 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
        In Progress
      </span>
    );
  };

  const getProgressColor = (status?: string, fallbackColor?: string) => {
    const s = (status || "active").toLowerCase();
    if (s === "completed" || s === "done") return "#10B981";
    if (s === "planning") return "#F97316";
    if (s === "on_hold" || s === "review" || s === "in_review") return "#0284C7";
    return fallbackColor || "#2563EB";
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs flex flex-col justify-between min-h-[340px]">
      <div className="flex items-center justify-between">
        <h2 className="text-sm sm:text-base font-bold text-foreground">Recent Projects</h2>
      </div>

      <div className="mt-4 space-y-4">
        {isLoading ? (
          <div className="space-y-3 py-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between gap-4 py-2 border-b border-border/40 last:border-0">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-32 rounded" />
                  <Skeleton className="h-3 w-16 rounded" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-2 w-24 rounded-full" />
                  <Skeleton className="h-4 w-8 rounded" />
                </div>
                <Skeleton className="h-6 w-12 rounded-full" />
              </div>
            ))}
          </div>
        ) : activeProjects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 p-8 text-center text-xs text-muted-foreground">
            No projects found. Create a new project to track progress.
          </div>
        ) : (
          activeProjects.map((project) => {
            const progress = project.progress ?? 0;
            const progressColor = getProgressColor(project.status, project.color);

            return (
              <div
                key={project.id}
                tabIndex={0}
                role="button"
                aria-label={`Open project details for ${project.name}`}
                onClick={() => router.push(`/projects/${project.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/projects/${project.id}`);
                  }
                }}
                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-2.5 border-b border-border/40 last:border-0 hover:bg-muted/20 focus:bg-muted/20 focus:outline-hidden rounded-lg px-2 transition-colors cursor-pointer"
              >
                {/* Left: Name & Status */}
                <div className="space-y-1 min-w-[140px]">
                  <h3 className="text-xs sm:text-sm font-semibold text-foreground group-hover:text-primary group-focus:text-primary transition-colors line-clamp-1">
                    {project.name}
                  </h3>
                  <div>{getStatusBadge(project.status)}</div>
                </div>

                {/* Center: Progress Bar & Percentage */}
                <div className="flex items-center gap-3">
                  <div className="h-1.5 w-24 sm:w-28 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${progress}%`,
                        backgroundColor: progressColor,
                      }}
                    />
                  </div>
                  <span className="text-[11px] sm:text-xs font-mono font-semibold text-muted-foreground w-8 text-right">
                    {progress}%
                  </span>
                </div>

                {/* Right: Stacked Member Initial Avatars */}
                <div className="flex items-center -space-x-1.5 self-end sm:self-center">
                  {((project.assignedMemberIds && project.assignedMemberIds.length > 0)
                    ? project.assignedMemberIds
                    : ["A", "B"]
                  ).slice(0, 3).map((uId, i) => {
                    const matchedMember = members.find((m) => m.id === uId || m.user?.id === uId);
                    const initial = matchedMember?.user?.name
                      ? matchedMember.user.name.charAt(0).toUpperCase()
                      : typeof uId === "string" && uId.length <= 2
                      ? uId.toUpperCase()
                      : "A";
                    return (
                      <div
                        key={i}
                        className="flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full border-2 border-card bg-primary text-[9px] sm:text-[10px] font-bold text-primary-foreground font-mono shadow-xs"
                      >
                        {initial}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
