"use client";

import * as React from "react";
import { Search, X, Filter, User, Folder, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ActivityFilterToolbarProps {
  search: string;
  onSearchChange: (val: string) => void;
  selectedActorId: string;
  onActorChange: (actorId: string) => void;
  selectedProjectId: string;
  onProjectChange: (projectId: string) => void;
  selectedEntityType: string;
  onEntityTypeChange: (entityType: string) => void;
  members: Array<{ id: string; name: string; email?: string; avatarUrl?: string | null }>;
  projects: Array<{ id: string; name: string; color?: string }>;
  onResetFilters: () => void;
  hasActiveFilters: boolean;
}

export function ActivityFilterToolbar({
  search,
  onSearchChange,
  selectedActorId,
  onActorChange,
  selectedProjectId,
  onProjectChange,
  selectedEntityType,
  onEntityTypeChange,
  members,
  projects,
  onResetFilters,
  hasActiveFilters,
}: ActivityFilterToolbarProps) {
  const entityTypeOptions = [
    { value: "all", label: "All Events" },
    { value: "TASK", label: "Tasks" },
    { value: "PROJECT", label: "Projects" },
    { value: "COMMENT", label: "Comments" },
    { value: "MEMBER", label: "Members" },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4 shadow-xs">
      {/* Top Row: Search and Dropdowns */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by entity, actor, or action..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-9 rounded-xl border border-border/70 bg-background/80 pl-9 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
          />
          {search && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              title="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Actor Filter Dropdown */}
        <div className="relative min-w-[160px] sm:w-[180px]">
          <div className="relative flex items-center">
            <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <select
              value={selectedActorId}
              onChange={(e) => onActorChange(e.target.value)}
              className="w-full h-9 rounded-xl border border-border/70 bg-background/80 pl-8 pr-7 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all appearance-none cursor-pointer"
            >
              <option value="all">All Team Members</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Project Filter Dropdown */}
        <div className="relative min-w-[160px] sm:w-[180px]">
          <div className="relative flex items-center">
            <Folder className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <select
              value={selectedProjectId}
              onChange={(e) => onProjectChange(e.target.value)}
              className="w-full h-9 rounded-xl border border-border/70 bg-background/80 pl-8 pr-7 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all appearance-none cursor-pointer"
            >
              <option value="all">All Projects</option>
              {projects.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Reset Filters Action */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onResetFilters}
            className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground shrink-0 gap-1.5"
          >
            <RotateCcw className="h-3 w-3" />
            <span className="hidden sm:inline">Reset</span>
          </Button>
        )}
      </div>

      {/* Bottom Row: Entity Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar border-t border-border/40 pt-2.5">
        {entityTypeOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onEntityTypeChange(opt.value)}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-medium transition-all whitespace-nowrap",
              selectedEntityType === opt.value
                ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
