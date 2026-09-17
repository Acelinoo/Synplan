import * as React from "react";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-6 max-w-6xl" aria-busy="true" aria-label="Loading Settings">
      {/* Header Skeleton */}
      <div className="border-b border-border pb-5 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-64 rounded-lg" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
        <Skeleton className="h-3.5 w-96 rounded" />
      </div>

      {/* Main Grid Skeleton: Sidebar + Content */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-start">
        {/* Sidebar Skeleton */}
        <div className="hidden sm:flex sm:col-span-4 lg:col-span-3 flex-col gap-2 rounded-xl border border-border bg-card p-3">
          <Skeleton className="h-4 w-28 rounded mb-2" />
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>

        {/* Content Pane Skeleton */}
        <div className="sm:col-span-8 lg:col-span-9 space-y-6">
          <SkeletonCard className="space-y-5 p-5 sm:p-6">
            <div className="flex items-center gap-2.5 border-b border-border pb-4">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-48 rounded" />
                <Skeleton className="h-3 w-64 rounded" />
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-28 rounded" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-32 rounded" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
            </div>
            <div className="flex justify-end pt-3 border-t border-border">
              <Skeleton className="h-8 w-28 rounded-lg" />
            </div>
          </SkeletonCard>

          <SkeletonCard className="p-5 space-y-3">
            <Skeleton className="h-4 w-36 rounded" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
            </div>
          </SkeletonCard>
        </div>
      </div>
    </div>
  );
}
