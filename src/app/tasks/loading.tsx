import * as React from "react";
import { Skeleton, SkeletonCard, SkeletonAvatar } from "@/components/ui/skeleton";

export default function TasksLoading() {
  return (
    <div className="relative flex flex-col gap-6" aria-busy="true" aria-label="Loading Tasks">
      {/* Header Skeleton */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-24 rounded-lg" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3.5 w-72 sm:w-96 rounded" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-32 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      {/* Search & Filter Toolbar Skeleton */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-lg border border-border bg-card p-3.5 shadow-xs">
        <Skeleton className="h-8.5 w-full max-w-sm rounded-lg" />
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-8.5 w-32 rounded-lg" />
          <Skeleton className="h-8.5 w-28 rounded-lg" />
        </div>
      </div>

      {/* Kanban Board 4 Columns Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {["To Do", "In Progress", "In Review", "Done"].map((colTitle, colIdx) => (
          <div
            key={colIdx}
            className="flex flex-col rounded-xl border border-border/70 bg-card/60 p-3 min-h-[480px] shadow-xs"
          >
            {/* Column Header */}
            <div className="flex items-center justify-between pb-3 border-b border-border/40">
              <div className="flex items-center gap-2">
                <Skeleton className="h-2.5 w-2.5 rounded-full" />
                <span className="text-xs font-bold text-muted-foreground">{colTitle}</span>
              </div>
              <Skeleton className="h-4 w-6 rounded-full" />
            </div>

            {/* Task Cards in Column */}
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
    </div>
  );
}
