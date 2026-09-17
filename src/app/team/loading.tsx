import * as React from "react";
import { Skeleton, SkeletonCard, SkeletonAvatar } from "@/components/ui/skeleton";

export default function TeamLoading() {
  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full pb-12" aria-busy="true" aria-label="Loading Team">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-9 rounded-xl" />
            <Skeleton className="h-8 w-48 rounded-lg" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-3.5 w-72 sm:w-96 rounded" />
        </div>
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>

      {/* Workload Visualizer Summary Skeleton (3 cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <SkeletonCard key={i} className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-24 rounded" />
              <Skeleton className="h-7 w-7 rounded-lg" />
            </div>
            <Skeleton className="h-7 w-16 rounded" />
            <Skeleton className="h-2.5 w-32 rounded" />
          </SkeletonCard>
        ))}
      </div>

      {/* Filter Controls Bar Skeleton */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-xs">
        <Skeleton className="h-8.5 w-full max-w-sm rounded-lg" />
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-8.5 w-56 rounded-lg" />
          <Skeleton className="h-8.5 w-24 rounded-lg" />
          <Skeleton className="h-8.5 w-16 rounded-lg" />
        </div>
      </div>

      {/* Member Cards Grid Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <SkeletonCard key={i} className="p-5 space-y-4">
            <div className="flex items-start justify-between">
              <SkeletonAvatar size="lg" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="space-y-1">
              <Skeleton className="h-4 w-32 rounded" />
              <Skeleton className="h-3 w-40 rounded" />
            </div>
            <div className="space-y-1.5 pt-2 border-t border-border/40">
              <div className="flex justify-between">
                <Skeleton className="h-2.5 w-16 rounded" />
                <Skeleton className="h-2.5 w-8 rounded" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
            <div className="flex items-center justify-between pt-1">
              <Skeleton className="h-3 w-20 rounded" />
              <Skeleton className="h-7 w-16 rounded-lg" />
            </div>
          </SkeletonCard>
        ))}
      </div>
    </div>
  );
}

