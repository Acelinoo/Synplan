"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Activity, ArrowRight } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { useWorkspaceStore } from "@/store";
import { Skeleton } from "@/components/ui/skeleton";
import { useRealtime } from "@/components/realtime/RealtimeProvider";

interface ActivityItem {
  id: string;
  actor: {
    name: string;
    initial: string;
  };
  action: string;
  target: string;
  timestamp: string;
  entityType?: string;
  entityId?: string;
  link?: string;
}

export function RecentActivityFeed() {
  const router = useRouter();
  const { activeWorkspace, isWorkspaceValidated } = useWorkspaceStore();
  const { onEvent } = useRealtime();
  const [activities, setActivities] = React.useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Realtime Activity Feed Synchronization
  React.useEffect(() => {
    const unsubActivity = onEvent("ACTIVITY_CREATED", (event) => {
      const raw = event.payload;
      if (!raw) return;

      let targetLink = raw.link || "/tasks";
      if (!raw.link) {
        if (raw.entityType === "PROJECT" || raw.action?.toUpperCase().includes("PROJECT")) {
          targetLink = raw.entityId ? `/projects/${raw.entityId}` : "/projects";
        } else if (raw.entityType === "MEMBER" || raw.action?.toUpperCase().includes("MEMBER")) {
          targetLink = "/team";
        } else if (raw.entityId) {
          targetLink = `/tasks?taskId=${raw.entityId}`;
        }
      }

      const newAct: ActivityItem = {
        id: raw.id || `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        actor: {
          name: raw.actor?.name || ((raw as any).actorType === "SYSTEM" ? "System Automation" : "Team Member"),
          initial: raw.actor?.initial || (raw.actor?.name ? raw.actor.name.charAt(0).toUpperCase() : (raw as any).actorType === "SYSTEM" ? "⚡" : "U"),
        },
        action: (raw.action || "updated").toLowerCase().replace(/_/g, " "),
        target: raw.target || "delivery item",
        timestamp: raw.timestamp || "Just now",
        entityType: raw.entityType,
        entityId: raw.entityId,
        link: targetLink,
      };

      setActivities((prev) => {
        if (prev.some((a) => a.id === newAct.id)) return prev;
        return [newAct, ...prev];
      });
    });

    return () => {
      unsubActivity();
    };
  }, [onEvent]);

  React.useEffect(() => {
    if (!activeWorkspace?.id || !isWorkspaceValidated) {
      setIsLoading(true);
      return;
    }

    let isMounted = true;
    async function loadActivities(wsId: string) {
      setIsLoading(true);
      setError(null);
      try {
        const res = await apiClient.getActivity({ workspaceId: wsId, limit: 6 });
        if (!isMounted) return;
        if (res.success && Array.isArray(res.data?.items)) {
          const liveActs = res.data.items.map((act: any) => {
            let targetLink = "/tasks";
            if (act.entityType === "PROJECT" || act.action?.toUpperCase().includes("PROJECT")) {
              targetLink = act.entityId ? `/projects/${act.entityId}` : "/projects";
            } else if (act.entityType === "MEMBER" || act.action?.toUpperCase().includes("MEMBER")) {
              targetLink = "/team";
            } else if (act.entityId) {
              targetLink = `/tasks?taskId=${act.entityId}`;
            }

            const actorName = act.actor?.name || (act.actorType === "SYSTEM" ? "System Automation" : "Team Member");

            return {
              id: act.id,
              actor: {
                name: actorName,
                initial: actorName ? actorName.charAt(0).toUpperCase() : "U",
              },
              action: (act.action || "updated").toLowerCase().replace(/_/g, " "),
              target: act.target || "delivery milestone",
              timestamp: act.timestamp ? new Date(act.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Just now",
              entityType: act.entityType,
              entityId: act.entityId,
              link: targetLink,
            };
          });
          setActivities(liveActs);
        } else if (!res.success) {
          setError(res.error || "Failed to load activities");
          setActivities([]);
        } else {
          setActivities([]);
        }
      } catch (e: any) {
        if (!isMounted) return;
        console.warn("Activity feed API load error:", e);
        setError(e?.message || "Failed to load activities");
        setActivities([]);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    loadActivities(activeWorkspace.id);

    return () => {
      isMounted = false;
    };
  }, [activeWorkspace?.id, isWorkspaceValidated]);

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="text-xs sm:text-sm font-bold tracking-tight text-foreground uppercase font-mono">
            Recent Activity Audit
          </h2>
          <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.2 text-[10px] font-mono font-bold text-primary">
            Live Stream
          </span>
        </div>
        <button
          onClick={() => router.push("/activity")}
          className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
        >
          <span>View All Activity</span>
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {/* Stream List */}
      <div className="mt-3">
        {isLoading ? (
          <div className="space-y-3 py-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-2 border-b border-border/30 last:border-0">
                <div className="flex items-center gap-3 flex-1">
                  <Skeleton className="h-6 w-6 rounded-full shrink-0" />
                  <Skeleton className="h-3.5 w-3/4 rounded" />
                </div>
                <Skeleton className="h-3 w-14 rounded" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="py-6 text-center text-xs text-destructive">
            {error}
          </div>
        ) : activities.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No recent activity recorded yet in this workspace.
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {activities.map((act) => (
              <div
                key={act.id}
                tabIndex={0}
                role="button"
                aria-label={`View activity: ${act.actor.name} ${act.action} ${act.target}`}
                onClick={() => act.link && router.push(act.link)}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && act.link) {
                    e.preventDefault();
                    router.push(act.link);
                  }
                }}
                className="group flex items-center justify-between gap-3 py-2.5 px-2 hover:bg-surface-muted/50 rounded-md transition-colors cursor-pointer"
              >
                {/* Avatar Initial + Text */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold font-mono shadow-2xs">
                    {act.actor.initial}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    <span className="font-semibold text-foreground mr-1.5 group-hover:text-primary transition-colors">
                      {act.actor.name}
                    </span>
                    <span className="text-foreground/80">{act.action}</span>{" "}
                    <span className="font-medium text-foreground">&ldquo;{act.target}&rdquo;</span>
                  </p>
                </div>

                {/* Timestamp */}
                <span className="text-[11px] font-mono text-muted-foreground whitespace-nowrap shrink-0 text-right ml-2">
                  {act.timestamp}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
