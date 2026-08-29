import * as React from "react";
import { Skeleton, SkeletonCard, SkeletonAvatar } from "@/components/ui/skeleton";

export default function ProjectDetailLoading() {
  return (
    <div className="relative space-y-6" aria-busy="true" aria-label="Loading Project Details">
      {/* Top Header & Breadcrumbs Skeleton */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-16 rounded" />
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-28 rounded" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 w-48 sm:w-64 rounded-lg" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
      </div>

      {/* 4 Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <SkeletonCard key={i} className="flex flex-col justify-between min-h-[110px] p-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-20 rounded" />
              <Skeleton className="h-4 w-4 rounded" />
            </div>
            <div className="mt-3 space-y-1">
              <Skeleton className="h-7 w-16 rounded" />
              <Skeleton className="h-2.5 w-24 rounded" />
            </div>
          </SkeletonCard>
        ))}
      </div>

      {/* Tabs Toolbar Skeleton */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-lg" />
        ))}
      </div>

      {/* Phase Pipeline Skeleton */}
      <SkeletonCard className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-40 rounded" />
          <Skeleton className="h-4 w-20 rounded" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-xl border border-border/40 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-4 w-12 rounded-full" />
              </div>
              <Skeleton className="h-3 w-3/4 rounded" />
            </div>
          ))}
        </div>
      </SkeletonCard>

      {/* Tasks Table Skeleton */}
      <SkeletonCard className="p-5 sm:p-6 space-y-3">
        <div className="flex items-center justify-between pb-2">
          <Skeleton className="h-5 w-32 rounded" />
          <Skeleton className="h-4 w-16 rounded" />
        </div>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between py-2.5 border-b border-border/30 last:border-0">
            <div className="space-y-1 flex-1">
              <Skeleton className="h-4 w-48 rounded" />
              <Skeleton className="h-3 w-32 rounded" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-4 w-20 rounded" />
              <SkeletonAvatar size="xs" />
            </div>
          </div>
        ))}
      </SkeletonCard>
    </div>
  );
}
