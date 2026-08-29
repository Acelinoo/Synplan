import * as React from "react";
import { Skeleton, SkeletonCard, SkeletonAvatar } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="relative flex flex-col gap-6" aria-busy="true" aria-label="Loading Dashboard">
      {/* Header Skeleton */}
      <div className="space-y-1">
        <Skeleton className="h-8 w-56 sm:w-72 rounded-lg" />
        <Skeleton className="h-4 w-72 sm:w-96 rounded" />
      </div>

      {/* 4 KPI Summary Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <SkeletonCard key={i} className="flex flex-col justify-between min-h-[135px]">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-24 rounded" />
              <Skeleton className="h-4 w-4 rounded" />
            </div>
            <div className="mt-3 space-y-1.5">
              <Skeleton className="h-9 w-20 rounded-lg" />
              <Skeleton className="h-3 w-32 rounded" />
            </div>
          </SkeletonCard>
        ))}
      </div>

      {/* Middle Row: Recent Projects & Due Date */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Projects Skeleton */}
        <SkeletonCard className="flex flex-col justify-between min-h-[340px] p-5 sm:p-6">
          <div className="flex items-center justify-between pb-2">
            <Skeleton className="h-5 w-36 rounded" />
          </div>
          <div className="mt-4 space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-4 py-2 border-b border-border/40 last:border-0"
              >
                <div className="space-y-1.5 min-w-[140px]">
                  <Skeleton className="h-4 w-32 rounded" />
                  <Skeleton className="h-3.5 w-16 rounded" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-1.5 w-24 sm:w-28 rounded-full" />
                  <Skeleton className="h-3.5 w-8 rounded" />
                </div>
                <div className="flex items-center -space-x-1.5">
                  <SkeletonAvatar size="sm" />
                  <SkeletonAvatar size="sm" />
                </div>
              </div>
            ))}
          </div>
        </SkeletonCard>

        {/* Due Date Skeleton */}
        <SkeletonCard className="flex flex-col justify-between min-h-[340px] p-5 sm:p-6">
          <div className="flex items-center justify-between pb-2">
            <Skeleton className="h-5 w-28 rounded" />
          </div>
          <div className="mt-4 space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-4 py-2 border-b border-border/40 last:border-0"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <Skeleton className="h-4 w-36 rounded" />
                  <Skeleton className="h-3 w-24 rounded" />
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Skeleton className="h-4 w-16 rounded" />
                  <Skeleton className="h-3.5 w-24 rounded" />
                </div>
              </div>
            ))}
          </div>
        </SkeletonCard>
      </div>

      {/* Bottom Row: Recent Workspace Activity */}
      <SkeletonCard className="p-5 sm:p-6">
        <div className="flex items-center justify-between pb-3">
          <Skeleton className="h-5 w-48 rounded" />
        </div>
        <div className="mt-2 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 py-2 border-b border-border/30 last:border-0"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <SkeletonAvatar size="sm" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3.5 w-3/4 rounded" />
                </div>
              </div>
              <Skeleton className="h-3 w-16 rounded shrink-0" />
            </div>
          ))}
        </div>
      </SkeletonCard>
    </div>
  );
}
