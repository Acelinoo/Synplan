"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTaskStore, useWorkspaceStore } from "@/store";
import { apiClient } from "@/lib/apiClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Task } from "@/types";
import { useRealtime } from "@/components/realtime/RealtimeProvider";

const TaskDetailDrawer = dynamic(
  () => import("@/components/kanban/TaskDetailDrawer").then((mod) => mod.TaskDetailDrawer),
  { ssr: false }
);

export function UpcomingDeadlinesWidget() {
  const router = useRouter();
  const { tasks, setTasks, addTask, updateTask, moveTaskStatus, deleteTask } = useTaskStore();
  const { projects, activeWorkspace, isWorkspaceValidated } = useWorkspaceStore();
  const { onEvent } = useRealtime();
  const [isLoading, setIsLoading] = React.useState(tasks.length === 0);
  const [selectedTask, setSelectedTask] = React.useState<Task | null>(null);

  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!activeWorkspace?.id || !isWorkspaceValidated) {
      setIsLoading(true);
      return;
    }

    let isMounted = true;
    async function loadTasks(wsId: string) {
      setIsLoading(true);
      setError(null);
      try {
        const res = await apiClient.getTasks({ workspaceId: wsId });
        if (!isMounted) return;
        if (res.success && Array.isArray(res.data)) {
          const mapped = res.data.map((t: any) => ({
            id: t.id,
            workspaceId: t.workspaceId,
            projectId: t.projectId,
            title: t.title,
            description: t.description || "",
            status: t.status.toLowerCase(),
            priority: t.priority.toLowerCase(),
            assigneeId: t.assigneeId || "",
            dueDate: t.dueDate ? t.dueDate.split("T")[0] : "2026-09-15",
            order: t.order || 0,
            subtasks: t.subtasks || [],
            tags: t.tags || [],
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
          }));
          setTasks(mapped);
        } else if (!res.success) {
          setError(res.error || "Failed to load tasks");
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.warn("UpcomingDeadlines getTasks fallback:", err);
        setError(err?.message || "Failed to load tasks");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    loadTasks(activeWorkspace.id);

    return () => {
      isMounted = false;
    };
  }, [activeWorkspace?.id, isWorkspaceValidated, setTasks]);

  // --- Realtime Tasks Live Synchronization ---
  React.useEffect(() => {
    const unsubCreate = onEvent("TASK_CREATED", (event) => {
      const raw = event.payload;
      if (raw && raw.id) {
        addTask({
          id: raw.id,
          workspaceId: raw.workspaceId,
          projectId: raw.projectId,
          title: raw.title,
          description: raw.description || "",
          status: (raw.status || "todo").toLowerCase() as any,
          priority: (raw.priority || "medium").toLowerCase() as any,
          assigneeId: raw.assigneeId || "",
          dueDate: raw.dueDate ? raw.dueDate.split("T")[0] : undefined,
          order: raw.order || 0,
          subtasks: raw.subtasks || [],
          tags: raw.tags || [],
          createdAt: raw.createdAt,
          updatedAt: raw.updatedAt,
        });
        apiClient.invalidate("/api/tasks");
      }
    });

    const unsubUpdate = onEvent("TASK_UPDATED", (event) => {
      const raw = event.payload;
      if (raw && raw.id) {
        updateTask(raw.id, {
          ...raw,
          status: raw.status ? (raw.status.toLowerCase() as any) : undefined,
          priority: raw.priority ? (raw.priority.toLowerCase() as any) : undefined,
          dueDate: raw.dueDate ? raw.dueDate.split("T")[0] : undefined,
        });
        setSelectedTask((prev) => (prev && prev.id === raw.id ? { ...prev, ...raw } : prev));
        apiClient.invalidate("/api/tasks");
      }
    });

    const unsubStatus = onEvent("TASK_STATUS_CHANGED", (event) => {
      const raw = event.payload;
      if (raw && raw.taskId) {
        moveTaskStatus(raw.taskId, (raw.newStatus || "todo").toLowerCase() as any, raw.completedAt);
        setSelectedTask((prev) =>
          prev && prev.id === raw.taskId ? { ...prev, status: raw.newStatus.toLowerCase() as any } : prev
        );
        apiClient.invalidate("/api/tasks");
      }
    });

    const unsubDelete = onEvent("TASK_DELETED", (event) => {
      const raw = event.payload;
      if (raw && raw.id) {
        deleteTask(raw.id);
        setSelectedTask((prev) => (prev && prev.id === raw.id ? null : prev));
        apiClient.invalidate("/api/tasks");
      }
    });

    return () => {
      unsubCreate();
      unsubUpdate();
      unsubStatus();
      unsubDelete();
    };
  }, [onEvent, addTask, updateTask, moveTaskStatus, deleteTask]);

  const displayTasks = tasks
    .filter((t) => Boolean(t.dueDate) && t.status?.toLowerCase() !== "done" && t.status?.toLowerCase() !== "completed")
    .sort((a, b) => new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime())
    .slice(0, 4);

  const getProjectName = (projectId: string) => {
    const proj = projects.find((p) => p.id === projectId);
    return proj ? proj.name : "Website Initiative";
  };

  const getStatusBadge = (status?: string) => {
    const s = (status || "todo").toLowerCase();
    if (s === "done" || s === "completed") {
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
    if (s === "in_review" || s === "review" || s === "on_hold") {
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

  const formatFigmaDate = (dateStr?: string) => {
    if (!dateStr) return "17 August 2026";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const handleTaskClick = (task: (typeof tasks)[0]) => {
    setSelectedTask(task as Task);
  };

  return (
    <>
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs flex flex-col justify-between min-h-[340px]">
        <div className="flex items-center justify-between">
          <h2 className="text-sm sm:text-base font-bold text-foreground">Due Date</h2>
        </div>

        <div className="mt-4 space-y-4">
          {isLoading ? (
            <div className="space-y-3 py-1">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between gap-4 py-2 border-b border-border/40 last:border-0">
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-36 rounded" />
                    <Skeleton className="h-3 w-24 rounded" />
                  </div>
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-5 w-16 rounded" />
                    <Skeleton className="h-4 w-24 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center text-xs text-destructive">
              {error}
            </div>
          ) : displayTasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/80 p-8 text-center text-xs text-muted-foreground">
              No upcoming tasks found.
            </div>
          ) : (
            displayTasks.map((item) => (
              <div
                key={item.id}
                tabIndex={0}
                role="button"
                aria-label={`Inspect task ${item.title}`}
                onClick={() => handleTaskClick(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleTaskClick(item);
                  }
                }}
                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 py-2.5 border-b border-border/40 last:border-0 hover:bg-muted/20 focus:bg-muted/20 focus:outline-hidden rounded-lg px-2 transition-colors cursor-pointer"
              >
                {/* Left: Task Title & Project Subtitle */}
                <div className="min-w-0 flex-1 space-y-0.5">
                  <h3 className="text-xs sm:text-sm font-semibold text-foreground group-hover:text-primary group-focus:text-primary transition-colors truncate">
                    {item.title}
                  </h3>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {getProjectName(item.projectId)}
                  </p>
                </div>

                {/* Right: Status Pill & Formatted Date */}
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  {getStatusBadge(item.status)}
                  <span className="text-[11px] sm:text-xs font-mono font-medium text-muted-foreground whitespace-nowrap min-w-[100px] text-right">
                    {formatFigmaDate(item.dueDate)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Task Detail Drawer for in-place inspection */}
      <TaskDetailDrawer
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onEdit={(t) => {
          setSelectedTask(null);
          router.push(`/tasks?projectId=${t.projectId}&taskId=${t.id}`);
        }}
      />
    </>
  );
}
