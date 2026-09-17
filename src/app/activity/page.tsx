"use client";

import * as React from "react";
import {
  Activity,
  RefreshCw,
  ArrowUp,
  AlertCircle,
  Inbox,
  FilterX,
  Loader2,
} from "lucide-react";
import { useWorkspaceStore } from "@/store";
import { apiClient } from "@/lib/apiClient";
import { ActivityItem } from "@/domains/activity/activity.service";
import { Button } from "@/components/ui/button";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import {
  ActivityTimelineItem,
  ActivityFilterToolbar,
  getActivityDateGroup,
  ActivityDateGroup,
} from "@/components/activity";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

export default function ActivityPage() {
  const { activeWorkspace, isWorkspaceValidated, members, setMembers, projects, setProjects } = useWorkspaceStore();
  const { onEvent, isConnected } = useRealtime();

  // Data & Pagination State
  const [activities, setActivities] = React.useState<ActivityItem[]>([]);
  const [pagination, setPagination] = React.useState<{
    total: number;
    page: number;
    totalPages: number;
    hasMore: boolean;
    nextCursor?: string | null;
  } | null>(null);

  const [isLoading, setIsLoading] = React.useState(true);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Filter State
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [selectedActorId, setSelectedActorId] = React.useState("all");
  const [selectedProjectId, setSelectedProjectId] = React.useState("all");
  const [selectedEntityType, setSelectedEntityType] = React.useState("all");

  // Realtime Live Stream Queue State
  const [incomingCount, setIncomingCount] = React.useState(0);
  const [isScrolledDown, setIsScrolledDown] = React.useState(false);

  // Debounce search query
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Track viewport scroll to avoid jumping
  React.useEffect(() => {
    const handleScroll = () => {
      setIsScrolledDown(window.scrollY > 200);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // 1. Fetch Workspace Members & Projects if needed
  React.useEffect(() => {
    if (!activeWorkspace?.id || !isWorkspaceValidated) return;

    if (members.length === 0) {
      apiClient.getTeamMembers(activeWorkspace.id).then((res) => {
        if (res.success && Array.isArray(res.data)) {
          setMembers(res.data);
        }
      }).catch((err) => console.warn("[Activity] Failed to load team members:", err));
    }

    if (projects.length === 0) {
      apiClient.getProjects({ workspaceId: activeWorkspace.id }).then((res) => {
        if (res.success && Array.isArray(res.data)) {
          setProjects(res.data);
        }
      }).catch((err) => console.warn("[Activity] Failed to load projects:", err));
    }
  }, [activeWorkspace?.id, isWorkspaceValidated, members.length, projects.length, setMembers, setProjects]);

  // 2. Authoritative Activity Fetcher
  const loadActivities = React.useCallback(
    async (reset = true) => {
      if (!activeWorkspace?.id || !isWorkspaceValidated) return;

      if (reset) {
        setIsLoading(true);
        setError(null);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const targetPage = reset ? 1 : (pagination?.page || 1) + 1;
        const targetCursor = reset ? undefined : pagination?.nextCursor || undefined;

        const res = await apiClient.getActivity({
          workspaceId: activeWorkspace.id,
          projectId: selectedProjectId !== "all" ? selectedProjectId : undefined,
          actorId: selectedActorId !== "all" ? selectedActorId : undefined,
          entityType: selectedEntityType !== "all" ? selectedEntityType : undefined,
          search: debouncedSearch.trim() ? debouncedSearch.trim() : undefined,
          page: targetPage,
          limit: PAGE_SIZE,
          cursor: targetCursor,
        });

        if (res.success) {
          const items: ActivityItem[] = Array.isArray(res.data)
            ? res.data
            : Array.isArray(res.data?.items)
            ? res.data.items
            : [];

          const pag = res.pagination || res.data?.pagination;

          if (reset) {
            setActivities(items);
            setIncomingCount(0);
          } else {
            // Deduplicate items on append
            setActivities((prev) => {
              const existingIds = new Set(prev.map((a) => a.id));
              const newUnique = items.filter((item) => !existingIds.has(item.id));
              return [...prev, ...newUnique];
            });
          }

          if (pag) {
            setPagination({
              total: pag.total ?? items.length,
              page: pag.page ?? targetPage,
              totalPages: pag.totalPages ?? 1,
              hasMore: Boolean(pag.hasMore),
              nextCursor: pag.nextCursor,
            });
          }
        } else {
          setError(res.error || "Failed to load workspace activity.");
        }
      } catch (err: any) {
        console.error("[Activity] Query failure:", err);
        setError(err?.message || "An unexpected error occurred while querying the activity feed.");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
        setIsRefreshing(false);
      }
    },
    [
      activeWorkspace?.id,
      isWorkspaceValidated,
      selectedProjectId,
      selectedActorId,
      selectedEntityType,
      debouncedSearch,
      pagination?.page,
      pagination?.nextCursor,
    ]
  );

  // Trigger initial or filter-change load
  React.useEffect(() => {
    loadActivities(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeWorkspace?.id,
    isWorkspaceValidated,
    selectedProjectId,
    selectedActorId,
    selectedEntityType,
    debouncedSearch,
  ]);

  // 3. Centralized Realtime Listeners
  React.useEffect(() => {
    const handleRealtimeEvent = () => {
      if (isScrolledDown) {
        setIncomingCount((c) => c + 1);
      } else {
        // User is at top of page, refresh seamlessly
        loadActivities(true);
      }
    };

    const unsubs = [
      onEvent("TASK_CREATED", handleRealtimeEvent),
      onEvent("TASK_UPDATED", handleRealtimeEvent),
      onEvent("TASK_STATUS_CHANGED", handleRealtimeEvent),
      onEvent("TASK_ASSIGNED", handleRealtimeEvent),
      onEvent("TASK_DELETED", handleRealtimeEvent),
      onEvent("COMMENT_CREATED", handleRealtimeEvent),
      onEvent("PROJECT_CREATED", handleRealtimeEvent),
      onEvent("PROJECT_UPDATED", handleRealtimeEvent),
      onEvent("PROJECT_DELETED", handleRealtimeEvent),
      onEvent("PHASE_CREATED", handleRealtimeEvent),
      onEvent("PHASE_UPDATED", handleRealtimeEvent),
      onEvent("PHASES_REORDERED", handleRealtimeEvent),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [onEvent, isScrolledDown, loadActivities]);

  // Reset Filters handler
  const handleResetFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setSelectedActorId("all");
    setSelectedProjectId("all");
    setSelectedEntityType("all");
  };

  const actorOptions = React.useMemo(() => {
    return members.map((m) => ({
      id: m.user?.id || m.id,
      name: m.user?.name || "Team Member",
      email: m.user?.email,
      avatarUrl: m.user?.avatarUrl,
    }));
  }, [members]);

  const hasActiveFilters = Boolean(
    debouncedSearch ||
    selectedActorId !== "all" ||
    selectedProjectId !== "all" ||
    selectedEntityType !== "all"
  );

  // 4. Group Activities by Date Categories
  const groupedActivities = React.useMemo(() => {
    const groups: Record<ActivityDateGroup, ActivityItem[]> = {
      Today: [],
      Yesterday: [],
      "This Week": [],
      Earlier: [],
    };

    activities.forEach((item) => {
      const groupKey = getActivityDateGroup(item.timestamp);
      groups[groupKey].push(item);
    });

    return groups;
  }, [activities]);

  const dateGroupKeys: ActivityDateGroup[] = ["Today", "Yesterday", "This Week", "Earlier"];

  return (
    <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <Activity className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Workspace Activity
            </h1>
            {pagination?.total !== undefined && (
              <span className="rounded-full bg-muted/60 px-2.5 py-0.5 font-mono text-xs font-medium text-muted-foreground border border-border/40">
                {pagination.total} {pagination.total === 1 ? "event" : "events"}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Authoritative audit trail of domain events, state machine transitions, and team deliveries.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {/* Live Sync Badge */}
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border",
              isConnected
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-border/60 bg-muted/40 text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                isConnected ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"
              )}
            />
            <span>{isConnected ? "Live Audit Sync" : "Syncing"}</span>
          </div>

          {/* Refresh Action */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsRefreshing(true);
              loadActivities(true);
            }}
            disabled={isRefreshing || isLoading}
            className="h-8 px-3 gap-1.5 text-xs"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <ActivityFilterToolbar
        search={search}
        onSearchChange={setSearch}
        selectedActorId={selectedActorId}
        onActorChange={setSelectedActorId}
        selectedProjectId={selectedProjectId}
        onProjectChange={setSelectedProjectId}
        selectedEntityType={selectedEntityType}
        onEntityTypeChange={setSelectedEntityType}
        members={actorOptions}
        projects={projects}
        onResetFilters={handleResetFilters}
        hasActiveFilters={hasActiveFilters}
      />

      {/* Non-Disruptive Floating Live Banner */}
      {incomingCount > 0 && (
        <div className="sticky top-4 z-30 flex justify-center animate-in fade-in slide-in-from-top-2">
          <button
            onClick={() => {
              window.scrollTo({ top: 0, behavior: "smooth" });
              setIncomingCount(0);
              loadActivities(true);
            }}
            className="flex items-center gap-2 rounded-full border border-primary/40 bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-lg hover:bg-primary/95 transition-all"
          >
            <ArrowUp className="h-3.5 w-3.5" />
            <span>
              {incomingCount} new {incomingCount === 1 ? "activity" : "activities"} recorded • Click to view
            </span>
          </button>
        </div>
      )}

      {/* Content Feed */}
      {isLoading ? (
        <div className="flex flex-col gap-6 py-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4 pl-2">
              <div className="h-8 w-8 rounded-full bg-muted/60 animate-pulse shrink-0" />
              <div className="flex-1 space-y-2 rounded-lg border border-border/40 bg-card/40 p-3.5">
                <div className="h-4 w-3/4 bg-muted/60 rounded animate-pulse" />
                <div className="h-3 w-1/4 bg-muted/40 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 p-12 text-center">
          <AlertCircle className="h-8 w-8 text-destructive mb-2" />
          <h3 className="text-sm font-semibold text-foreground">Unable to load activity</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadActivities(true)}
            className="mt-4 gap-1.5 text-xs cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry Query</span>
          </Button>
        </div>
      ) : activities.length === 0 ? (
        hasActiveFilters ? (
          /* Filter Empty State */
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 p-12 text-center">
            <FilterX className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <h3 className="text-sm font-semibold text-foreground">No matching activity found</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              No audit logs match your selected filter criteria. Try broadening your search or resetting filters.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              className="mt-4 gap-1.5 text-xs cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Reset All Filters</span>
            </Button>
          </div>
        ) : (
          /* Zero State (No activities in workspace yet) */
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 p-12 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <h3 className="text-sm font-semibold text-foreground">No workspace activity yet</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Actions performed across tasks, projects, phases, and team assignments will stream here automatically.
            </p>
          </div>
        )
      ) : (
        /* Render Date-Grouped Timeline */
        <div className="flex flex-col gap-6">
          {dateGroupKeys.map((groupKey) => {
            const groupItems = groupedActivities[groupKey];
            if (groupItems.length === 0) return null;

            return (
              <div key={groupKey} className="flex flex-col">
                {/* Date Group Sticky Header */}
                <div className="sticky top-0 z-20 mb-3 flex items-center gap-3 bg-background/95 py-2 backdrop-blur-sm">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono">
                    {groupKey}
                  </span>
                  <div className="h-[1px] flex-1 bg-border/40" />
                  <span className="text-[11px] font-mono text-muted-foreground/70">
                    {groupItems.length} {groupItems.length === 1 ? "event" : "events"}
                  </span>
                </div>

                {/* Timeline Nodes */}
                <div className="flex flex-col">
                  {groupItems.map((item, idx) => (
                    <ActivityTimelineItem
                      key={item.id}
                      item={item}
                      isLast={idx === groupItems.length - 1}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Pagination & Load More */}
          {pagination?.hasMore && (
            <div className="flex justify-center pt-2 pb-8">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadActivities(false)}
                disabled={isLoadingMore}
                className="h-8.5 px-4 text-xs gap-2 rounded-md border-border/70 hover:bg-muted/40 transition-all shadow-2xs cursor-pointer"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span>Loading older activities...</span>
                  </>
                ) : (
                  <span>Load Older Activity</span>
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
