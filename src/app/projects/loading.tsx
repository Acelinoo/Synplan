import * as React from "react";
import { Skeleton, SkeletonAvatar } from "@/components/ui/skeleton";

export default function ProjectsLoading() {
  return (
    <div className="relative flex flex-col gap-6" aria-busy="true" aria-label="Loading Projects">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-32 rounded-lg" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-3.5 w-72 sm:w-96 rounded" />
        </div>
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
      </div>

      {/* Toolbar Skeleton */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <Skeleton className="h-8 w-56 rounded-lg" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-28 rounded-lg" />
            <Skeleton className="h-8 w-16 rounded-lg" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50">
          <Skeleton className="h-8 w-full max-w-sm rounded-md" />
          <div className="flex items-center gap-1.5 overflow-hidden">
            {[1, 2, 3, 4, 5, 6].map((idx) => (
              <Skeleton key={idx} className="h-7 w-20 rounded-md" />
            ))}
          </div>
        </div>
      </div>

      {/* Grid View Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="flex flex-col justify-between rounded-xl border border-border bg-card p-4.5 space-y-4 shadow-xs"
          >
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-2.5 w-2.5 rounded-full" />
                  <Skeleton className="h-4 w-18 rounded" />
                </div>
                <Skeleton className="h-4 w-6 rounded" />
              </div>
              <Skeleton className="h-4 w-44 rounded" />
              <Skeleton className="h-3 w-full rounded" />
              <Skeleton className="h-3 w-3/4 rounded" />
            </div>

            <div className="pt-3 border-t border-border/50 space-y-2.5">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-20 rounded" />
                <Skeleton className="h-3 w-8 rounded" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
              <div className="flex items-center justify-between pt-1">
                <Skeleton className="h-3 w-24 rounded" />
                <div className="flex -space-x-1.5">
                  <SkeletonAvatar size="xs" />
                  <SkeletonAvatar size="xs" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
