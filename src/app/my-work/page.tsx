"use client";

import * as React from "react";
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Calendar,
  Flame,
  Ban,
  CheckSquare,
  Plus,
  RefreshCw,
  Search,
  Filter,
  X,
  AlertTriangle,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useWorkspaceStore, useUiStore, useTaskStore } from "@/store";
import { apiClient } from "@/lib/apiClient";
import { MyWorkResult, MyWorkTaskItem, Task, TaskStatus, TaskPriority } from "@/types";
import { Button, Input, Select, Skeleton, EmptyState, PageHeader } from "@/components/ui";
import { MyWorkAttentionBar, AttentionQueueKey } from "@/components/task/MyWorkAttentionBar";
import { MyWorkQueueSection } from "@/components/task/MyWorkQueueSection";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import { cn } from "@/lib/utils";

const TaskDetailDrawer = dynamic(
  () => import("@/components/kanban/TaskDetailDrawer").then((mod) => mod.TaskDetailDrawer),
  { ssr: false }
);

const TaskModal = dynamic(
  () => import("@/components/kanban/TaskModal").then((mod) => mod.TaskModal),
  { ssr: false }
);

export default function MyWorkPage() {
  const { activeWorkspace, isWorkspaceValidated, projects } = useWorkspaceStore();
  const { setCreateTaskModalOpen, addToast } = useUiStore();
  const { onEvent } = useRealtime();

  const [myWorkData, setMyWorkData] = React.useState<MyWorkResult>({
    overdue: [],
    dueToday: [],
    upcoming: [],
    blocked: [],
    highPriority: [],
    recentlyCompleted: [],
    totalActiveCount: 0,
  });

  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [fetchError, setFetchError] = React.useState<string | null>(null);

  // Focus & Filtering State
  const [activeQueueFilter, setActiveQueueFilter] = React.useState<AttentionQueueKey>("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedProjectFilter, setSelectedProjectFilter] = React.useState<string>("all");
  const [selectedPriorityFilter, setSelectedPriorityFilter] = React.useState<string>("all");

  // Task Interaction States
  const [inspectingTask, setInspectingTask] = React.useState<Task | null>(null);
  const [editingTask, setEditingTask] = React.useState<Task | null>(null);

  // Authoritative data fetcher
  const loadMyWork = React.useCallback(
    async (isBackground = false) => {
      if (!activeWorkspace?.id || !isWorkspaceValidated) return;
      if (!isBackground) setIsLoading(true);
      else setIsRefreshing(true);
      setFetchError(null);

      try {
        const res = await apiClient.getMyWork(activeWorkspace.id);
        if (res.success && res.data) {
          const rawCategories = res.data.categories || res.data;
          const rawSummary = res.data.summary;

          const overdue = rawCategories.overdue || [];
          const dueToday = rawCategories.dueToday || [];
          const upcoming = rawCategories.upcoming || [];
          const blocked = rawCategories.blocked || [];
          const highPriority = rawCategories.highPriority || [];
          const recentlyCompleted = rawCategories.recentlyCompleted || [];

          setMyWorkData({
            summary: rawSummary,
            categories: {
              overdue,
              dueToday,
              upcoming,
              blocked,
              highPriority,
              recentlyCompleted,
            },
            overdue,
            dueToday,
            upcoming,
            blocked,
            highPriority,
            recentlyCompleted,
            totalActiveCount: rawSummary?.totalAssigned || overdue.length + dueToday.length + upcoming.length,
          });
        } else {
          setFetchError(res.error || "Failed to load My Work data");
        }
      } catch (err: any) {
        console.warn("Failed to load My Work data:", err);
        setFetchError(err?.message || "Connection error while fetching My Work");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [activeWorkspace?.id, isWorkspaceValidated]
  );

  React.useEffect(() => {
    loadMyWork();
  }, [loadMyWork]);

  // Realtime synchronization across all relevant task mutations
  React.useEffect(() => {
    const handleMutation = () => loadMyWork(true);

    const unsubCreated = onEvent("TASK_CREATED", handleMutation);
    const unsubUpdated = onEvent("TASK_UPDATED", handleMutation);
    const unsubAssigned = onEvent("TASK_ASSIGNED", handleMutation);
    const unsubStatus = onEvent("TASK_STATUS_CHANGED", handleMutation);
    const unsubDeleted = onEvent("TASK_DELETED", handleMutation);

    return () => {
      unsubCreated();
      unsubUpdated();
      unsubAssigned();
      unsubStatus();
      unsubDeleted();
    };
  }, [onEvent, loadMyWork]);

  // Quick Complete status toggle
  const handleQuickComplete = async (taskId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "done" ? "todo" : "done";
    try {
      const res = await apiClient.updateTaskStatus(taskId, nextStatus);
      if (res.success) {
        addToast({
          title: nextStatus === "done" ? "Task Completed" : "Task Reopened",
          description: nextStatus === "done" ? "Task marked as completed." : "Task marked as to do.",
          variant: "success",
        });
        loadMyWork(true);
      } else {
        addToast({
          title: "Status Update Failed",
          description: res.error || "Failed to update task status.",
          variant: "danger",
        });
      }
    } catch (err: any) {
      console.warn("Quick complete failed:", err);
      addToast({
        title: "Error",
        description: err?.message || "Could not update task.",
        variant: "danger",
      });
    }
  };

  // Convert MyWorkTaskItem to Task shape for TaskDetailDrawer
  const handleSelectTask = (item: MyWorkTaskItem) => {
    const taskObj: Task = {
      id: item.id,
      title: item.title,
      description: "",
      status: (item.status?.toLowerCase() || "todo") as TaskStatus,
      priority: (item.priority?.toLowerCase() || "medium") as TaskPriority,
      projectId: item.projectId || item.project?.id || "",
      workspaceId: activeWorkspace?.id || "",
      order: 0,
      subtasks: [],
      tags: [],
      dueDate: item.dueDate ? (typeof item.dueDate === "string" ? item.dueDate : item.dueDate.toISOString()) : undefined,
      phase: (item.phase as any) || null,
      createdAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
    };

    setInspectingTask(taskObj);
  };

  // Client-side filtering predicate applied consistently across queues
  const filterTask = (task: MyWorkTaskItem) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = task.title.toLowerCase().includes(q);
      const matchProject = task.project?.name.toLowerCase().includes(q);
      if (!matchTitle && !matchProject) return false;
    }

    if (selectedProjectFilter !== "all") {
      if (task.project?.id !== selectedProjectFilter && task.projectId !== selectedProjectFilter) {
        return false;
      }
    }

    if (selectedPriorityFilter !== "all") {
      if (task.priority?.toLowerCase() !== selectedPriorityFilter.toLowerCase()) {
        return false;
      }
    }

    return true;
  };

  // Filtered queues
  const filteredOverdue = (myWorkData.overdue || []).filter(filterTask);
  const filteredBlocked = (myWorkData.blocked || []).filter(filterTask);
  const filteredDueToday = (myWorkData.dueToday || []).filter(filterTask);
  const filteredUpcoming = (myWorkData.upcoming || []).filter(filterTask);
  const filteredHighPriority = (myWorkData.highPriority || []).filter(filterTask);
  const filteredRecentlyCompleted = (myWorkData.recentlyCompleted || []).filter(filterTask);

  const hasActiveFilters =
    activeQueueFilter !== "all" ||
    searchQuery.trim() !== "" ||
    selectedProjectFilter !== "all" ||
    selectedPriorityFilter !== "all";

  const resetFilters = () => {
    setActiveQueueFilter("all");
    setSearchQuery("");
    setSelectedProjectFilter("all");
    setSelectedPriorityFilter("all");
  };

  // Attention summary counts (derived directly from authoritative dataset)
  const summaryCounts = {
    overdue: myWorkData.overdue?.length || 0,
    blocked: myWorkData.blocked?.length || 0,
    dueToday: myWorkData.dueToday?.length || 0,
    upcoming: myWorkData.upcoming?.length || 0,
    highPriority: myWorkData.highPriority?.length || 0,
  };

  return (
    <div className="flex flex-col gap-6 select-none">
      {/* 1. Page Header */}
      <PageHeader
        title="My Work"
        description="Your personal view of work that needs attention."
        breadcrumbs={[
          { label: activeWorkspace?.name || "Workspace", href: "/" },
          { label: "My Work" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadMyWork(true)}
              disabled={isRefreshing}
              className="gap-1.5"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              size="sm"
              onClick={() => setCreateTaskModalOpen(true)}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              <span>Create Task</span>
            </Button>
          </div>
        }
      />

      {/* 2. Attention Summary Affordance */}
      {!isLoading && !fetchError && (
        <MyWorkAttentionBar
          counts={summaryCounts}
          activeQueue={activeQueueFilter}
          onSelectQueue={setActiveQueueFilter}
        />
      )}

      {/* 3. Search & Filter Toolbar */}
      {!isLoading && !fetchError && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/70 pb-4">
          <div className="flex flex-1 items-center gap-2.5 max-w-md">
            <Input
              type="text"
              placeholder="Search by task title or project..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search className="h-3.5 w-3.5" />}
              rightIcon={
                searchQuery ? (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="p-1 hover:text-foreground cursor-pointer"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : undefined
              }
              className="h-8 text-xs"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Project Filter */}
            {projects && projects.length > 0 && (
              <Select
                value={selectedProjectFilter}
                onChange={(e) => setSelectedProjectFilter(e.target.value)}
                className="h-8 text-xs w-36"
                aria-label="Filter by project"
              >
                <option value="all">All Projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            )}

            {/* Priority Filter */}
            <Select
              value={selectedPriorityFilter}
              onChange={(e) => setSelectedPriorityFilter(e.target.value)}
              className="h-8 text-xs w-32"
              aria-label="Filter by priority"
            >
              <option value="all">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>

            {/* Clear Filters Reset */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="xs"
                onClick={resetFilters}
                className="text-muted-foreground hover:text-foreground gap-1 h-8"
              >
                <X className="h-3 w-3" />
                <span>Reset</span>
              </Button>
            )}
          </div>
        </div>
      )}

      {/* 4. Loading Skeleton */}
      {isLoading && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-md" />
            ))}
          </div>
          <div className="flex flex-col gap-3 mt-4">
            <Skeleton className="h-10 rounded-md" />
            <Skeleton className="h-14 rounded-md" />
            <Skeleton className="h-14 rounded-md" />
            <Skeleton className="h-14 rounded-md" />
          </div>
        </div>
      )}

      {/* 5. Error State with Retry */}
      {!isLoading && fetchError && (
        <EmptyState
          icon={AlertTriangle}
          title="Failed to Load My Work"
          description={fetchError}
          action={
            <Button variant="default" size="sm" onClick={() => loadMyWork()}>
              Try Again
            </Button>
          }
        />
      )}

      {/* 6. Main Work Queues Area */}
      {!isLoading && !fetchError && (
        <div className="flex flex-col gap-5">
          {/* Active Queue Filter Alert Banner */}
          {activeQueueFilter !== "all" && (
            <div className="flex items-center justify-between rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
              <span>
                Focusing on <strong>{activeQueueFilter.replace(/([A-Z])/g, " $1").toLowerCase()}</strong> queue.
              </span>
              <button
                onClick={() => setActiveQueueFilter("all")}
                className="font-semibold underline hover:no-underline cursor-pointer"
              >
                Show All Queues
              </button>
            </div>
          )}

          {/* Queue 1: Overdue */}
          {(activeQueueFilter === "all" || activeQueueFilter === "overdue") && (
            <MyWorkQueueSection
              id="overdue-queue"
              title="Overdue"
              description="Needs immediate action"
              icon={AlertCircle}
              tasks={filteredOverdue}
              variant="overdue"
              emptyTitle="No overdue work"
              emptyDescription="You're completely up to date with your scheduled commitments."
              onSelectTask={handleSelectTask}
              onQuickComplete={handleQuickComplete}
            />
          )}

          {/* Queue 2: Blocked */}
          {(activeQueueFilter === "all" || activeQueueFilter === "blocked") && (
            <MyWorkQueueSection
              id="blocked-queue"
              title="Blocked"
              description="Waiting on dependency resolution"
              icon={Ban}
              tasks={filteredBlocked}
              variant="blocked"
              emptyTitle="Nothing is blocked"
              emptyDescription="None of your tasks are obstructed by pending dependencies."
              onSelectTask={handleSelectTask}
              onQuickComplete={handleQuickComplete}
            />
          )}

          {/* Queue 3: Due Today */}
          {(activeQueueFilter === "all" || activeQueueFilter === "dueToday") && (
            <MyWorkQueueSection
              id="due-today-queue"
              title="Due Today"
              description="Today's delivery commitments"
              icon={Clock}
              tasks={filteredDueToday}
              variant="default"
              emptyTitle="No tasks due today"
              emptyDescription="Nothing is scheduled to finish today."
              onSelectTask={handleSelectTask}
              onQuickComplete={handleQuickComplete}
            />
          )}

          {/* Queue 4: Upcoming */}
          {(activeQueueFilter === "all" || activeQueueFilter === "upcoming") && (
            <MyWorkQueueSection
              id="upcoming-queue"
              title="Upcoming"
              description="Scheduled in the next 7 days"
              icon={Calendar}
              tasks={filteredUpcoming}
              variant="default"
              emptyTitle="No upcoming tasks"
              emptyDescription="No tasks are scheduled for delivery in the next 7 days."
              onSelectTask={handleSelectTask}
              onQuickComplete={handleQuickComplete}
            />
          )}

          {/* Queue 5: High Priority */}
          {(activeQueueFilter === "all" || activeQueueFilter === "highPriority") && (
            <MyWorkQueueSection
              id="high-priority-queue"
              title="High Priority"
              description="Urgent & high priority focus"
              icon={Flame}
              tasks={filteredHighPriority}
              variant="default"
              emptyTitle="No high priority tasks"
              emptyDescription="No critical or urgent tasks currently require immediate focus."
              onSelectTask={handleSelectTask}
              onQuickComplete={handleQuickComplete}
            />
          )}

          {/* Queue 6: Recently Completed (Secondary Area) */}
          {activeQueueFilter === "all" && (
            <MyWorkQueueSection
              id="recently-completed-queue"
              title="Recently Completed"
              description="Delivered within the last 7 days"
              icon={CheckSquare}
              tasks={filteredRecentlyCompleted}
              variant="completed"
              defaultExpanded={false}
              emptyTitle="No recently completed tasks"
              emptyDescription="Tasks completed in the past 7 days will appear here."
              onSelectTask={handleSelectTask}
              onQuickComplete={handleQuickComplete}
            />
          )}
        </div>
      )}

      {/* 7. Reusable Task Detail Drawer */}
      {inspectingTask && (
        <TaskDetailDrawer
          task={inspectingTask}
          onClose={() => setInspectingTask(null)}
          onEdit={(task) => {
            setInspectingTask(null);
            setEditingTask(task);
          }}
        />
      )}

      {/* 8. Reusable Task Edit/Create Modal */}
      {editingTask && (
        <TaskModal
          editingTask={editingTask}
          onClose={() => {
            setEditingTask(null);
            loadMyWork(true);
          }}
        />
      )}
    </div>
  );
}
