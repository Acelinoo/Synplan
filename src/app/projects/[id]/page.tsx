"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  FolderKanban,
  SlidersHorizontal,
  CheckSquare,
  Table as TableIcon,
  Activity,
  Settings,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  Users2,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { useWorkspaceStore, useUiStore, useTaskStore } from "@/store";
import { Button } from "@/components/ui/button";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import {
  Task,
  TaskStatus,
  TaskPriority,
  ProjectHealthSignals,
  BoardViewData,
  StructuredListView,
} from "@/types";
import {
  ProjectHeader,
  SharedTaskToolbar,
  ProjectBoardView,
  ProjectListView,
  ProjectTableView,
  ProjectOverview,
  ProjectActivityTab,
  ProjectSettingsTab,
  ProjectMembersTab,
  ProjectViewMode,
  SharedFilterState,
} from "@/components/project-workspace";
import { cn } from "@/lib/utils";
import ProjectDetailLoading from "./loading";

const TaskDetailDrawer = dynamic(
  () => import("@/components/kanban/TaskDetailDrawer").then((mod) => mod.TaskDetailDrawer),
  { ssr: false }
);

const TaskModal = dynamic(
  () => import("@/components/kanban/TaskModal").then((mod) => mod.TaskModal),
  { ssr: false }
);

type ProjectTab = "overview" | "tasks" | "members" | "activity" | "settings";

export default function ProjectWorkspacePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = params?.id as string;

  const { activeWorkspace } = useWorkspaceStore();
  const { addToast, setCreateTaskModalOpen, isCreateTaskModalOpen } = useUiStore();
  const { onEvent, onReconnect } = useRealtime();

  // RBAC Permission derivation
  const wsRole = activeWorkspace?.role || "MEMBER";
  const isViewer = wsRole === "VIEWER";
  const canEdit = !isViewer;
  const canDelete = wsRole === "OWNER" || wsRole === "ADMIN";

  // Active Context Tabs
  const [activeTab, setActiveTab] = React.useState<ProjectTab>("overview");
  // Active Work View inside 'tasks' tab: board | list | table
  const [taskViewMode, setTaskViewMode] = React.useState<ProjectViewMode>("board");

  // Shared Filters State
  const [filters, setFilters] = React.useState<SharedFilterState>({
    search: "",
    status: "all",
    priority: "all",
    assigneeId: "all",
    phaseId: "all",
  });

  // Authoritative Data State
  const [project, setProject] = React.useState<any>(null);
  const [healthSignals, setHealthSignals] = React.useState<ProjectHealthSignals | null>(null);
  const [boardData, setBoardData] = React.useState<BoardViewData | null>(null);
  const [listData, setListData] = React.useState<StructuredListView | null>(null);
  const [tableTasks, setTableTasks] = React.useState<any[]>([]);
  const [activity, setActivity] = React.useState<any[]>([]);
  const [projectMembers, setProjectMembers] = React.useState<any[]>([]);

  // Loading States
  const [isLoading, setIsLoading] = React.useState(true);
  const [isActivityLoading, setIsActivityLoading] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // Task Inspection & Modal State
  const [selectedTask, setSelectedTask] = React.useState<Task | null>(null);
  const [editingTask, setEditingTask] = React.useState<Task | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = React.useState(false);
  const [defaultTaskStatus, setDefaultTaskStatus] = React.useState<TaskStatus>("todo");

  // Danger Zone Confirmation Modal (for Header action)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false);
  const [deleteInput, setDeleteInput] = React.useState("");
  const [isDeleting, setIsDeleting] = React.useState(false);

  // 1. Fetch Authoritative Project Core
  const loadProject = React.useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await apiClient.getProject(projectId);
      if (res.success && res.data) {
        setProject(res.data);
      } else {
        setProject(null);
      }
    } catch (err) {
      console.warn("Failed to load project details:", err);
      setProject(null);
    }
  }, [projectId]);

  // 2. Fetch Authoritative Health Signals
  const loadHealthSignals = React.useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await apiClient.getProjectHealth(projectId, activeWorkspace?.id);
      if (res.success && res.data) {
        setHealthSignals(res.data);
      }
    } catch (err) {
      console.warn("Failed to load health signals:", err);
    }
  }, [projectId, activeWorkspace?.id]);

  // 3. Fetch View-Specific Task Data
  const loadTasksForView = React.useCallback(async () => {
    if (!projectId) return;
    try {
      const [bRes, lRes, tRes] = await Promise.all([
        apiClient.getTasks({
          workspaceId: activeWorkspace?.id,
          projectId,
          view: "board",
        }),
        apiClient.getTasks({
          workspaceId: activeWorkspace?.id,
          projectId,
          view: "list",
        }),
        apiClient.getTasks({
          workspaceId: activeWorkspace?.id,
          projectId,
          view: "table",
        }),
      ]);

      if (bRes.success && bRes.data) {
        setBoardData(bRes.data);
      }
      if (lRes.success && lRes.data) {
        setListData(lRes.data);
      }
      if (tRes.success && Array.isArray(tRes.data)) {
        setTableTasks(tRes.data);
      }
    } catch (err) {
      console.warn("Failed to fetch task views:", err);
    }
  }, [projectId, activeWorkspace?.id]);

  // 4. Fetch Project Activity
  const loadProjectActivity = React.useCallback(async () => {
    if (!projectId) return;
    setIsActivityLoading(true);
    try {
      const res = await apiClient.getActivity({
        workspaceId: activeWorkspace?.id,
        projectId,
        limit: 30,
      });
      if (res.success && Array.isArray(res.data)) {
        setActivity(res.data);
      }
    } catch (err) {
      console.warn("Failed to load project activity:", err);
    } finally {
      setIsActivityLoading(false);
    }
  }, [projectId, activeWorkspace?.id]);

  // 5. Fetch Dedicated Project Members (with active task telemetry)
  const loadProjectMembers = React.useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await apiClient.getProjectMembers(projectId);
      if (res.success && Array.isArray(res.data)) {
        setProjectMembers(res.data);
      }
    } catch (err) {
      console.warn("Failed to load project squad members:", err);
    }
  }, [projectId]);

  // Global Refresher
  const refreshAll = React.useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([
      loadProject(),
      loadHealthSignals(),
      loadTasksForView(),
      loadProjectActivity(),
      loadProjectMembers(),
    ]);
    setIsRefreshing(false);
  }, [loadProject, loadHealthSignals, loadTasksForView, loadProjectActivity, loadProjectMembers]);

  // Initial Workspace Boot
  React.useEffect(() => {
    let mounted = true;
    async function boot() {
      setIsLoading(true);
      await Promise.all([
        loadProject(),
        loadHealthSignals(),
        loadTasksForView(),
        loadProjectActivity(),
        loadProjectMembers(),
      ]);
      if (mounted) setIsLoading(false);
    }
    boot();
    return () => {
      mounted = false;
    };
  }, [loadProject, loadHealthSignals, loadTasksForView, loadProjectActivity, loadProjectMembers]);

  // --- Realtime Project Live Synchronization ---
  React.useEffect(() => {
    if (!projectId) return;

    const handleTaskChange = () => {
      apiClient.invalidate(`/api/projects/${projectId}`);
      apiClient.invalidate("/api/tasks");
      loadProject();
      loadHealthSignals();
      loadTasksForView();
      loadProjectMembers();
    };

    const handleMemberChange = () => {
      apiClient.invalidate(`/api/projects/${projectId}`);
      loadProject();
      loadProjectMembers();
      loadHealthSignals();
    };

    const unsubTaskCreated = onEvent("TASK_CREATED", (event) => {
      if (event.payload?.projectId === projectId || (event as any).meta?.projectId === projectId) {
        handleTaskChange();
      }
    });
    const unsubTaskUpdated = onEvent("TASK_UPDATED", (event) => {
      if (event.payload?.projectId === projectId || (event as any).meta?.projectId === projectId) {
        handleTaskChange();
      }
    });
    const unsubStatusChanged = onEvent("TASK_STATUS_CHANGED", (event) => {
      if (event.payload?.projectId === projectId || (event as any).meta?.projectId === projectId) {
        handleTaskChange();
      }
    });
    const unsubTaskDeleted = onEvent("TASK_DELETED", (event) => {
      if (event.payload?.projectId === projectId || (event as any).meta?.projectId === projectId) {
        handleTaskChange();
        setSelectedTask((prev) => (prev && prev.id === event.payload?.id ? null : prev));
      }
    });
    const unsubProjUpdated = onEvent("PROJECT_UPDATED", (event) => {
      if (event.payload?.id === projectId) {
        loadProject();
        loadHealthSignals();
      }
    });
    const unsubProjDeleted = onEvent("PROJECT_DELETED", (event) => {
      if (event.payload?.id === projectId) {
        addToast({
          title: "Project Deleted",
          description: "This project was deleted by another squad member.",
          variant: "warning",
        });
        router.push("/projects");
      }
    });

    const unsubMemberAdded = onEvent("PROJECT_MEMBER_ADDED", (event) => {
      if ((event as any).payload?.projectId === projectId || (event as any).meta?.projectId === projectId) {
        handleMemberChange();
      }
    });
    const unsubMemberUpdated = onEvent("PROJECT_MEMBER_UPDATED", (event) => {
      if ((event as any).payload?.projectId === projectId || (event as any).meta?.projectId === projectId) {
        handleMemberChange();
      }
    });
    const unsubMemberRemoved = onEvent("PROJECT_MEMBER_REMOVED", (event) => {
      if ((event as any).payload?.projectId === projectId || (event as any).meta?.projectId === projectId) {
        handleMemberChange();
      }
    });

    const unsubPhaseCreated = onEvent("PHASE_CREATED", (event) => {
      if (event.payload?.projectId === projectId) handleTaskChange();
    });
    const unsubPhaseUpdated = onEvent("PHASE_UPDATED", (event) => {
      if (event.payload?.projectId === projectId) handleTaskChange();
    });
    const unsubPhaseDeleted = onEvent("PHASE_DELETED", (event) => {
      if (event.payload?.projectId === projectId) handleTaskChange();
    });
    const unsubPhasesReordered = onEvent("PHASES_REORDERED", (event) => {
      if (event.payload?.projectId === projectId) handleTaskChange();
    });

    return () => {
      unsubTaskCreated();
      unsubTaskUpdated();
      unsubStatusChanged();
      unsubTaskDeleted();
      unsubProjUpdated();
      unsubProjDeleted();
      unsubMemberAdded();
      unsubMemberUpdated();
      unsubMemberRemoved();
      unsubPhaseCreated();
      unsubPhaseUpdated();
      unsubPhaseDeleted();
      unsubPhasesReordered();
    };
  }, [projectId, onEvent, loadProject, loadHealthSignals, loadTasksForView, loadProjectMembers, addToast, router]);

  // Realtime reconnect catch-up resynchronization
  React.useEffect(() => {
    const unsub = onReconnect(() => {
      refreshAll();
    });
    return unsub;
  }, [onReconnect, refreshAll]);

  // Loading state
  if (isLoading) {
    return <ProjectDetailLoading />;
  }

  // Not Found State
  if (!project) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center space-y-4 shadow-2xs">
        <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto" />
        <h2 className="text-base font-bold text-foreground">Project Not Found</h2>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          The requested project does not exist or has been removed from this workspace.
        </p>
        <Button
          size="sm"
          onClick={() => router.push("/projects")}
          className="gap-1.5 text-xs font-semibold cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Projects</span>
        </Button>
      </div>
    );
  }

  const rawTasks: any[] = Array.isArray(project.tasks) ? project.tasks : [];
  const phases: any[] = Array.isArray(project.phases) ? project.phases : [];
  const displayMembers: any[] = projectMembers.length > 0
    ? projectMembers
    : (Array.isArray(project.members) ? project.members : []);

  // Filtered tasks across board/list/table
  const filteredTasks = rawTasks.filter((t) => {
    const matchesSearch =
      !filters.search.trim() ||
      (t.title || "").toLowerCase().includes(filters.search.toLowerCase()) ||
      (t.description || "").toLowerCase().includes(filters.search.toLowerCase());

    const matchesStatus =
      filters.status === "all" ||
      (t.status || "").toLowerCase() === filters.status.toLowerCase();

    const matchesPriority =
      filters.priority === "all" ||
      (t.priority || "").toLowerCase() === filters.priority.toLowerCase();

    const matchesAssignee =
      filters.assigneeId === "all" ||
      t.assigneeId === filters.assigneeId ||
      t.assignee?.id === filters.assigneeId;

    const matchesPhase =
      filters.phaseId === "all" || t.phaseId === filters.phaseId;

    return (
      matchesSearch &&
      matchesStatus &&
      matchesPriority &&
      matchesAssignee &&
      matchesPhase
    );
  });

  const isFiltered =
    Boolean(filters.search.trim()) ||
    filters.status !== "all" ||
    filters.priority !== "all" ||
    filters.assigneeId !== "all" ||
    filters.phaseId !== "all";

  // Task Handlers
  const handleOpenTask = (task: any) => {
    const fullTask: Task = {
      id: task.id,
      workspaceId: task.workspaceId || project.workspaceId || "",
      projectId: task.projectId || project.id,
      phaseId: task.phaseId || null,
      title: task.title,
      description: task.description || "",
      status: (task.status?.toLowerCase() || "todo") as TaskStatus,
      priority: (task.priority?.toLowerCase() || "medium") as TaskPriority,
      assigneeId: task.assigneeId || task.assignee?.id || "",
      dueDate: task.dueDate ? task.dueDate.split("T")[0] : "",
      order: task.order || 0,
      subtasks: task.subtasks || [],
      tags: task.tags || [],
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
    setSelectedTask(fullTask);
  };

  const handleCreateTask = (status: TaskStatus = "todo") => {
    setDefaultTaskStatus(status);
    setEditingTask(null);
    setIsTaskModalOpen(true);
  };

  const handleStatusChange = async (taskId: string, nextStatus: TaskStatus) => {
    try {
      const res = await apiClient.updateTaskStatus(taskId, nextStatus);
      if (res.success) {
        addToast({
          title: "Status Updated",
          description: `Task status transitioned to ${nextStatus.replace("_", " ")}.`,
          variant: "success",
        });
        loadTasksForView();
        loadProject();
        loadHealthSignals();
        loadProjectMembers();
      } else {
        addToast({
          title: "Status Transition Rejected",
          description: res.error || res.message || "Invalid status transition in state machine.",
          variant: "danger",
        });
      }
    } catch (err: any) {
      addToast({
        title: "Connection Error",
        description: err?.message || "Failed to update task status.",
        variant: "danger",
      });
    }
  };

  const handleQuickStatusToggle = (taskId: string, currentStatus: string) => {
    const isDone = (currentStatus || "").toLowerCase() === "done";
    const nextStatus: TaskStatus = isDone ? "todo" : "done";
    handleStatusChange(taskId, nextStatus);
  };

  const handleFilterChange = (updates: Partial<SharedFilterState>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  };

  const handleResetFilters = () => {
    setFilters({
      search: "",
      status: "all",
      priority: "all",
      assigneeId: "all",
      phaseId: "all",
    });
  };

  // Fast project status change
  const handleProjectStatusChange = async (newStatus: string) => {
    try {
      const res = await apiClient.updateProject(projectId, { status: newStatus });
      if (res.success) {
        addToast({
          title: "Project Status Updated",
          description: `Project status successfully updated to ${newStatus.toLowerCase().replace("_", " ")}.`,
          variant: "success",
        });
        loadProject();
        loadHealthSignals();
      } else {
        addToast({
          title: "Update Failed",
          description: res.error || res.message || "Could not update status.",
          variant: "danger",
        });
      }
    } catch (err: any) {
      addToast({
        title: "Error",
        description: err?.message || "Failed to update project status.",
        variant: "danger",
      });
    }
  };

  // Fast project deletion
  const handleDeleteProject = async () => {
    if (deleteInput !== project.name) return;

    setIsDeleting(true);
    try {
      const res = await apiClient.deleteProject(project.id, {
        workspaceId: project.workspaceId,
      });

      if (res.success) {
        addToast({
          title: "Project Deleted",
          description: `Project "${project.name}" has been permanently removed.`,
          variant: "warning",
        });
        router.push("/projects");
      } else {
        addToast({
          title: "Delete Failed",
          description: res.error || "Could not delete project.",
          variant: "danger",
        });
      }
    } catch (err: any) {
      addToast({
        title: "Error",
        description: err?.message || "Network error while deleting project.",
        variant: "danger",
      });
    } finally {
      setIsDeleting(false);
      setIsDeleteConfirmOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Project Context Header */}
      <ProjectHeader
        project={{
          ...project,
          members: displayMembers,
        }}
        health={healthSignals}
        onAddTask={() => handleCreateTask("todo")}
        onOpenSettings={() => setActiveTab("settings")}
        onOpenMembers={() => setActiveTab("members")}
        onStatusChange={handleProjectStatusChange}
        onDeleteProject={() => setIsDeleteConfirmOpen(true)}
        canEdit={canEdit}
        canDelete={canDelete}
      />

      {/* 2. Workspace Context Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border">
        <nav aria-label="Project Workspace Navigation" className="flex items-center gap-1">
          {[
            { id: "overview", label: "Overview", icon: FolderKanban },
            { id: "tasks", label: `Tasks (${rawTasks.length})`, icon: CheckSquare },
            { id: "members", label: `Members (${displayMembers.length})`, icon: Users2 },
            { id: "activity", label: "Activity", icon: Activity },
            { id: "settings", label: "Settings", icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as ProjectTab)}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-semibold transition-all cursor-pointer",
                  isActive
                    ? "border-primary text-foreground font-bold"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Live Refresh Affordance */}
        <div className="pb-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshAll}
            disabled={isRefreshing}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            title="Refresh authoritative project data"
          >
            <RefreshCw className={cn("h-3 w-3 mr-1.5", isRefreshing && "animate-spin")} />
            <span>Sync</span>
          </Button>
        </div>
      </div>

      {/* 3. Tab Contents */}

      {/* Tab A: Overview */}
      {activeTab === "overview" && (
        <ProjectOverview
          project={{
            ...project,
            members: displayMembers,
          }}
          health={healthSignals}
          tasks={rawTasks}
          activity={activity}
          onSelectTask={handleOpenTask}
          onNavigateTab={(tabId) => {
            if (tabId === "board" || tabId === "list" || tabId === "table") {
              setTaskViewMode(tabId as ProjectViewMode);
              setActiveTab("tasks");
            } else if (tabId === "activity" || tabId === "settings" || tabId === "members") {
              setActiveTab(tabId);
            }
          }}
        />
      )}

      {/* Tab B: Tasks Multi-View (Board | List | Table) */}
      {activeTab === "tasks" && (
        <div className="space-y-4">
          {/* Shared Task Toolbar */}
          <SharedTaskToolbar
            viewMode={taskViewMode}
            onViewModeChange={setTaskViewMode}
            filters={filters}
            onFilterChange={handleFilterChange}
            onResetFilters={handleResetFilters}
            members={displayMembers}
            phases={phases}
            totalTasks={rawTasks.length}
            filteredTasksCount={filteredTasks.length}
          />

          {/* Sub-View 1: Board View */}
          {taskViewMode === "board" && (
            <ProjectBoardView
              boardData={boardData}
              onSelectTask={handleOpenTask}
              onAddTask={(st) => handleCreateTask(st || "todo")}
              onStatusChange={handleStatusChange}
              filteredTasks={filteredTasks}
              isFiltered={isFiltered}
            />
          )}

          {/* Sub-View 2: List View */}
          {taskViewMode === "list" && (
            <ProjectListView
              listData={listData}
              onSelectTask={handleOpenTask}
              onAddTask={(phaseId) => handleCreateTask("todo")}
              onStatusToggle={handleQuickStatusToggle}
            />
          )}

          {/* Sub-View 3: Table View */}
          {taskViewMode === "table" && (
            <ProjectTableView
              tasks={filteredTasks}
              onSelectTask={handleOpenTask}
              onStatusToggle={handleQuickStatusToggle}
            />
          )}
        </div>
      )}

      {/* Tab C: Project Squad & Members */}
      {activeTab === "members" && (
        <ProjectMembersTab
          projectId={project.id}
          projectName={project.name}
          members={displayMembers}
          canManageMembers={canEdit}
          onMembersUpdated={() => {
            loadProject();
            loadProjectMembers();
          }}
          onFilterMemberTasks={(memberUserId) => {
            setFilters((prev) => ({ ...prev, assigneeId: memberUserId }));
            setActiveTab("tasks");
          }}
        />
      )}

      {/* Tab D: Activity Stream */}
      {activeTab === "activity" && (
        <ProjectActivityTab
          activity={activity}
          isLoading={isActivityLoading}
          onRefresh={loadProjectActivity}
        />
      )}

      {/* Tab E: Project Settings */}
      {activeTab === "settings" && (
        <ProjectSettingsTab
          project={{
            ...project,
            members: displayMembers,
          }}
          onProjectUpdated={refreshAll}
          canManageSettings={canEdit}
        />
      )}

      {/* Unified Task Detail Drawer */}
      <TaskDetailDrawer
        task={selectedTask}
        onClose={() => {
          setSelectedTask(null);
          loadProject();
          loadTasksForView();
        }}
        onEdit={(t) => {
          setSelectedTask(null);
          setEditingTask(t);
          setIsTaskModalOpen(true);
        }}
      />

      {/* Unified Task Modal for creation/editing inside project */}
      {isTaskModalOpen && (
        <TaskModal
          editingTask={editingTask}
          defaultStatus={defaultTaskStatus}
          defaultProjectId={project.id}
          onClose={() => {
            setEditingTask(null);
            setIsTaskModalOpen(false);
            refreshAll();
          }}
        />
      )}

      {/* Delete Confirmation Modal (Invoked from Header Actions Menu) */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-150">
          <div className="relative w-full max-w-sm rounded-lg border border-destructive/40 bg-card p-5 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <h3 className="text-sm font-bold">Delete Project</h3>
            </div>

            <p className="text-xs text-muted-foreground">
              Permanently removes all phases, milestones, tasks, dependencies, and comments for{" "}
              <strong className="text-foreground">{project.name}</strong>. This action cannot be undone.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Type <strong className="text-destructive font-mono">{project.name}</strong> to confirm:
              </label>
              <input
                type="text"
                placeholder={project.name}
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                className="h-8.5 w-full rounded-md border border-destructive/50 bg-card px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-destructive"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsDeleteConfirmOpen(false);
                  setDeleteInput("");
                }}
                className="h-8 text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteInput !== project.name || isDeleting}
                onClick={handleDeleteProject}
                className="h-8 text-xs font-semibold cursor-pointer"
              >
                {isDeleting ? "Deleting..." : "Delete Project"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
