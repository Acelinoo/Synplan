import * as React from "react";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="relative flex flex-col gap-6 max-w-5xl" aria-busy="true" aria-label="Loading Settings">
      {/* Header Skeleton */}
      <div className="border-b border-border pb-6 space-y-1.5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-64 rounded-lg" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
        <Skeleton className="h-3.5 w-96 rounded" />
      </div>

      {/* Profile Form Skeleton */}
      <SkeletonCard className="space-y-5 p-5 sm:p-6">
        <div className="flex items-center gap-2.5 border-b border-border pb-3">
          <Skeleton className="h-4 w-4 rounded" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-3 w-48 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-24 rounded" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-28 rounded" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
      </SkeletonCard>

      {/* Theme Appearance Skeleton */}
      <SkeletonCard className="space-y-4 p-5 sm:p-6">
        <div className="flex items-center gap-2.5 border-b border-border pb-3">
          <Skeleton className="h-4 w-4 rounded" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-36 rounded" />
            <Skeleton className="h-3 w-52 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </SkeletonCard>
    </div>
  );
}
