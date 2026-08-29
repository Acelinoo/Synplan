"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  FolderKanban,
  Layers,
  Plus,
  Users2,
  AlertCircle,
  TrendingUp,
  CheckSquare,
  Shield,
} from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { useWorkspaceStore, useUiStore, useTaskStore } from "@/store";
import { Button } from "@/components/ui/button";
import { MagnetButton } from "@/components/ui/magnet-button";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedGrid } from "@/components/ui/animated-grid";
import { PhaseManager } from "@/components/projects/PhaseManager";
import { calculateProgress, getDueDateState } from "@/lib/projectWorkflow";
import { Task, TaskStatus, TaskPriority } from "@/types";
import { cn } from "@/lib/utils";
import { useRealtime } from "@/components/realtime/RealtimeProvider";

import ProjectDetailLoading from "./loading";

const TaskDetailDrawer = dynamic(
  () => import("@/components/kanban/TaskDetailDrawer").then((mod) => mod.TaskDetailDrawer),
  { ssr: false }
);

const TaskModal = dynamic(
  () => import("@/components/kanban/TaskModal").then((mod) => mod.TaskModal),
  { ssr: false }
);

const PHASES = [
  { id: "planning", name: "Planning", desc: "Requirements & Scope Alignment" },
  { id: "ui_ux", name: "UI/UX", desc: "Wireframes, Mockups & Design Tokens" },
  { id: "development", name: "Development", desc: "Core Implementation & Logic" },
  { id: "integration", name: "Integration", desc: "API, State & Services Link" },
  { id: "testing", name: "Testing", desc: "QA, E2E Matrix & Security Probes" },
  { id: "deployment", name: "Deployment", desc: "Production Build & Release" },
];

const priorityColorMap: Record<string, string> = {
  urgent: "bg-priority-urgent/10 text-priority-urgent border-priority-urgent/30",
  high: "bg-priority-high/10 text-priority-high border-priority-high/30",
  medium: "bg-priority-medium/10 text-priority-medium border-priority-medium/30",
  low: "bg-priority-low/10 text-priority-low border-priority-low/30",
};

const statusColorMap: Record<string, string> = {
  todo: "bg-status-todo/10 text-status-todo border-status-todo/30",
  in_progress: "bg-status-progress/10 text-status-progress border-status-progress/30",
  in_review: "bg-status-review/10 text-status-review border-status-review/30",
  done: "bg-status-done/10 text-status-done border-status-done/30",
};

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.id as string;

  const { activeWorkspace } = useWorkspaceStore();
  const { addToast } = useUiStore();
  const { onEvent } = useRealtime();

  const [project, setProject] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<"overview" | "tasks" | "phases" | "team">("overview");
  const [selectedTask, setSelectedTask] = React.useState<Task | null>(null);
  const [editingTask, setEditingTask] = React.useState<Task | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = React.useState(false);

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
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    setIsLoading(true);
    loadProject();
  }, [loadProject]);

  // --- Realtime Project Tasks Live Synchronization ---
  React.useEffect(() => {
    if (!projectId) return;

    const unsubCreate = onEvent("TASK_CREATED", (event) => {
      const raw = event.payload;
      if (raw && raw.projectId === projectId) {
        setProject((prev: any) => {
          if (!prev) return prev;
          const currentTasks = Array.isArray(prev.tasks) ? prev.tasks : [];
          if (currentTasks.some((t: any) => t.id === raw.id)) return prev;
          return {
            ...prev,
            tasks: [raw, ...currentTasks],
          };
        });
        apiClient.invalidate(`/api/projects/${projectId}`);
      }
    });

    const unsubUpdate = onEvent("TASK_UPDATED", (event) => {
      const raw = event.payload;
      if (raw && raw.id) {
        setProject((prev: any) => {
          if (!prev || !Array.isArray(prev.tasks)) return prev;
          const exists = prev.tasks.some((t: any) => t.id === raw.id);
          if (!exists) return prev;
          return {
            ...prev,
            tasks: prev.tasks.map((t: any) => (t.id === raw.id ? { ...t, ...raw } : t)),
          };
        });
        setSelectedTask((prev) => (prev && prev.id === raw.id ? { ...prev, ...raw } : prev));
        apiClient.invalidate(`/api/projects/${projectId}`);
      }
    });

    const unsubStatus = onEvent("TASK_STATUS_CHANGED", (event) => {
      const raw = event.payload;
      if (raw && raw.taskId) {
        setProject((prev: any) => {
          if (!prev || !Array.isArray(prev.tasks)) return prev;
          const exists = prev.tasks.some((t: any) => t.id === raw.taskId);
          if (!exists) return prev;
          return {
            ...prev,
            tasks: prev.tasks.map((t: any) =>
              t.id === raw.taskId ? { ...t, status: raw.newStatus, completedAt: raw.completedAt } : t
            ),
          };
        });
        setSelectedTask((prev) =>
          prev && prev.id === raw.taskId ? { ...prev, status: raw.newStatus as TaskStatus } : prev
        );
        apiClient.invalidate(`/api/projects/${projectId}`);
      }
    });

    const unsubDelete = onEvent("TASK_DELETED", (event) => {
      const raw = event.payload;
      if (raw && raw.id) {
        setProject((prev: any) => {
          if (!prev || !Array.isArray(prev.tasks)) return prev;
          return {
            ...prev,
            tasks: prev.tasks.filter((t: any) => t.id !== raw.id),
          };
        });
        setSelectedTask((prev) => (prev && prev.id === raw.id ? null : prev));
        apiClient.invalidate(`/api/projects/${projectId}`);
      }
    });

    // Project Live Updates
    const unsubProjUpdate = onEvent("PROJECT_UPDATED", (event) => {
      const raw = event.payload;
      if (raw && raw.id === projectId) {
        setProject((prev: any) => (prev ? { ...prev, ...raw } : prev));
        apiClient.invalidate(`/api/projects/${projectId}`);
      }
    });

    const unsubProjDelete = onEvent("PROJECT_DELETED", (event) => {
      const raw = event.payload;
      if (raw && raw.id === projectId) {
        setProject(null);
        addToast({
          title: "Project Deleted",
          description: "This project was deleted by another team member.",
          variant: "warning",
        });
        apiClient.invalidate("/api/projects");
      }
    });

    // Phase Live Updates
    const unsubPhaseCreate = onEvent("PHASE_CREATED", (event) => {
      const raw = event.payload;
      if (raw && (raw.projectId === projectId || !raw.projectId)) {
        setProject((prev: any) => {
          if (!prev) return prev;
          const currentPhases = Array.isArray(prev.phases) ? prev.phases : [];
          if (currentPhases.some((p: any) => p.id === raw.id)) return prev;
          const updatedPhases = [...currentPhases, raw].sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
          return {
            ...prev,
            phases: updatedPhases,
          };
        });
        apiClient.invalidate(`/api/projects/${projectId}`);
      }
    });

    const unsubPhaseUpdate = onEvent("PHASE_UPDATED", (event) => {
      const raw = event.payload;
      if (raw && raw.id) {
        setProject((prev: any) => {
          if (!prev || !Array.isArray(prev.phases)) return prev;
          const updatedPhases = prev.phases
            .map((p: any) => (p.id === raw.id ? { ...p, ...raw } : p))
            .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
          return {
            ...prev,
            phases: updatedPhases,
          };
        });
        apiClient.invalidate(`/api/projects/${projectId}`);
      }
    });

    const unsubPhaseDelete = onEvent("PHASE_DELETED", (event) => {
      const raw = event.payload;
      if (raw && raw.id) {
        setProject((prev: any) => {
          if (!prev || !Array.isArray(prev.phases)) return prev;
          return {
            ...prev,
            phases: prev.phases.filter((p: any) => p.id !== raw.id),
          };
        });
        apiClient.invalidate(`/api/projects/${projectId}`);
      }
    });

    const unsubPhasesReorder = onEvent("PHASES_REORDERED", (event) => {
      const raw = event.payload;
      if (raw && raw.projectId === projectId && Array.isArray(raw.phases)) {
        setProject((prev: any) => {
          if (!prev || !Array.isArray(prev.phases)) return prev;
          const orderMap = new Map(raw.phases.map((p: any) => [p.id, p.order]));
          const updatedPhases = prev.phases
            .map((p: any) => ({ ...p, order: orderMap.has(p.id) ? orderMap.get(p.id) : p.order }))
            .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
          return {
            ...prev,
            phases: updatedPhases,
          };
        });
        apiClient.invalidate(`/api/projects/${projectId}`);
      }
    });

    return () => {
      unsubCreate();
      unsubUpdate();
      unsubStatus();
      unsubDelete();
      unsubProjUpdate();
      unsubProjDelete();
      unsubPhaseCreate();
      unsubPhaseUpdate();
      unsubPhaseDelete();
      unsubPhasesReorder();
    };
  }, [projectId, onEvent, addToast]);

  if (isLoading) {
    return <ProjectDetailLoading />;
  }

  if (!project) {
    return (
      <div className="rounded-2xl border border-border bg-card p-12 text-center space-y-4">
        <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto" />
        <h2 className="text-base font-bold text-foreground">Project Not Found</h2>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          The requested project does not exist or has been removed from this workspace.
        </p>
        <Button size="sm" onClick={() => router.push("/projects")} className="gap-1.5 text-xs font-semibold">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Projects</span>
        </Button>
      </div>
    );
  }

  const tasks: any[] = Array.isArray(project.tasks) ? project.tasks : [];
  const members: any[] = Array.isArray(project.members) ? project.members : [];
  const phases: any[] = Array.isArray(project.phases) ? project.phases : [];

  const completedTasks = tasks.filter((t) => t.status === "DONE" || t.status === "done").length;
  const computedProgress = calculateProgress(completedTasks, tasks.length);
  const upcomingTasks = tasks.slice(0, 4);

  const handleOpenTask = (task: any) => {
    const fullTask: Task = {
      id: task.id,
      workspaceId: task.workspaceId || project.workspaceId || "",
      projectId: task.projectId || project.id,
      phaseId: task.phaseId || null,
      title: task.title,
      description: task.description || "",
      status: (task.status?.toLowerCase() === "blocked" ? "in_review" : task.status?.toLowerCase() || "todo") as TaskStatus,
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

  const handleCreateTask = () => {
    setEditingTask(null);
    setIsTaskModalOpen(true);
  };

  return (
    <div className="relative space-y-6">
      <AnimatedGrid />

      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href="/projects"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Projects</span>
            </Link>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-xs font-semibold text-foreground truncate max-w-xs">{project.name}</span>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <div
              className="h-3.5 w-3.5 rounded-md shrink-0 shadow-xs"
              style={{ backgroundColor: project.color || "#6366F1" }}
            />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{project.name}</h1>
            <span
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px] font-mono font-medium capitalize",
                project.status?.toUpperCase() === "ARCHIVED"
                  ? "bg-muted text-muted-foreground border-border"
                  : project.status?.toUpperCase() === "COMPLETED"
                  ? "bg-status-done/10 text-status-done border-status-done/30"
                  : project.status?.toUpperCase() === "PLANNING"
                  ? "bg-primary/10 text-primary border-primary/30"
                  : project.status?.toUpperCase() === "ON_HOLD"
                  ? "bg-status-review/10 text-status-review border-status-review/30"
                  : "bg-status-progress/10 text-status-progress border-status-progress/30"
              )}
            >
              {project.status?.toLowerCase().replace("_", " ")}
            </span>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            onClick={handleCreateTask}
            className="h-8 gap-1.5 text-xs font-semibold"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Task</span>
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 border-b border-border">
        {[
          { id: "overview", label: "Overview", icon: FolderKanban },
          { id: "tasks", label: `Tasks (${tasks.length})`, icon: CheckSquare },
          { id: "phases", label: `Phases (${phases.length})`, icon: Layers },
          { id: "team", label: `Team (${members.length})`, icon: Users2 },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-all cursor-pointer",
                isActive
                  ? "border-primary text-foreground font-bold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Overview */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SpotlightCard className="p-4 space-y-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Progress</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-mono font-bold text-foreground">{computedProgress}%</span>
                <span className="text-xs text-muted-foreground font-mono">({completedTasks}/{tasks.length} tasks)</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${computedProgress}%`, backgroundColor: project.color || "#6366F1" }}
                />
              </div>
            </SpotlightCard>

            <SpotlightCard className="p-4 space-y-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Due Date</span>
              <div className="flex items-center gap-2 pt-1">
                <Calendar className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-semibold font-mono text-foreground">
                  {project.deadline ? new Date(project.deadline).toLocaleDateString() : "Not set"}
                </span>
              </div>
            </SpotlightCard>

            <SpotlightCard className="p-4 space-y-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Created Date</span>
              <div className="flex items-center gap-2 pt-1">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-semibold font-mono text-foreground">
                  {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : "Recent"}
                </span>
              </div>
            </SpotlightCard>

            <SpotlightCard className="p-4 space-y-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Squad Members</span>
              <div className="flex items-center gap-2 pt-1">
                <Users2 className="h-4 w-4 text-status-done shrink-0" />
                <span className="text-sm font-semibold text-foreground">
                  {members.length} Assigned
                </span>
              </div>
            </SpotlightCard>
          </div>

          {/* Project Description Card */}
          <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <h3 className="text-sm font-bold text-foreground">Project Description</h3>
            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {project.description || "No description provided for this project."}
            </p>
          </div>

          {/* Overview Upcoming Tasks Preview */}
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground">Upcoming Delivery Tasks</h3>
                <p className="text-xs text-muted-foreground">Recent and high-priority tasks in this project</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("tasks")}
                className="text-xs h-7.5"
              >
                View All Tasks ({tasks.length})
              </Button>
            </div>

            {upcomingTasks.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No tasks logged yet for this project.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {upcomingTasks.map((task) => {
                  const statusKey = (task.status || "todo").toLowerCase();
                  const priorityKey = (task.priority || "medium").toLowerCase();
                  return (
                    <div
                      key={task.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`Inspect task ${task.title}`}
                      onClick={() => handleOpenTask(task)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleOpenTask(task);
                        }
                      }}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-2.5 px-2 hover:bg-muted/30 focus:bg-muted/30 focus:outline-hidden rounded-xl transition-colors cursor-pointer"
                    >
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <p className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>Assignee: {task.assignee?.name || "Unassigned"}</span>
                          {task.dueDate && <span>· Due: {new Date(task.dueDate).toLocaleDateString()}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn("rounded-full border px-2 py-0.5 text-[9px] font-mono font-medium uppercase", priorityColorMap[priorityKey] || "bg-muted text-foreground")}>
                          {task.priority}
                        </span>
                        <span className={cn("rounded-full border px-2 py-0.5 text-[9px] font-mono font-medium uppercase", statusColorMap[statusKey] || "bg-muted text-foreground")}>
                          {task.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Tasks */}
      {activeTab === "tasks" && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground">Project Tasks</h3>
              <p className="text-xs text-muted-foreground">All tasks mapped to this delivery stream</p>
            </div>
            <Button
              size="sm"
              onClick={handleCreateTask}
              className="h-8 gap-1.5 text-xs font-semibold"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Task</span>
            </Button>
          </div>

          {tasks.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground space-y-2">
              <CheckSquare className="h-8 w-8 mx-auto text-muted-foreground/60" />
              <p>No tasks associated with this project yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {tasks.map((task) => {
                const statusKey = (task.status || "todo").toLowerCase();
                const priorityKey = (task.priority || "medium").toLowerCase();
                return (
                  <div
                    key={task.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`Inspect task ${task.title}`}
                    onClick={() => handleOpenTask(task)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleOpenTask(task);
                      }
                    }}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 px-2 hover:bg-muted/30 focus:bg-muted/30 focus:outline-hidden rounded-xl transition-colors cursor-pointer"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground truncate">{task.title}</p>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>Assignee: {task.assignee?.name || "Unassigned"}</span>
                        {task.dueDate && <span>· Due: {new Date(task.dueDate).toLocaleDateString()}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-mono font-medium uppercase", priorityColorMap[priorityKey] || "bg-muted text-foreground")}>
                        {task.priority}
                      </span>
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-mono font-medium uppercase", statusColorMap[statusKey] || "bg-muted text-foreground")}>
                        {task.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Phases */}
      {activeTab === "phases" && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <PhaseManager
            projectId={project.id}
            phases={phases}
            tasks={tasks}
            projectColor={project.color}
            onPhasesChanged={loadProject}
          />
        </div>
      )}

      {/* Tab 4: Team */}
      {activeTab === "team" && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">Project Team Members</h3>
            <p className="text-xs text-muted-foreground">Assigned collaborators from workspace squad</p>
          </div>

          {members.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              No specific members assigned directly to this project.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {members.map((mem) => {
                const userName = mem.user?.name || "Squad Member";
                const userEmail = mem.user?.email || "";
                const userRole = mem.role || "MEMBER";
                return (
                  <div
                    key={mem.id}
                    className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-xs"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-xs font-bold text-primary font-mono">
                      {userName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground truncate">{userName}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{userEmail}</p>
                    </div>
                    <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground uppercase">
                      {userRole}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Task Detail Drawer for in-place inspection */}
      <TaskDetailDrawer
        task={selectedTask}
        onClose={() => {
          setSelectedTask(null);
          loadProject();
        }}
        onEdit={(t) => {
          setSelectedTask(null);
          setEditingTask(t);
          setIsTaskModalOpen(true);
        }}
      />

      {/* Task Modal for creation/editing inside project */}
      {isTaskModalOpen && (
        <TaskModal
          editingTask={editingTask}
          defaultStatus="todo"
          onClose={() => {
            setEditingTask(null);
            setIsTaskModalOpen(false);
            loadProject();
          }}
        />
      )}
    </div>
  );
}
