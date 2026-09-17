"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FolderKanban } from "lucide-react";
import { useWorkspaceStore } from "@/store";
import { apiClient } from "@/lib/apiClient";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectStatusBadge } from "@/components/ui";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import { cn } from "@/lib/utils";

export function ProjectProgressList() {
  const router = useRouter();
  const { projects, setProjects, addProject, updateProject, deleteProject, activeWorkspace, members, isWorkspaceValidated } = useWorkspaceStore();
  const { onEvent } = useRealtime();
  const [isLoading, setIsLoading] = React.useState(projects.length === 0);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!activeWorkspace?.id || !isWorkspaceValidated) {
      setIsLoading(true);
      return;
    }

    let isMounted = true;
    async function loadProjects(wsId: string) {
      setIsLoading(true);
      setError(null);
      try {
        const res = await apiClient.getProjects({ workspaceId: wsId });
        if (!isMounted) return;
        if (res.success && Array.isArray(res.data)) {
          setProjects(res.data);
        } else if (!res.success) {
          setError(res.error || "Failed to load projects");
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.warn("ProjectProgressList getProjects fallback:", err);
        setError(err?.message || "Failed to load projects");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    loadProjects(activeWorkspace.id);

    return () => {
      isMounted = false;
    };
  }, [activeWorkspace?.id, isWorkspaceValidated, setProjects]);

  // Realtime Recent Projects Synchronization
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

  const displayProjects = projects.slice(0, 5);

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-2xs flex flex-col justify-between min-h-[320px]">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-primary" />
          <h2 className="text-xs sm:text-sm font-bold tracking-tight text-foreground uppercase font-mono">
            Active Initiatives
          </h2>
        </div>
        <button
          onClick={() => router.push("/projects")}
          className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
        >
          <span>View All</span>
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {/* Projects List */}
      <div className="mt-3 divide-y divide-border/40 flex-1">
        {isLoading ? (
          <div className="space-y-3 py-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between gap-4 py-2.5">
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-32 rounded" />
                  <Skeleton className="h-3 w-20 rounded" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-2 w-20 rounded-full" />
                  <Skeleton className="h-4 w-8 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center text-xs text-destructive my-4">
            {error}
          </div>
        ) : displayProjects.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/80 p-8 text-center text-xs text-muted-foreground my-4">
            No projects found. Create an initiative to begin tracking delivery.
          </div>
        ) : (
          displayProjects.map((project) => {
            const progress = project.progress ?? 0;

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
                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 py-2.5 px-2 hover:bg-surface-muted/50 rounded-md transition-colors cursor-pointer"
              >
                {/* Left: Indicator, Title & Status */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: project.color || "#1E40AF" }}
                      aria-hidden="true"
                    />
                    <h3 className="text-xs sm:text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                      {project.name}
                    </h3>
                  </div>
                  <div className="pl-4">
                    <ProjectStatusBadge status={project.status || "active"} size="sm" />
                  </div>
                </div>

                {/* Right: Progress Meter & Squad */}
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pl-4 sm:pl-0">
                  <div className="flex items-center gap-2 min-w-[100px]">
                    <div className="h-1.5 w-16 sm:w-20 overflow-hidden rounded-full bg-surface-muted border border-border/40">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-mono font-semibold text-muted-foreground w-7 text-right">
                      {progress}%
                    </span>
                  </div>

                  {/* Stacked Member Avatars */}
                  <div className="flex items-center -space-x-1 shrink-0">
                    {(project.assignedMemberIds && project.assignedMemberIds.length > 0
                      ? project.assignedMemberIds
                      : []
                    ).slice(0, 3).map((uId, i) => {
                      const matchedMember = members.find((m) => m.id === uId || m.user?.id === uId);
                      const initial = matchedMember?.user?.name
                        ? matchedMember.user.name.charAt(0).toUpperCase()
                        : typeof uId === "string" && uId.length <= 2
                        ? uId.toUpperCase()
                        : "U";
                      return (
                        <div
                          key={i}
                          className="flex h-5 w-5 items-center justify-center rounded-full border border-card bg-primary text-[9px] font-bold text-primary-foreground font-mono"
                        >
                          {initial}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
