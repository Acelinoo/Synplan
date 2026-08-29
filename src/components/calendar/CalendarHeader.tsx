"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Filter,
} from "lucide-react";
import { useCalendarStore, useWorkspaceStore } from "@/store";
import { CalendarViewMode } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CalendarHeaderProps {
  currentTitle: string;
  onPrev: () => void;
  onNext: () => void;
}

export function CalendarHeader({ currentTitle, onPrev, onNext }: CalendarHeaderProps) {
  const { viewMode, setViewMode, filterProjectId, setFilterProjectId, goToToday } =
    useCalendarStore();
  const { projects } = useWorkspaceStore();

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
      {/* Title & Navigation */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            onClick={onPrev}
            className="h-8 w-8 text-xs"
            title="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={onNext}
            className="h-8 w-8 text-xs"
            title="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToToday}
            className="h-8 px-3 text-xs font-semibold"
          >
            Today
          </Button>
        </div>

        <h2 className="text-base font-bold text-foreground font-mono tracking-tight">
          {currentTitle}
        </h2>
      </div>

      {/* View Mode Switcher & Project Filter */}
      <div className="flex items-center gap-2.5 flex-wrap">
        {/* Project filter */}
        <select
          value={filterProjectId}
          onChange={(e) => setFilterProjectId(e.target.value)}
          className="h-8 rounded-md border border-border bg-card px-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
        >
          <option value="all">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* View mode toggle (Month / Week / Day) */}
        <div className="flex items-center rounded-md border border-border bg-card p-0.5 text-xs">
          {(["month", "week", "day"] as CalendarViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                "rounded px-3 py-1 text-xs font-medium capitalize transition-colors",
                viewMode === mode
                  ? "bg-primary text-primary-foreground font-bold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
