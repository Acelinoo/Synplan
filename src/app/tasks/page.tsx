"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Plus,
  RefreshCw,
  SlidersHorizontal,
  CheckSquare,
  Table as TableIcon,
  Layers,
  AlertCircle,
  X,
  CheckCircle2,
} from "lucide-react";
import { useWorkspaceStore, useUiStore } from "@/store";
import { Task, TaskStatus, TaskPriority, BoardViewData } from "@/types";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import {
  SharedTaskToolbar,
  ProjectBoardView,
  ProjectListView,
  ProjectTableView,
  ProjectViewMode,
  SharedFilterState,
  ProjectGroupData,
} from "@/components/project-workspace";
import TasksLoading from "./loading";

const TaskModal = dynamic(
  () => import("@/components/kanban/TaskModal").then((mod) => mod.TaskModal),
  { ssr: false }
);

const TaskDetailDrawer = dynamic(
  () => import("@/components/kanban/TaskDetailDrawer").then((mod) => mod.TaskDetailDrawer),
  { ssr: false }
);

export default function GlobalTasksPage() {
  const searchParams = useSearchParams();
  const urlProjectId = searchParams.get("projectId");
  const urlTaskId = searchParams.get("taskId");
  const urlCreate = searchParams.get("create");

  const { activeWorkspace, projects, setProjects, members, setMembers } = useWorkspaceStore();
  const { addToast } = useUiStore();
  const { onEvent, onReconnect } = useRealtime();

  // Active View Mode: board | list | table
  const [viewMode, setViewMode] = React.useState<ProjectViewMode>("board");

  // Shared Filters State
  const [filters, setFilters] = React.useState<SharedFilterState>({
    search: "",
    status: "all",
    priority: "all",
    assigneeId: "all",
    phaseId: "all",
    projectId: urlProjectId || "all",
  });

  // Authoritative Data State
  const [boardData, setBoardData] = React.useState<BoardViewData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Task Inspection & Creation State
  const [inspectingTask, setInspectingTask] = React.useState<Task | null>(null);
  const [editingTask, setEditingTask] = React.useState<Task | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = React.useState(urlCreate === "true");
  const [defaultTaskStatus, setDefaultTaskStatus] = React.useState<TaskStatus>("todo");

  // Multi-Selection State for Table View Batch Operations
  const [selectedTaskIds, setSelectedTaskIds] = React.useState<string[]>([]);
  const [isBatchMutating, setIsBatchMutating] = React.useState(false);

  // 1. Load Authoritative Workspace Tasks
  const loadTasks = React.useCallback(async (bypassCache = false) => {
    if (!activeWorkspace?.id) return;
    try {
      setError(null);
      const res = await apiClient.getTasks(
        {
          workspaceId: activeWorkspace.id,
          view: "board",
        },
        { bypassCache }
      );

      if (res.success && res.data) {
        setBoardData(res.data);
      } else {
        setError(res.error || "Failed to load tasks");
      }
    } catch (err: any) {
      console.error("Failed to load workspace tasks:", err);
      setError(err?.message || "Failed to load tasks");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeWorkspace?.id]);

  // 2. Load Workspace Projects if empty
  const loadProjects = React.useCallback(async () => {
    if (!activeWorkspace?.id) return;
    try {
      const res = await apiClient.getProjects({ workspaceId: activeWorkspace.id });
      if (res.success && Array.isArray(res.data)) {
        setProjects(res.data);
      }
    } catch (err) {
      console.warn("Failed to load projects:", err);
    }
  }, [activeWorkspace?.id, setProjects]);

  // 3. Load Workspace Members if empty
  const loadMembers = React.useCallback(async () => {
    if (!activeWorkspace?.id) return;
    try {
      const res = await apiClient.getTeamMembers(activeWorkspace.id);
      if (res.success && Array.isArray(res.data)) {
        setMembers(res.data);
      }
    } catch (err) {
      console.warn("Failed to load team members:", err);
    }
  }, [activeWorkspace?.id, setMembers]);

  // Initial Data Fetching
  React.useEffect(() => {
    if (activeWorkspace?.id) {
      loadTasks();
      if (projects.length === 0) loadProjects();
      if (members.length === 0) loadMembers();
    }
  }, [activeWorkspace?.id, loadTasks, loadProjects, loadMembers, projects.length, members.length]);

  // Flatten all tasks across board columns into a single flat list
  const allTasks = React.useMemo(() => {
    if (!boardData?.columns) return [];
    const list: any[] = [];
    Object.values(boardData.columns).forEach((col) => {
      if (Array.isArray(col.tasks)) {
        list.push(...col.tasks);
      }
    });
    return list;
  }, [boardData]);

  // Handle URL Task Parameter (deep-link to inspect task with graceful not-found fallback)
  const [hasCheckedDeepLink, setHasCheckedDeepLink] = React.useState(false);

  React.useEffect(() => {
    if (urlTaskId && !isLoading && allTasks.length > 0 && !hasCheckedDeepLink) {
      const found = allTasks.find((t) => t.id === urlTaskId);
      if (found) {
        setInspectingTask(found);
      } else {
        addToast({
          title: "Task Not Found",
          description: "The linked task could not be found or has been removed.",
          variant: "warning",
        });
      }
      setHasCheckedDeepLink(true);
    }
  }, [urlTaskId, isLoading, allTasks, hasCheckedDeepLink, inspectingTask, addToast]);

  // Client-side filtering across authoritative tasks
  const filteredTasks = React.useMemo(() => {
    return allTasks.filter((t) => {
      // Project filter
      if (filters.projectId && filters.projectId !== "all") {
        const pId = t.project?.id || t.projectId;
        if (pId !== filters.projectId) return false;
      }

      // Status filter
      if (filters.status && filters.status !== "all") {
        const st = (t.status || "").toLowerCase();
        if (st !== filters.status.toLowerCase()) return false;
      }

      // Priority filter
      if (filters.priority && filters.priority !== "all") {
        const pr = (t.priority || "").toLowerCase();
        if (pr !== filters.priority.toLowerCase()) return false;
      }

      // Assignee filter
      if (filters.assigneeId && filters.assigneeId !== "all") {
        const aId = t.assignee?.id || t.assigneeId;
        if (aId !== filters.assigneeId) return false;
      }

      // Phase filter
      if (filters.phaseId && filters.phaseId !== "all") {
        const phId = t.phase?.id || t.phaseId;
        if (phId !== filters.phaseId) return false;
      }

      // Text search
      if (filters.search.trim()) {
        const q = filters.search.toLowerCase();
        const matchTitle = (t.title || "").toLowerCase().includes(q);
        const matchProject = (t.project?.name || "").toLowerCase().includes(q);
        if (!matchTitle && !matchProject) return false;
      }

      return true;
    });
  }, [allTasks, filters]);

  // Available phases derived from current project filter
  const availablePhases = React.useMemo(() => {
    if (filters.projectId && filters.projectId !== "all") {
      const selectedProj = projects.find((p) => p.id === filters.projectId);
      if (selectedProj && Array.isArray((selectedProj as any).phases)) {
        return (selectedProj as any).phases;
      }
    }
    // Aggregate all unique phases present in tasks
    const phaseMap = new Map<string, { id: string; name: string }>();
    for (const t of allTasks) {
      if (t.phase?.id && t.phase?.name) {
        phaseMap.set(t.phase.id, { id: t.phase.id, name: t.phase.name });
      }
    }
    return Array.from(phaseMap.values());
  }, [filters.projectId, projects, allTasks]);

  // Hierarchical project groups for List View
  const projectGroups: ProjectGroupData[] = React.useMemo(() => {
    const groupsMap = new Map<string, ProjectGroupData>();

    for (const t of filteredTasks) {
      const projId = t.project?.id || t.projectId || "unassigned";
      const projName = t.project?.name || "Independent Tasks";
      const projColor = t.project?.color || "#64748b";

      if (!groupsMap.has(projId)) {
        groupsMap.set(projId, {
          project: { id: projId, name: projName, color: projColor },
          phases: [],
          ungroupedTasks: [],
          totalTasks: 0,
          completedTasks: 0,
        });
      }

      const group = groupsMap.get(projId)!;
      group.totalTasks++;
      if ((t.status || "").toLowerCase() === "done") {
        group.completedTasks++;
      }

      const phaseId = t.phase?.id || t.phaseId;
      const phaseName = t.phase?.name;

      if (phaseId && phaseName) {
        let phGroup = group.phases.find((p) => p.id === phaseId);
        if (!phGroup) {
          phGroup = {
            id: phaseId,
            name: phaseName,
            tasks: [],
            totalTasks: 0,
            completedTasks: 0,
          };
          group.phases.push(phGroup);
        }
        phGroup.tasks.push(t);
        phGroup.totalTasks++;
        if ((t.status || "").toLowerCase() === "done") {
          phGroup.completedTasks++;
        }
      } else {
        group.ungroupedTasks.push(t);
      }
    }

    return Array.from(groupsMap.values());
  }, [filteredTasks]);

  const isFiltered =
    Boolean(filters.search.trim()) ||
    filters.status !== "all" ||
    filters.priority !== "all" ||
    filters.assigneeId !== "all" ||
    filters.phaseId !== "all" ||
    filters.projectId !== "all";

  // Realtime Integration
  React.useEffect(() => {
    const unsubs = [
      onEvent("TASK_CREATED", () => {
        apiClient.invalidate("/api/tasks");
        loadTasks(true);
      }),
      onEvent("TASK_UPDATED", () => {
        apiClient.invalidate("/api/tasks");
        loadTasks(true);
      }),
      onEvent("TASK_STATUS_CHANGED", () => {
        apiClient.invalidate("/api/tasks");
        loadTasks(true);
      }),
      onEvent("TASK_DELETED", () => {
        apiClient.invalidate("/api/tasks");
        loadTasks(true);
      }),
      onEvent("PROJECT_UPDATED", () => {
        apiClient.invalidate("/api/projects");
        loadProjects();
      }),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub && unsub());
    };
  }, [onEvent, loadTasks, loadProjects]);

  React.useEffect(() => {
    return onReconnect(() => {
      apiClient.invalidate("/api/tasks");
      loadTasks(true);
    });
  }, [onReconnect, loadTasks]);

  // Task Mutations
  const handleStatusChange = async (taskId: string, nextStatus: TaskStatus) => {
    // Optimistic status update in boardData
    setBoardData((prev) => {
      if (!prev) return prev;
      const nextCols = { ...prev.columns };

      let movedTask: any = null;
      for (const colKey of Object.keys(nextCols)) {
        const col = nextCols[colKey];
        const idx = col.tasks.findIndex((t) => t.id === taskId);
        if (idx !== -1) {
          movedTask = { ...col.tasks[idx], status: nextStatus };
          nextCols[colKey] = {
            ...col,
            count: Math.max(0, col.count - 1),
            tasks: col.tasks.filter((t) => t.id !== taskId),
          };
          break;
        }
      }

      if (movedTask) {
        const targetColKey = nextStatus.toUpperCase();
        const lowerColKey = nextStatus.toLowerCase();
        const targetKey = nextCols[targetColKey] ? targetColKey : lowerColKey;

        if (nextCols[targetKey]) {
          nextCols[targetKey] = {
            ...nextCols[targetKey],
            count: nextCols[targetKey].count + 1,
            tasks: [movedTask, ...nextCols[targetKey].tasks],
          };
        }
      }

      return { ...prev, columns: nextCols };
    });

    try {
      const res = await apiClient.updateTask(taskId, { status: nextStatus });
      if (!res.success) {
        addToast({ title: "Failed to update status", variant: "danger" });
        loadTasks(true);
      } else {
        addToast({
          title: "Task status updated",
          description: `Moved to ${nextStatus.replace("_", " ")}`,
          variant: "success",
        });
      }
    } catch (err) {
      addToast({ title: "Network error updating task", variant: "danger" });
      loadTasks(true);
    }
  };

  const handleStatusToggle = async (taskId: string, currentStatus: string) => {
    const isDone = (currentStatus || "").toLowerCase() === "done";
    const nextStatus: TaskStatus = isDone ? "todo" : "done";
    await handleStatusChange(taskId, nextStatus);
  };

  // Batch Operations
  const handleToggleSelectTask = (taskId: string) => {
    setSelectedTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  const handleSelectAllTasks = (taskIds: string[]) => {
    setSelectedTaskIds(taskIds);
  };

  const handleBatchStatus = async (status: TaskStatus) => {
    if (selectedTaskIds.length === 0 || !activeWorkspace?.id) return;
    setIsBatchMutating(true);
    try {
      const res = await apiClient.batchMutateTasks(
        "STATUS",
        selectedTaskIds,
        { status },
        activeWorkspace.id
      );
      if (res.success) {
        addToast({
          title: "Batch status updated",
          description: `Updated ${selectedTaskIds.length} tasks to ${status.replace("_", " ")}`,
          variant: "success",
        });
        setSelectedTaskIds([]);
        loadTasks(true);
      } else {
        addToast({ title: res.error || "Batch update failed", variant: "danger" });
      }
    } catch (err: any) {
      addToast({ title: err?.message || "Batch update failed", variant: "danger" });
    } finally {
      setIsBatchMutating(false);
    }
  };

  const handleBatchPriority = async (priority: TaskPriority) => {
    if (selectedTaskIds.length === 0 || !activeWorkspace?.id) return;
    setIsBatchMutating(true);
    try {
      const res = await apiClient.batchMutateTasks(
        "PRIORITY",
        selectedTaskIds,
        { priority },
        activeWorkspace.id
      );
      if (res.success) {
        addToast({
          title: "Batch priority updated",
          description: `Updated ${selectedTaskIds.length} tasks to ${priority}`,
          variant: "success",
        });
        setSelectedTaskIds([]);
        loadTasks(true);
      } else {
        addToast({ title: res.error || "Batch update failed", variant: "danger" });
      }
    } catch (err: any) {
      addToast({ title: err?.message || "Batch update failed", variant: "danger" });
    } finally {
      setIsBatchMutating(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadTasks(true);
  };

  const handleResetFilters = () => {
    setFilters({
      search: "",
      status: "all",
      priority: "all",
      assigneeId: "all",
      phaseId: "all",
      projectId: "all",
    });
  };

  if (isLoading && !boardData) {
    return <TasksLoading />;
  }

  return (
    <div className="relative flex flex-col gap-6">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-mono">
              Tasks
            </h1>
            <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-mono font-bold text-primary">
              Workspace
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Manage, track, and orchestrate delivery across all projects in the workspace.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-8 gap-1.5 text-xs border-border hover:bg-card cursor-pointer"
            title="Synchronize tasks state"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin text-primary")} />
            <span>Sync</span>
          </Button>

          <Button
            size="sm"
            onClick={() => {
              setDefaultTaskStatus("todo");
              setEditingTask(null);
              setIsTaskModalOpen(true);
            }}
            className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Task</span>
          </Button>
        </div>
      </div>

      {/* 2. Error Banner */}
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => loadTasks(true)} className="h-7 text-xs">
            Retry
          </Button>
        </div>
      )}

      {/* 3. Shared Task Toolbar */}
      <SharedTaskToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        filters={filters}
        onFilterChange={(updates) => setFilters((prev) => ({ ...prev, ...updates }))}
        onResetFilters={handleResetFilters}
        members={members}
        phases={availablePhases}
        projects={projects}
        totalTasks={allTasks.length}
        filteredTasksCount={filteredTasks.length}
      />

      {/* 4. Main Multi-View Task Environment */}
      {allTasks.length === 0 ? (
        /* Empty Workspace State */
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center space-y-3">
          <Layers className="h-9 w-9 mx-auto text-muted-foreground/60" />
          <h3 className="text-sm font-bold text-foreground">No Tasks in Workspace</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Get started by creating your first task to plan delivery across projects.
          </p>
          <Button
            size="sm"
            onClick={() => {
              setDefaultTaskStatus("todo");
              setEditingTask(null);
              setIsTaskModalOpen(true);
            }}
            className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
          >
            + Create First Task
          </Button>
        </div>
      ) : filteredTasks.length === 0 && isFiltered ? (
        /* Filtered Empty State */
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center space-y-3">
          <SlidersHorizontal className="h-8 w-8 mx-auto text-muted-foreground/60" />
          <h3 className="text-sm font-bold text-foreground">No matching tasks</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            No tasks match the currently applied filters or search criteria.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetFilters}
            className="h-8 text-xs cursor-pointer"
          >
            Reset Filters
          </Button>
        </div>
      ) : (
        <>
          {/* Board View */}
          {viewMode === "board" && (
            <ProjectBoardView
              boardData={boardData}
              onSelectTask={(t) => setInspectingTask(t)}
              onAddTask={(st) => {
                setDefaultTaskStatus(st || "todo");
                setEditingTask(null);
                setIsTaskModalOpen(true);
              }}
              onStatusChange={handleStatusChange}
              filteredTasks={filteredTasks}
              isFiltered={isFiltered}
            />
          )}

          {/* List View */}
          {viewMode === "list" && (
            <ProjectListView
              projectGroups={projectGroups}
              onSelectTask={(t) => setInspectingTask(t)}
              onAddTask={(_phaseId, pId) => {
                setDefaultTaskStatus("todo");
                setEditingTask(null);
                setIsTaskModalOpen(true);
              }}
              onStatusToggle={handleStatusToggle}
            />
          )}

          {/* Table View */}
          {viewMode === "table" && (
            <ProjectTableView
              tasks={filteredTasks}
              onSelectTask={(t) => setInspectingTask(t)}
              onStatusToggle={handleStatusToggle}
              showProject={true}
              selectedTaskIds={selectedTaskIds}
              onToggleSelectTask={handleToggleSelectTask}
              onSelectAllTasks={handleSelectAllTasks}
            />
          )}
        </>
      )}

      {/* 5. Floating Batch Operations Bar (for Table View) */}
      {selectedTaskIds.length > 0 && viewMode === "table" && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-xl border border-border bg-card/95 backdrop-blur-md px-4 py-2.5 shadow-2xl animate-in fade-in slide-in-from-bottom-2">
          <span className="text-xs font-mono font-semibold text-foreground whitespace-nowrap">
            {selectedTaskIds.length} selected
          </span>
          <div className="h-4 w-px bg-border" />

          {/* Bulk Status Dropdown */}
          <select
            disabled={isBatchMutating}
            onChange={(e) => {
              if (e.target.value) {
                handleBatchStatus(e.target.value as TaskStatus);
                e.target.value = "";
              }
            }}
            defaultValue=""
            className="h-7 rounded-md border border-border bg-surface-muted px-2 text-xs text-foreground focus:outline-none cursor-pointer"
            aria-label="Batch change status"
          >
            <option value="" disabled>
              Set Status...
            </option>
            <option value="backlog">Backlog</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="in_review">In Review</option>
            <option value="blocked">Blocked</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {/* Bulk Priority Dropdown */}
          <select
            disabled={isBatchMutating}
            onChange={(e) => {
              if (e.target.value) {
                handleBatchPriority(e.target.value as TaskPriority);
                e.target.value = "";
              }
            }}
            defaultValue=""
            className="h-7 rounded-md border border-border bg-surface-muted px-2 text-xs text-foreground focus:outline-none cursor-pointer"
            aria-label="Batch change priority"
          >
            <option value="" disabled>
              Set Priority...
            </option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Clear Selection Button */}
          <button
            onClick={() => setSelectedTaskIds([])}
            className="rounded p-1 text-muted-foreground hover:text-foreground cursor-pointer text-xs"
            title="Clear selection"
            aria-label="Clear selection"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 6. Task Inspection Drawer (Authoritative TaskDetailDrawer reuse) */}
      <TaskDetailDrawer
        task={inspectingTask}
        onClose={() => setInspectingTask(null)}
        onEdit={(t) => {
          setInspectingTask(null);
          setEditingTask(t);
          setIsTaskModalOpen(true);
        }}
      />

      {/* 7. Task Creation/Edit Modal (Authoritative TaskModal reuse) */}
      {isTaskModalOpen && (
        <TaskModal
          editingTask={editingTask}
          defaultStatus={defaultTaskStatus}
          onClose={() => {
            setIsTaskModalOpen(false);
            setEditingTask(null);
            loadTasks(true);
          }}
        />
      )}
    </div>
  );
}
