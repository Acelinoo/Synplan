"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronRight,
  Layers,
  Flag,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Plus,
} from "lucide-react";
import {
  StructuredListView,
  StructuredListPhase,
  StructuredListMilestone,
  TaskStatus,
} from "@/types";
import {
  PriorityBadge,
  StatusBadge,
  DueDateChip,
  TaskBlockedChip,
  SubtaskProgressChip,
} from "@/components/ui";
import { cn } from "@/lib/utils";

export interface ProjectGroupData {
  project: { id: string; name: string; color?: string };
  phases: Array<{
    id: string;
    name: string;
    description?: string | null;
    tasks: any[];
    totalTasks: number;
    completedTasks: number;
  }>;
  ungroupedTasks: any[];
  totalTasks: number;
  completedTasks: number;
}

interface ProjectListViewProps {
  listData?: StructuredListView | null;
  projectGroups?: ProjectGroupData[];
  onSelectTask: (task: any) => void;
  onAddTask: (phaseId?: string, projectId?: string) => void;
  onStatusToggle: (taskId: string, currentStatus: string) => void;
}

export function ProjectListView({
  listData,
  projectGroups,
  onSelectTask,
  onAddTask,
  onStatusToggle,
}: ProjectListViewProps) {
  // Collapsed state for projects, phases, and milestones
  const [collapsedProjects, setCollapsedProjects] = React.useState<Record<string, boolean>>({});
  const [collapsedPhases, setCollapsedPhases] = React.useState<Record<string, boolean>>({});
  const [collapsedMilestones, setCollapsedMilestones] = React.useState<Record<string, boolean>>({});

  const toggleProject = (projectId: string) => {
    setCollapsedProjects((prev) => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  const togglePhase = (phaseId: string) => {
    setCollapsedPhases((prev) => ({ ...prev, [phaseId]: !prev[phaseId] }));
  };

  const toggleMilestone = (milestoneId: string) => {
    setCollapsedMilestones((prev) => ({ ...prev, [milestoneId]: !prev[milestoneId] }));
  };

  // If in Global Multi-Project Mode
  if (projectGroups && projectGroups.length > 0) {
    const totalGlobalTasks = projectGroups.reduce((acc, g) => acc + g.totalTasks, 0);

    if (totalGlobalTasks === 0) {
      return (
        <div className="rounded-lg border border-dashed border-border p-12 text-center space-y-3">
          <Layers className="h-8 w-8 mx-auto text-muted-foreground/60" />
          <h3 className="text-sm font-bold text-foreground">No Tasks in Workspace</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Create projects and tasks to build your workspace delivery roadmap.
          </p>
          <button
            onClick={() => onAddTask()}
            className="text-xs font-semibold text-primary hover:underline cursor-pointer"
          >
            + Add First Task
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {projectGroups.map((group) => {
          const isProjCollapsed = Boolean(collapsedProjects[group.project.id]);
          const progressPct =
            group.totalTasks > 0 ? Math.round((group.completedTasks / group.totalTasks) * 100) : 0;

          return (
            <div
              key={group.project.id}
              className="rounded-lg border border-border bg-card shadow-xs overflow-hidden"
            >
              {/* Project Header */}
              <div
                onClick={() => toggleProject(group.project.id)}
                className="flex items-center justify-between p-3.5 bg-surface-muted/70 hover:bg-surface-muted transition-colors cursor-pointer select-none"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground p-0.5"
                    aria-label={isProjCollapsed ? "Expand project" : "Collapse project"}
                  >
                    {isProjCollapsed ? (
                      <ChevronRight className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: group.project.color || "#6366f1" }}
                  />
                  <span className="font-bold text-xs text-foreground truncate">
                    {group.project.name}
                  </span>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {/* Progress bar */}
                  <div className="hidden sm:flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-border">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono font-medium text-muted-foreground">
                      {progressPct}%
                    </span>
                  </div>

                  <span className="rounded-full bg-card border border-border px-2 py-0.5 text-[10px] font-mono font-semibold text-muted-foreground">
                    {group.completedTasks}/{group.totalTasks}
                  </span>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddTask(undefined, group.project.id);
                    }}
                    className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-card transition-colors cursor-pointer"
                    title={`Add task to ${group.project.name}`}
                    aria-label={`Add task to ${group.project.name}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Project Content */}
              {!isProjCollapsed && (
                <div className="p-2 space-y-2 divide-y divide-border/40">
                  {/* Phases */}
                  {group.phases.map((ph) => {
                    const isPhaseCollapsed = Boolean(collapsedPhases[ph.id]);
                    return (
                      <div key={ph.id} className="pt-2 pl-3 sm:pl-6 space-y-1.5">
                        <div
                          onClick={() => togglePhase(ph.id)}
                          className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-surface-muted/30 hover:bg-surface-muted/60 transition-colors cursor-pointer select-none"
                        >
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground p-0.5"
                            >
                              {isPhaseCollapsed ? (
                                <ChevronRight className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span className="text-xs font-semibold text-foreground">
                              {ph.name}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground pr-2">
                            {ph.tasks.length} tasks
                          </span>
                        </div>

                        {!isPhaseCollapsed && (
                          <div className="space-y-1 pl-4 sm:pl-6 pt-1">
                            {ph.tasks.map((task) => (
                              <ListTaskRow
                                key={task.id}
                                task={task}
                                onSelect={() => onSelectTask(task)}
                                onStatusToggle={() => onStatusToggle(task.id, task.status)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Ungrouped Tasks */}
                  {group.ungroupedTasks.length > 0 && (
                    <div className="pt-2 pl-3 sm:pl-6 space-y-1">
                      {group.phases.length > 0 && (
                        <div className="px-2 py-1 text-[10px] font-mono font-bold uppercase text-muted-foreground tracking-wider">
                          Ungrouped Tasks ({group.ungroupedTasks.length})
                        </div>
                      )}
                      {group.ungroupedTasks.map((task) => (
                        <ListTaskRow
                          key={task.id}
                          task={task}
                          onSelect={() => onSelectTask(task)}
                          onStatusToggle={() => onStatusToggle(task.id, task.status)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Single Project Mode (Existing)
  if (!listData) {
    return (
      <div className="py-12 text-center text-xs text-muted-foreground">
        Loading list hierarchy...
      </div>
    );
  }

  const { phases = [], ungroupedTasks = [], totalTasks = 0 } = listData;

  if (totalTasks === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-12 text-center space-y-3">
        <Layers className="h-8 w-8 mx-auto text-muted-foreground/60" />
        <h3 className="text-sm font-bold text-foreground">No Tasks in Project</h3>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Create phases, milestones, or add tasks to build your project roadmap.
        </p>
        <button
          onClick={() => onAddTask()}
          className="text-xs font-semibold text-primary hover:underline cursor-pointer"
        >
          + Add First Task
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Phases Hierarchy */}
      {phases.map((phase) => {
        const isCollapsed = Boolean(collapsedPhases[phase.id]);
        const phaseTasksCount = phase.totalTasks;
        const phaseCompletedCount = phase.completedTasks;
        const progressPct =
          phaseTasksCount > 0 ? Math.round((phaseCompletedCount / phaseTasksCount) * 100) : 0;

        return (
          <div
            key={phase.id}
            className="rounded-lg border border-border bg-card shadow-xs overflow-hidden"
          >
            {/* Phase Header */}
            <div
              onClick={() => togglePhase(phase.id)}
              className="flex items-center justify-between p-3.5 bg-surface-muted/60 hover:bg-surface-muted transition-colors cursor-pointer select-none"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground p-0.5"
                  aria-label={isCollapsed ? "Expand phase" : "Collapse phase"}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                <Layers className="h-4 w-4 text-primary shrink-0" />
                <span className="font-semibold text-xs text-foreground truncate">{phase.name}</span>
                {phase.description && (
                  <span className="hidden md:inline text-[11px] text-muted-foreground truncate max-w-xs">
                    — {phase.description}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {/* Progress bar */}
                <div className="hidden sm:flex items-center gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono font-medium text-muted-foreground">
                    {progressPct}%
                  </span>
                </div>

                <span className="rounded-full bg-card border border-border px-2 py-0.5 text-[10px] font-mono font-semibold text-muted-foreground">
                  {phaseCompletedCount}/{phaseTasksCount}
                </span>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddTask(phase.id);
                  }}
                  className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-card transition-colors cursor-pointer"
                  title={`Add task to ${phase.name}`}
                  aria-label={`Add task to ${phase.name}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Phase Content */}
            {!isCollapsed && (
              <div className="p-2 divide-y divide-border/40">
                {/* Milestones in Phase */}
                {phase.milestones.map((ms) => {
                  const isMsCollapsed = Boolean(collapsedMilestones[ms.id]);
                  return (
                    <div key={ms.id} className="py-2 pl-3 sm:pl-6 space-y-1.5">
                      {/* Milestone Sub-Header */}
                      <div
                        onClick={() => toggleMilestone(ms.id)}
                        className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-surface-muted/30 hover:bg-surface-muted/60 transition-colors cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground p-0.5"
                          >
                            {isMsCollapsed ? (
                              <ChevronRight className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <Flag className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span className="text-xs font-semibold text-foreground">{ms.title}</span>
                          {ms.targetDate && (
                            <span className="text-[10px] font-mono text-muted-foreground">
                              (Target: {new Date(ms.targetDate).toLocaleDateString()})
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground pr-2">
                          {ms.taskCount} tasks
                        </span>
                      </div>

                      {/* Milestone Tasks */}
                      {!isMsCollapsed && (
                        <div className="space-y-1 pl-4 sm:pl-8 pt-1">
                          {ms.tasks.map((task) => (
                            <ListTaskRow
                              key={task.id}
                              task={task}
                              onSelect={() => onSelectTask(task)}
                              onStatusToggle={() => onStatusToggle(task.id, task.status)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Direct Tasks in Phase (not mapped to milestone) */}
                {phase.directTasks.length > 0 && (
                  <div className="py-1 space-y-1 pl-2 sm:pl-4">
                    {phase.directTasks.map((task) => (
                      <ListTaskRow
                        key={task.id}
                        task={task}
                        onSelect={() => onSelectTask(task)}
                        onStatusToggle={() => onStatusToggle(task.id, task.status)}
                      />
                    ))}
                  </div>
                )}

                {phase.totalTasks === 0 && (
                  <div className="py-4 text-center text-xs text-muted-foreground italic">
                    No tasks assigned to this phase yet.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Ungrouped Tasks (tasks not assigned to any phase) */}
      {ungroupedTasks.length > 0 && (
        <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
          <div className="flex items-center justify-between p-3.5 bg-surface-muted/60 border-b border-border/50">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs text-foreground uppercase tracking-wider">
                Ungrouped Tasks
              </span>
            </div>
            <span className="rounded-full bg-card border border-border px-2 py-0.5 text-[10px] font-mono font-semibold text-muted-foreground">
              {ungroupedTasks.length}
            </span>
          </div>

          <div className="p-2 space-y-1">
            {ungroupedTasks.map((task: any) => (
              <ListTaskRow
                key={task.id}
                task={task}
                onSelect={() => onSelectTask(task)}
                onStatusToggle={() => onStatusToggle(task.id, task.status)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ListTaskRow({
  task,
  onSelect,
  onStatusToggle,
}: {
  task: any;
  onSelect: () => void;
  onStatusToggle: () => void;
}) {
  const isDone = (task.status || "").toLowerCase() === "done";
  const assigneeInitial = (task.assignee?.name || "U").charAt(0).toUpperCase();

  return (
    <div
      tabIndex={0}
      role="button"
      aria-label={`Inspect task: ${task.title}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-lg border border-transparent p-2 transition-all cursor-pointer",
        "hover:border-border hover:bg-surface-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        task.isBlocked && "bg-destructive/5 border-destructive/20"
      )}
    >
      {/* Left: Quick complete toggle & Title */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onStatusToggle();
          }}
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors cursor-pointer",
            isDone
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-border hover:border-foreground/60 bg-card"
          )}
          aria-label={isDone ? "Mark as incomplete" : "Mark as completed"}
        >
          {isDone && <CheckCircle2 className="h-3 w-3" />}
        </button>

        <span
          className={cn(
            "text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors",
            isDone && "line-through text-muted-foreground"
          )}
        >
          {task.title}
        </span>

        {task.isBlocked && <TaskBlockedChip isBlocked={true} blockersCount={1} />}

        {task.subtasksSummary && task.subtasksSummary.total > 0 && (
          <SubtaskProgressChip
            completed={task.subtasksSummary.completed}
            total={task.subtasksSummary.total}
          />
        )}
      </div>

      {/* Right: Badges cluster */}
      <div className="flex items-center gap-2.5 shrink-0 pl-6 sm:pl-0">
        {task.project && (
          <span
            className="inline-flex items-center gap-1 rounded bg-surface-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono truncate max-w-[120px]"
            title={task.project.name}
          >
            <span
              className="h-1.5 w-1.5 rounded-full shrink-0"
              style={{ backgroundColor: task.project.color || "#6366f1" }}
            />
            <span className="truncate">{task.project.name}</span>
          </span>
        )}
        <DueDateChip dueDate={task.dueDate} />
        <PriorityBadge priority={task.priority} />
        <StatusBadge status={task.status} />

        {task.assignee ? (
          <div
            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary font-mono"
            title={task.assignee.name}
          >
            {assigneeInitial}
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground/60 italic font-mono">Unassigned</span>
        )}
      </div>
    </div>
  );
}
