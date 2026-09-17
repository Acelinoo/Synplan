"use client";

import * as React from "react";
import {
  Search,
  Filter,
  RotateCcw,
  SlidersHorizontal,
  CheckSquare,
  Table as TableIcon,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ProjectViewMode = "board" | "list" | "table";

export interface SharedFilterState {
  search: string;
  status: string;
  priority: string;
  assigneeId: string;
  phaseId: string;
  projectId?: string;
}

interface SharedTaskToolbarProps {
  viewMode: ProjectViewMode;
  onViewModeChange: (mode: ProjectViewMode) => void;
  filters: SharedFilterState;
  onFilterChange: (updates: Partial<SharedFilterState>) => void;
  onResetFilters: () => void;
  members: any[];
  phases?: any[];
  projects?: Array<{ id: string; name: string; color?: string }>;
  totalTasks: number;
  filteredTasksCount: number;
}

export function SharedTaskToolbar({
  viewMode,
  onViewModeChange,
  filters,
  onFilterChange,
  onResetFilters,
  members,
  phases = [],
  projects = [],
  totalTasks,
  filteredTasksCount,
}: SharedTaskToolbarProps) {
  const isFiltered =
    Boolean(filters.search.trim()) ||
    filters.status !== "all" ||
    filters.priority !== "all" ||
    filters.assigneeId !== "all" ||
    (Boolean(filters.phaseId) && filters.phaseId !== "all") ||
    (Boolean(filters.projectId) && filters.projectId !== "all");

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-xs">
      {/* Top row: View Switcher and Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* View Switcher: Board | List | Table */}
        <div className="flex items-center rounded-lg border border-border bg-surface-muted p-1">
          <button
            onClick={() => onViewModeChange("board")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
              viewMode === "board"
                ? "bg-card text-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Switch to Kanban Board View"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Board</span>
          </button>
          <button
            onClick={() => onViewModeChange("list")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
              viewMode === "list"
                ? "bg-card text-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Switch to Hierarchical List View"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            <span>List</span>
          </button>
          <button
            onClick={() => onViewModeChange("table")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
              viewMode === "table"
                ? "bg-card text-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Switch to Dense Table View"
          >
            <TableIcon className="h-3.5 w-3.5" />
            <span>Table</span>
          </button>
        </div>

        {/* Task Counts Telemetry */}
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
          <span>
            {isFiltered ? (
              <>
                <strong className="text-foreground">{filteredTasksCount}</strong> of{" "}
                <strong className="text-foreground">{totalTasks}</strong> tasks
              </>
            ) : (
              <>
                <strong className="text-foreground">{totalTasks}</strong> total tasks
              </>
            )}
          </span>
        </div>
      </div>

      {/* Filter Controls Row */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            className="h-8 w-full rounded-md border border-border bg-card pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {filters.search && (
            <button
              onClick={() => onFilterChange({ search: "" })}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Project Filter */}
        {projects && projects.length > 0 && (
          <select
            value={filters.projectId || "all"}
            onChange={(e) => onFilterChange({ projectId: e.target.value })}
            className="h-8 rounded-md border border-border bg-card px-2.5 text-xs text-foreground focus:border-primary focus:outline-none cursor-pointer max-w-[160px] truncate"
            aria-label="Filter by Project"
          >
            <option value="all">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        {/* Status Filter */}
        <select
          value={filters.status}
          onChange={(e) => onFilterChange({ status: e.target.value })}
          className="h-8 rounded-md border border-border bg-card px-2.5 text-xs text-foreground focus:border-primary focus:outline-none cursor-pointer"
          aria-label="Filter by Status"
        >
          <option value="all">All Statuses</option>
          <option value="backlog">Backlog</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="in_review">In Review</option>
          <option value="blocked">Blocked</option>
          <option value="done">Done</option>
          <option value="cancelled">Cancelled</option>
        </select>

        {/* Priority Filter */}
        <select
          value={filters.priority}
          onChange={(e) => onFilterChange({ priority: e.target.value })}
          className="h-8 rounded-md border border-border bg-card px-2.5 text-xs text-foreground focus:border-primary focus:outline-none cursor-pointer"
          aria-label="Filter by Priority"
        >
          <option value="all">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {/* Phase Filter */}
        {phases.length > 0 && (
          <select
            value={filters.phaseId}
            onChange={(e) => onFilterChange({ phaseId: e.target.value })}
            className="h-8 rounded-md border border-border bg-card px-2.5 text-xs text-foreground focus:border-primary focus:outline-none cursor-pointer"
            aria-label="Filter by Phase"
          >
            <option value="all">All Phases</option>
            {phases.map((ph: any) => (
              <option key={ph.id} value={ph.id}>
                {ph.name}
              </option>
            ))}
          </select>
        )}

        {/* Assignee Filter */}
        {members.length > 0 && (
          <select
            value={filters.assigneeId}
            onChange={(e) => onFilterChange({ assigneeId: e.target.value })}
            className="h-8 rounded-md border border-border bg-card px-2.5 text-xs text-foreground focus:border-primary focus:outline-none cursor-pointer"
            aria-label="Filter by Assignee"
          >
            <option value="all">All Assignees</option>
            {members.map((m: any) => (
              <option key={m.id} value={m.user?.id || m.userId}>
                {m.user?.name || "Squad Member"}
              </option>
            ))}
          </select>
        )}

        {/* Reset Filter Button */}
        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onResetFilters}
            className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset</span>
          </Button>
        )}
      </div>
    </div>
  );
}
