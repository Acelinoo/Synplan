"use client";

import * as React from "react";
import { Users, BarChart3, AlertCircle, CheckCircle2 } from "lucide-react";
import { WorkspaceMember } from "@/types";
import { SpotlightCard } from "@/components/ui/spotlight-card";

interface WorkloadVisualizerProps {
  members: WorkspaceMember[];
}

export function WorkloadVisualizer({ members }: WorkloadVisualizerProps) {
  const averageWorkload = members.length
    ? Math.round(members.reduce((acc, m) => acc + m.workloadScore, 0) / members.length)
    : 0;

  const totalAssignedTasks = members.reduce((acc, m) => acc + m.assignedTasksCount, 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* 1. Team Capacity Health */}
      <SpotlightCard className="flex flex-col justify-between">
        <div className="flex items-center justify-between text-muted-foreground text-xs uppercase tracking-wider font-semibold">
          <span>Squad Bandwidth</span>
          <div className="p-1.5 rounded-md bg-primary/10 text-primary">
            <Users className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold text-foreground">
              {averageWorkload}%
            </span>
            <span className="text-xs text-status-done font-medium flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Optimal
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Across {members.length} team members
          </p>
        </div>
      </SpotlightCard>

      {/* 2. Total In-Flight Tasks */}
      <SpotlightCard className="flex flex-col justify-between">
        <div className="flex items-center justify-between text-muted-foreground text-xs uppercase tracking-wider font-semibold">
          <span>Allocated Tasks</span>
          <div className="p-1.5 rounded-md bg-status-progress/10 text-status-progress">
            <BarChart3 className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold text-foreground">
              {totalAssignedTasks}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              Tasks
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Active in current sprint backlog
          </p>
        </div>
      </SpotlightCard>

      {/* 3. High Load Warning Alert */}
      <SpotlightCard className="flex flex-col justify-between">
        <div className="flex items-center justify-between text-muted-foreground text-xs uppercase tracking-wider font-semibold">
          <span>Bottleneck Risk</span>
          <div className="p-1.5 rounded-md bg-status-done/10 text-status-done">
            <CheckCircle2 className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold text-status-done">
              0
            </span>
            <span className="text-xs text-status-done font-medium">
              No Overloaded Members
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Workload is evenly distributed
          </p>
        </div>
      </SpotlightCard>
    </div>
  );
}
