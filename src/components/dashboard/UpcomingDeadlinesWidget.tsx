"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Clock, ArrowRight } from "lucide-react";
import { useTaskStore, useWorkspaceStore } from "@/store";
import { apiClient } from "@/lib/apiClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Task } from "@/types";
import { DueDateChip, StatusBadge, PriorityBadge } from "@/components/ui";
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
        const res = await apiClient.getTasks({ workspaceId: wsId, limit: 10, sort: "deadline" });
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
            dueDate: t.dueDate ? t.dueDate.split("T")[0] : undefined,
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

  // Realtime Tasks Live Synchronization
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
    .filter((t) => Boolean(t.dueDate) && t.status?.toLowerCase() !== "done" && t.status?.toLowerCase() !== "cancelled")
    .sort((a, b) => new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime())
    .slice(0, 5);

  const getProjectName = (projectId: string) => {
    const proj = projects.find((p) => p.id === projectId);
    return proj ? proj.name : "Initiative";
  };

  return (
    <>
      <div className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-2xs flex flex-col justify-between min-h-[320px]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h2 className="text-xs sm:text-sm font-bold tracking-tight text-foreground uppercase font-mono">
              Upcoming Deadlines
            </h2>
          </div>
          <button
            onClick={() => router.push("/tasks")}
            className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
          >
            <span>View All</span>
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        {/* Tasks List */}
        <div className="mt-3 divide-y divide-border/40 flex-1">
          {isLoading ? (
            <div className="space-y-3 py-1">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-36 rounded" />
                    <Skeleton className="h-3 w-20 rounded" />
                  </div>
                  <Skeleton className="h-5 w-20 rounded" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center text-xs text-destructive my-4">
              {error}
            </div>
          ) : displayTasks.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/80 p-8 text-center text-xs text-muted-foreground my-4">
              No upcoming task deadlines scheduled.
            </div>
          ) : (
            displayTasks.map((item) => (
              <div
                key={item.id}
                tabIndex={0}
                role="button"
                aria-label={`Inspect task ${item.title}`}
                onClick={() => setSelectedTask(item as Task)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedTask(item as Task);
                  }
                }}
                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 py-2.5 px-2 hover:bg-surface-muted/50 rounded-md transition-colors cursor-pointer"
              >
                {/* Left: Title & Project */}
                <div className="min-w-0 flex-1 space-y-0.5">
                  <h3 className="text-xs sm:text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                    {item.title}
                  </h3>
                  <p className="text-[11px] text-muted-foreground font-mono truncate">
                    {getProjectName(item.projectId)}
                  </p>
                </div>

                {/* Right: Due Date Chip & Priority */}
                <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pl-4 sm:pl-0">
                  <PriorityBadge priority={item.priority} size="sm" />
                  <DueDateChip dueDate={item.dueDate} />
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
