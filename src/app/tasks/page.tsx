"use client";

import * as React from "react";
import {
  CheckSquare,
  Plus,
  Search,
  Filter,
  SlidersHorizontal,
  RotateCcw,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTaskStore, useWorkspaceStore, useUiStore } from "@/store";
import { Task, TaskStatus, TaskPriority } from "@/types";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { MagnetButton } from "@/components/ui/magnet-button";
import { KanbanColumn } from "@/components/kanban/KanbanColumn";
import { AnimatedGrid } from "@/components/ui/animated-grid";
import { Skeleton, SkeletonCard, SkeletonAvatar } from "@/components/ui/skeleton";
import TasksLoading from "./loading";
import { apiClient } from "@/lib/apiClient";
import { getDueDateState } from "@/lib/projectWorkflow";
import { cn } from "@/lib/utils";
import { useRealtime } from "@/components/realtime/RealtimeProvider";

const TaskModal = dynamic(
  () => import("@/components/kanban/TaskModal").then((mod) => mod.TaskModal),
  { ssr: false }
);

const TaskDetailDrawer = dynamic(
  () => import("@/components/kanban/TaskDetailDrawer").then((mod) => mod.TaskDetailDrawer),
  { ssr: false }
);

const columnsConfig: { status: TaskStatus; title: string; dotColor: string }[] = [
  { status: "todo", title: "To Do", dotColor: "bg-status-todo" },
  { status: "in_progress", title: "In Progress", dotColor: "bg-status-progress" },
  { status: "in_review", title: "In Review", dotColor: "bg-status-review" },
  { status: "done", title: "Done", dotColor: "bg-status-done" },
];

const priorityWeight: Record<TaskPriority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const statusWeight: Record<TaskStatus, number> = {
  todo: 1,
  in_progress: 2,
  in_review: 3,
  done: 4,
};

function TasksContent() {
  const searchParams = useSearchParams();
  const {
    tasks,
    setTasks,
    addTask,
    updateTask,
    deleteTask,
    moveTaskStatus,
    applyBatchMutation,
    filters,
    setSearchQuery,
    setPriorityFilter,
    resetFilters,
  } = useTaskStore();
  const { projects, activeWorkspace } = useWorkspaceStore();
  const { setCreateTaskModalOpen } = useUiStore();
  const { onEvent, onReconnect } = useRealtime();

  const [isLoading, setIsLoading] = React.useState(tasks.length === 0);
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(false);
  const [totalTasksCount, setTotalTasksCount] = React.useState(0);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);

  const urlProjectId = searchParams.get("projectId");
  const urlTaskId = searchParams.get("taskId");
  const urlCreate = searchParams.get("create");

  const [selectedProjectFilter, setSelectedProjectFilter] = React.useState<string>(urlProjectId || "all");
  const [editingTask, setEditingTask] = React.useState<Task | null>(null);
  const [inspectingTask, setInspectingTask] = React.useState<Task | null>(null);
  const [defaultColumnStatus, setDefaultColumnStatus] = React.useState<TaskStatus>("todo");
  const [viewMode, setViewMode] = React.useState<"board" | "list">("board");

  // Sorting state for List View (3-way: asc -> desc -> null)
  const [sortField, setSortField] = React.useState<"title" | "priority" | "status" | "dueDate" | null>(null);
  const [sortDirection, setSortDirection] = React.useState<"asc" | "desc" | null>(null);

  const handleSort = (field: "title" | "priority" | "status" | "dueDate") => {
    if (sortField !== field) {
      setSortField(field);
      setSortDirection("asc");
    } else if (sortDirection === "asc") {
      setSortDirection("desc");
    } else if (sortDirection === "desc") {
      setSortField(null);
      setSortDirection(null);
    }
  };

  // --- Realtime Task Live Synchronization ---
  React.useEffect(() => {
    const unsubCreate = onEvent("TASK_CREATED", (event) => {
      const raw = event.payload;
      if (raw && raw.id) {
        const task: Task = {
          id: raw.id,
          workspaceId: raw.workspaceId,
          projectId: raw.projectId,
          phaseId: raw.phaseId || null,
          phase: raw.phase || null,
          title: raw.title,
          description: raw.description || "",
          status: (raw.status?.toLowerCase() === "blocked" ? "in_review" : raw.status?.toLowerCase() || "todo") as TaskStatus,
          priority: (raw.priority?.toLowerCase() || "medium") as TaskPriority,
          assigneeId: raw.assigneeId || "",
          dueDate: raw.dueDate ? raw.dueDate.split("T")[0] : "",
          order: raw.order || 0,
          subtasks: raw.subtasks || [],
          tags: raw.tags || [],
          createdAt: raw.createdAt,
          updatedAt: raw.updatedAt,
        };
        addTask(task);
        apiClient.invalidate("/api/tasks");
      }
    });

    const unsubUpdate = onEvent("TASK_UPDATED", (event) => {
      const raw = event.payload;
      if (raw && raw.id) {
        const updates: Partial<Task> = {
          ...(raw.title !== undefined && { title: raw.title }),
          ...(raw.description !== undefined && { description: raw.description }),
          ...(raw.status !== undefined && {
            status: (raw.status.toLowerCase() === "blocked" ? "in_review" : raw.status.toLowerCase()) as TaskStatus,
          }),
          ...(raw.priority !== undefined && {
            priority: (raw.priority.toLowerCase()) as TaskPriority,
          }),
          ...(raw.assigneeId !== undefined && { assigneeId: raw.assigneeId }),
          ...(raw.dueDate !== undefined && { dueDate: raw.dueDate ? raw.dueDate.split("T")[0] : "" }),
          ...(raw.phaseId !== undefined && { phaseId: raw.phaseId }),
          ...(raw.phase !== undefined && { phase: raw.phase }),
          ...(raw.subtasks !== undefined && { subtasks: raw.subtasks }),
          ...(raw.tags !== undefined && { tags: raw.tags }),
          ...(raw.updatedAt !== undefined && { updatedAt: raw.updatedAt }),
        };
        updateTask(raw.id, updates);
        setInspectingTask((prev) => (prev && prev.id === raw.id ? { ...prev, ...updates } : prev));
        apiClient.invalidate("/api/tasks");
      }
    });

    const unsubStatus = onEvent("TASK_STATUS_CHANGED", (event) => {
      const raw = event.payload;
      if (raw && raw.taskId && raw.newStatus) {
        const normalizedStatus = (raw.newStatus.toLowerCase() === "blocked" ? "in_review" : raw.newStatus.toLowerCase()) as TaskStatus;
        moveTaskStatus(raw.taskId, normalizedStatus, raw.completedAt);
        setInspectingTask((prev) => (prev && prev.id === raw.taskId ? { ...prev, status: normalizedStatus } : prev));
        apiClient.invalidate("/api/tasks");
      }
    });

    const unsubDelete = onEvent("TASK_DELETED", (event) => {
      const raw = event.payload;
      if (raw && raw.id) {
        deleteTask(raw.id);
        setInspectingTask((prev) => (prev && prev.id === raw.id ? null : prev));
        apiClient.invalidate("/api/tasks");
      }
    });

    const unsubBatch = onEvent("BATCH_MUTATION", (event) => {
      const raw = event.payload;
      if (raw) {
        applyBatchMutation({
          tasksCreated: raw.tasksCreated,
          tasksUpdated: raw.tasksUpdated,
          tasksDeleted: raw.tasksDeleted,
        });
        apiClient.invalidate("/api/tasks");
      }
    });

    return () => {
      unsubCreate();
      unsubUpdate();
      unsubStatus();
      unsubDelete();
      unsubBatch();
    };
  }, [onEvent, addTask, updateTask, deleteTask, moveTaskStatus, applyBatchMutation]);

  React.useEffect(() => {
    if (urlCreate === "true") {
      setEditingTask(null);
      setCreateTaskModalOpen(true);
    }
  }, [urlCreate, setCreateTaskModalOpen]);

  React.useEffect(() => {
    if (urlProjectId) {
      setSelectedProjectFilter(urlProjectId);
    }
  }, [urlProjectId]);

  const loadTasks = React.useCallback(
    async (targetPage = 1, append = false) => {
      const activeWsId = activeWorkspace?.id;
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      try {
        const res = await apiClient.getTasks({
          workspaceId: activeWsId,
          page: targetPage,
          limit: 50,
        });

        // Guard against stale response if workspace switched in-flight
        if (useWorkspaceStore.getState().activeWorkspace?.id !== activeWsId && activeWsId) {
          return;
        }

        if (res.success && Array.isArray(res.data)) {
          const mapped: Task[] = res.data.map((t: any) => ({
            id: t.id,
            workspaceId: t.workspaceId,
            projectId: t.projectId,
            phaseId: t.phaseId || null,
            phase: t.phase || null,
            title: t.title,
            description: t.description || "",
            status: (t.status?.toLowerCase() === "blocked" ? "in_review" : t.status?.toLowerCase() || "todo") as TaskStatus,
            priority: (t.priority?.toLowerCase() || "medium") as TaskPriority,
            assigneeId: t.assigneeId || "",
            dueDate: t.dueDate ? t.dueDate.split("T")[0] : "",
            order: t.order || 0,
            subtasks: t.subtasks || [],
            tags: t.tags || [],
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
          }));

          if (append) {
            const currentTasks = useTaskStore.getState().tasks;
            const existingIds = new Set(currentTasks.map((t) => t.id));
            const newItems = mapped.filter((t) => !existingIds.has(t.id));
            setTasks([...currentTasks, ...newItems]);
          } else {
            setTasks(mapped);
          }

          const paginationData = (res as any).pagination;
          setPage(targetPage);
          setHasMore(Boolean(paginationData?.hasMore));
          setTotalTasksCount(paginationData?.total ?? (append ? tasks.length + mapped.length : mapped.length));

          if (urlTaskId) {
            const found = mapped.find((t: any) => t.id === urlTaskId);
            if (found) setInspectingTask(found);
          }
        }
      } catch (err) {
        console.warn("Failed to load tasks from API:", err);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [activeWorkspace?.id, setTasks, urlTaskId, tasks.length]
  );

  // Initial load and workspace change reload
  React.useEffect(() => {
    loadTasks(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.id, urlTaskId]);

  // Realtime reconnect catch-up resynchronization
  React.useEffect(() => {
    const unsub = onReconnect(() => {
      apiClient.invalidate("/api/tasks");
      loadTasks(1, false);
    });
    return unsub;
  }, [onReconnect, loadTasks]);

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      (task.title || "").toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
      (task.description || "").toLowerCase().includes(filters.searchQuery.toLowerCase());
    const matchesPriority =
      filters.priorityFilter === "all" || task.priority === filters.priorityFilter;
    const matchesProject =
      selectedProjectFilter === "all" || task.projectId === selectedProjectFilter;
    return matchesSearch && matchesPriority && matchesProject;
  });

  const sortedTasks = React.useMemo(() => {
    if (!sortField || !sortDirection) return filteredTasks;

    return [...filteredTasks].sort((a, b) => {
      let comparison = 0;

      if (sortField === "title") {
        comparison = a.title.localeCompare(b.title);
      } else if (sortField === "priority") {
        const pA = priorityWeight[a.priority] || 0;
        const pB = priorityWeight[b.priority] || 0;
        comparison = pA - pB;
      } else if (sortField === "status") {
        const sA = statusWeight[a.status] || 0;
        const sB = statusWeight[b.status] || 0;
        comparison = sA - sB;
      } else if (sortField === "dueDate") {
        const dA = a.dueDate ? new Date(a.dueDate).getTime() : 0;
        const dB = b.dueDate ? new Date(b.dueDate).getTime() : 0;
        comparison = dA - dB;
      }

      return sortDirection === "desc" ? -comparison : comparison;
    });
  }, [filteredTasks, sortField, sortDirection]);

  const handleOpenNewTask = (status: TaskStatus = "todo") => {
    setDefaultColumnStatus(status);
    setEditingTask(null);
    setCreateTaskModalOpen(true);
  };

  return (
    <div className="relative flex flex-col gap-6">
      <AnimatedGrid />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Tasks
            </h1>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-mono font-bold text-primary">
              {filteredTasks.length} Tasks
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Manage, schedule, and track tasks across your workspace delivery pipelines.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Switcher (Board | List) */}
          <div className="flex items-center rounded-lg border border-border bg-card p-1 shadow-xs">
            <button
              onClick={() => setViewMode("board")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                viewMode === "board"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Board</span>
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                viewMode === "list"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              <span>List</span>
            </button>
          </div>

          <MagnetButton
            size="sm"
            onClick={() => handleOpenNewTask("todo")}
            className="gap-1.5 text-xs font-semibold"
          >
            <Plus className="h-4 w-4" />
            <span>New Task</span>
          </MagnetButton>
        </div>
      </div>

      {/* Search & Filter Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-lg border border-border bg-card p-3.5 shadow-xs">
        <div className="flex flex-1 items-center gap-2.5">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter tasks by title or keyword..."
              value={filters.searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8.5 w-full rounded-md border border-border bg-card pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>

          {/* Project Filter */}
          <select
            value={selectedProjectFilter}
            onChange={(e) => setSelectedProjectFilter(e.target.value)}
            className="h-8.5 rounded-md border border-border bg-card px-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
          >
            <option value="all">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Priority Filter Pills & Reset */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5 text-xs">
            <button
              onClick={() => setPriorityFilter("all")}
              className={cn(
                "rounded px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer",
                filters.priorityFilter === "all"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              All
            </button>
            <button
              onClick={() => setPriorityFilter("urgent")}
              className={cn(
                "rounded px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer",
                filters.priorityFilter === "urgent"
                  ? "bg-priority-urgent/20 text-priority-urgent font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Urgent
            </button>
            <button
              onClick={() => setPriorityFilter("high")}
              className={cn(
                "rounded px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer",
                filters.priorityFilter === "high"
                  ? "bg-priority-high/20 text-priority-high font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              High
            </button>
          </div>

          {(filters.searchQuery ||
            filters.priorityFilter !== "all" ||
            selectedProjectFilter !== "all") && (
            <button
              onClick={() => {
                resetFilters();
                setSelectedProjectFilter("all");
              }}
              className="flex h-8.5 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              title="Reset all filters"
            >
              <RotateCcw className="h-3 w-3" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Mode 1: Board View (Exactly 4 Columns) */}
      {viewMode === "board" && (
        isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start pb-6" aria-busy="true">
            {["To Do", "In Progress", "In Review", "Done"].map((colTitle, colIdx) => (
              <div
                key={colIdx}
                className="flex flex-col rounded-xl border border-border/70 bg-card/60 p-3 min-h-[480px] shadow-xs"
              >
                <div className="flex items-center justify-between pb-3 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-2.5 w-2.5 rounded-full" />
                    <span className="text-xs font-bold text-muted-foreground">{colTitle}</span>
                  </div>
                  <Skeleton className="h-4 w-6 rounded-full" />
                </div>
                <div className="mt-3 space-y-3 flex-1">
                  {[1, 2, 3].map((cardIdx) => (
                    <div
                      key={cardIdx}
                      className="rounded-xl border border-border bg-card p-3.5 space-y-2.5 shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Skeleton className="h-4 w-3/4 rounded" />
                        <Skeleton className="h-4 w-12 rounded-full shrink-0" />
                      </div>
                      <Skeleton className="h-3 w-1/2 rounded" />
                      <div className="flex items-center justify-between pt-2 border-t border-border/40">
                        <Skeleton className="h-3 w-16 rounded" />
                        <SkeletonAvatar size="xs" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-6">
            {columnsConfig.map((col) => {
              const colTasks = filteredTasks.filter((t) => t.status === col.status);
              return (
                <KanbanColumn
                  key={col.status}
                  status={col.status}
                  title={col.title}
                  dotColor={col.dotColor}
                  tasks={colTasks}
                  onAddTask={handleOpenNewTask}
                  onEditTask={(task) => setEditingTask(task)}
                  onSelectTask={(task) => setInspectingTask(task)}
                />
              );
            })}
          </div>
        )
      )}

      {/* Mode 2: List View with Interactive Sorting */}
      {viewMode === "list" && (
        isLoading ? (
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs p-4 space-y-3" aria-busy="true">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <Skeleton className="h-4 w-52 rounded" />
                  <Skeleton className="h-3 w-32 rounded" />
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-4 w-24 rounded" />
                  <SkeletonAvatar size="xs" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground select-none">
                    <th
                      onClick={() => handleSort("title")}
                      className="py-3 px-4 hover:text-foreground cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Task</span>
                        {sortField === "title" ? (
                          <span className="text-primary font-bold">{sortDirection === "asc" ? "▲" : "▼"}</span>
                        ) : (
                          <span className="text-muted-foreground/40">↕</span>
                        )}
                      </div>
                    </th>
                    <th className="py-3 px-4">Project</th>
                    <th className="py-3 px-4">Assignee</th>
                    <th
                      onClick={() => handleSort("priority")}
                      className="py-3 px-4 hover:text-foreground cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Priority</span>
                        {sortField === "priority" ? (
                          <span className="text-primary font-bold">{sortDirection === "asc" ? "▲" : "▼"}</span>
                        ) : (
                          <span className="text-muted-foreground/40">↕</span>
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("status")}
                      className="py-3 px-4 hover:text-foreground cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Status</span>
                        {sortField === "status" ? (
                          <span className="text-primary font-bold">{sortDirection === "asc" ? "▲" : "▼"}</span>
                        ) : (
                          <span className="text-muted-foreground/40">↕</span>
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("dueDate")}
                      className="py-3 px-4 hover:text-foreground cursor-pointer transition-colors"
                    >
                    <div className="flex items-center gap-1.5">
                      <span>Due Date</span>
                      {sortField === "dueDate" ? (
                        <span className="text-primary font-bold">{sortDirection === "asc" ? "▲" : "▼"}</span>
                      ) : (
                        <span className="text-muted-foreground/40">↕</span>
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {sortedTasks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      No tasks found matching current filters.
                    </td>
                  </tr>
                ) : (
                  sortedTasks.map((task) => {
                    const taskProject = projects.find((p) => p.id === task.projectId);
                    return (
                      <tr
                        key={task.id}
                        onClick={() => setInspectingTask(task)}
                        className="hover:bg-muted/30 transition-colors cursor-pointer group"
                      >
                        <td className="py-3 px-4">
                          <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                            {task.title}
                          </div>
                          {task.description && (
                            <div className="text-[11px] text-muted-foreground truncate max-w-xs">
                              {task.description}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {taskProject ? (
                            <div className="flex items-center gap-1.5">
                              <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: taskProject.color || "#0284C7" }}
                              />
                              <span className="font-medium text-foreground truncate max-w-[120px]">
                                {taskProject.name}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-foreground">
                            {task.assigneeId || "Unassigned"}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px] font-mono font-medium uppercase",
                              task.priority === "urgent"
                                ? "bg-priority-urgent/10 text-priority-urgent border-priority-urgent/30"
                                : task.priority === "high"
                                ? "bg-priority-high/10 text-priority-high border-priority-high/30"
                                : "bg-priority-medium/10 text-priority-medium border-priority-medium/30"
                            )}
                          >
                            {task.priority}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px] font-mono font-medium uppercase",
                              task.status === "done"
                                ? "bg-status-done/10 text-status-done border-status-done/30"
                                : task.status === "in_progress"
                                ? "bg-status-progress/10 text-status-progress border-status-progress/30"
                                : task.status === "in_review"
                                ? "bg-status-review/10 text-status-review border-status-review/30"
                                : "bg-status-todo/10 text-status-todo border-status-todo/30"
                            )}
                          >
                            {task.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px]">
                          {task.dueDate ? (() => {
                            const dueInfo = getDueDateState(task.dueDate, task.status);
                            return (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-mono border",
                                  dueInfo.badgeClass
                                )}
                                title={task.dueDate}
                              >
                                {dueInfo.label}
                              </span>
                            );
                          })() : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        )
      )}

      {/* Pagination / Load More Footer */}
      {hasMore && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl border border-border/80 bg-card/60 backdrop-blur-xs shadow-xs text-xs text-muted-foreground animate-in fade-in">
          <div className="flex items-center gap-2">
            <span>
              Menampilkan <strong className="text-foreground font-semibold">{tasks.length}</strong> dari{" "}
              <strong className="text-foreground font-semibold">{totalTasksCount}</strong> total task
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={isLoadingMore}
            onClick={() => loadTasks(page + 1, true)}
            className="gap-2 text-xs h-8 px-4 font-medium hover:border-primary/50 cursor-pointer"
          >
            {isLoadingMore ? (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : null}
            Muat Task Berikutnya ({totalTasksCount - tasks.length > 0 ? `${totalTasksCount - tasks.length} tersisa` : "Lebih Banyak"})
          </Button>
        </div>
      )}

      {/* Task Modal (Create / Edit) */}
      <TaskModal
        editingTask={editingTask}
        defaultStatus={defaultColumnStatus}
        onClose={() => setEditingTask(null)}
      />

      {/* Task Detail Slide-over Drawer */}
      <TaskDetailDrawer
        task={inspectingTask}
        onClose={() => setInspectingTask(null)}
        onEdit={(task) => {
          setInspectingTask(null);
          setEditingTask(task);
        }}
      />
    </div>
  );
}

export default function TasksPage() {
  return (
    <React.Suspense fallback={<TasksLoading />}>
      <TasksContent />
    </React.Suspense>
  );
}
