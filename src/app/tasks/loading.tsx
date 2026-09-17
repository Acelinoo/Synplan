import * as React from "react";
import { Skeleton, SkeletonAvatar } from "@/components/ui/skeleton";

export default function TasksLoading() {
  return (
    <div className="relative flex flex-col gap-6" aria-busy="true" aria-label="Loading Tasks">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-28 rounded-lg" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-3.5 w-72 sm:w-96 rounded" />
        </div>
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
      </div>

      {/* Shared Task Toolbar Skeleton */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <Skeleton className="h-8 w-56 rounded-lg" />
          <Skeleton className="h-4 w-28 rounded" />
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50">
          <Skeleton className="h-8 w-48 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      </div>

      {/* Board Lanes Skeleton */}
      <div className="flex gap-4 overflow-x-auto pb-4 pt-1 min-h-[500px]">
        {["Backlog", "To Do", "In Progress", "In Review", "Blocked", "Done", "Cancelled"].map(
          (colTitle, colIdx) => (
            <div
              key={colIdx}
              className="flex h-full min-w-[270px] max-w-[310px] flex-1 flex-col rounded-xl border border-border/70 bg-surface-muted/50 p-3 shadow-inner"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-2.5 px-1 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-2.5 w-2.5 rounded-full" />
                  <span className="text-xs font-bold text-muted-foreground uppercase">{colTitle}</span>
                </div>
                <Skeleton className="h-4 w-6 rounded-full" />
              </div>

              {/* Task Cards in Lane */}
              <div className="mt-3 space-y-2.5 flex-1">
                {[1, 2].map((cardIdx) => (
                  <div
                    key={cardIdx}
                    className="rounded-lg border border-border bg-card p-3 space-y-2 shadow-2xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Skeleton className="h-4 w-14 rounded" />
                      <Skeleton className="h-4 w-16 rounded" />
                    </div>
                    <Skeleton className="h-3.5 w-full rounded" />
                    <Skeleton className="h-3.5 w-3/4 rounded" />
                    <div className="flex items-center justify-between pt-1 border-t border-border/40">
                      <Skeleton className="h-3 w-16 rounded" />
                      <SkeletonAvatar size="xs" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
