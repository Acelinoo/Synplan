import * as React from "react";
import { Skeleton, SkeletonCard, SkeletonAvatar } from "@/components/ui/skeleton";

export default function ProjectsLoading() {
  return (
    <div className="relative flex flex-col gap-6" aria-busy="true" aria-label="Loading Projects">
      {/* Header Skeleton */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-32 rounded-lg" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3.5 w-72 sm:w-96 rounded" />
        </div>
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>

      {/* Filters & View Toolbar Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Skeleton className="h-9 w-full max-w-md rounded-lg" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-64 rounded-lg" />
          <Skeleton className="h-9 w-18 rounded-lg" />
        </div>
      </div>

      {/* Grid View Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <SkeletonCard key={i} className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 flex-1">
                <Skeleton className="h-3 w-3 rounded-full shrink-0" />
                <Skeleton className="h-4 w-40 rounded" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full shrink-0" />
            </div>
            <Skeleton className="h-3 w-3/4 rounded" />
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between">
                <Skeleton className="h-2.5 w-16 rounded" />
                <Skeleton className="h-2.5 w-8 rounded" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border/40">
              <Skeleton className="h-3 w-20 rounded" />
              <div className="flex -space-x-1.5">
                <SkeletonAvatar size="xs" />
                <SkeletonAvatar size="xs" />
              </div>
            </div>
          </SkeletonCard>
        ))}
      </div>
    </div>
  );
}
