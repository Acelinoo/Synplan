"use client";

import * as React from "react";
import { Activity, Clock, RefreshCw, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ProjectActivityTabProps {
  activity: any[];
  isLoading: boolean;
  onRefresh: () => void;
}

export function ProjectActivityTab({
  activity,
  isLoading,
  onRefresh,
}: ProjectActivityTabProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4 shadow-2xs">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border/60">
        <div>
          <h3 className="text-sm font-bold text-foreground">Project Audit & Activity Log</h3>
          <p className="text-xs text-muted-foreground">
            Authoritative stream of all domain mutations and collaborator actions for this project.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="h-8 gap-1.5 text-xs font-medium cursor-pointer"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Stream List */}
      {activity.length === 0 ? (
        <div className="py-12 text-center text-xs text-muted-foreground space-y-2">
          <Activity className="h-8 w-8 mx-auto text-muted-foreground/50" />
          <p>No audit activity recorded yet for this project.</p>
        </div>
      ) : (
        <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/60">
          {activity.map((item) => {
            const actorName = item.actor?.name || "System Actor";
            const initial = actorName.charAt(0).toUpperCase();
            const actionFormatted = (item.action || "").toLowerCase().replace(/_/g, " ");

            return (
              <div key={item.id} className="relative group flex items-start gap-3 text-xs">
                {/* Timeline Dot / Avatar */}
                <div className="absolute -left-6 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-card border border-border ring-2 ring-background">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                </div>

                {/* Content Card */}
                <div className="flex-1 rounded-lg border border-border/60 bg-surface-muted/30 p-3 space-y-1 hover:border-border transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-medium">
                      <span className="font-bold text-foreground">{actorName}</span>
                      <span className="text-muted-foreground capitalize">{actionFormatted}</span>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{new Date(item.timestamp).toLocaleString()}</span>
                    </div>
                  </div>

                  {item.target && (
                    <p className="text-foreground font-medium text-xs break-words">
                      {item.target}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
