import { Skeleton } from "@/components/ui/skeleton";

export default function ActivityLoading() {
  return (
    <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-6">
      {/* Page Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-6 w-6 rounded-md" />
            <Skeleton className="h-7 w-52" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <Skeleton className="h-6 w-28 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      </div>

      {/* Filter Toolbar Skeleton */}
      <div className="rounded-2xl border border-border/60 bg-card/60 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <Skeleton className="h-9 flex-1 rounded-xl" />
          <Skeleton className="h-9 w-full sm:w-44 rounded-xl" />
          <Skeleton className="h-9 w-full sm:w-44 rounded-xl" />
        </div>
        <div className="flex gap-2 pt-2 border-t border-border/40">
          <Skeleton className="h-7 w-20 rounded-lg" />
          <Skeleton className="h-7 w-16 rounded-lg" />
          <Skeleton className="h-7 w-20 rounded-lg" />
          <Skeleton className="h-7 w-20 rounded-lg" />
        </div>
      </div>

      {/* Timeline Nodes Skeleton */}
      <div className="space-y-6 pt-2">
        {/* Date Group Header */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-16 rounded" />
          <div className="h-[1px] flex-1 bg-border/40" />
          <Skeleton className="h-3 w-14 rounded" />
        </div>

        {/* Timeline Items */}
        <div className="space-y-4 pl-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-2 rounded-xl border border-border/40 bg-card/40 p-3.5">
                <div className="flex items-center justify-between gap-4">
                  <Skeleton className="h-4 w-2/3 rounded" />
                  <Skeleton className="h-3 w-16 rounded" />
                </div>
                <Skeleton className="h-3 w-1/3 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
