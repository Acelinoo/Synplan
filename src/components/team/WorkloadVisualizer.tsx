"use client";

import * as React from "react";
import { Users, BarChart3, AlertTriangle, CheckCircle2 } from "lucide-react";
import { WorkspaceMember } from "@/types";

interface WorkloadVisualizerProps {
  members: WorkspaceMember[];
}

export function WorkloadVisualizer({ members }: WorkloadVisualizerProps) {
  const averageWorkload = members.length
    ? Math.round(members.reduce((acc, m) => acc + (m.workloadScore || 0), 0) / members.length)
    : 0;

  const totalAssignedTasks = members.reduce(
    (acc, m) => acc + (m.activeTaskCount ?? m.assignedTasksCount ?? 0),
    0
  );

  const overloadedMembers = members.filter((m) => (m.workloadScore || 0) > 85);
  const highMembers = members.filter((m) => (m.workloadScore || 0) > 65 && (m.workloadScore || 0) <= 85);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* 1. Squad Bandwidth */}
      <div className="rounded-lg border border-border bg-card p-4 sm:p-5 flex flex-col justify-between shadow-xs">
        <div className="flex items-center justify-between text-muted-foreground text-xs uppercase tracking-wider font-semibold">
          <span>Squad Bandwidth</span>
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <Users className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-mono font-bold text-foreground">
              {averageWorkload}%
            </span>
            <span className="text-xs text-emerald-500 font-medium flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {averageWorkload <= 65 ? "Optimal" : "Elevated"}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Across {members.length} squad member{members.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* 2. Total In-Flight Tasks */}
      <div className="rounded-lg border border-border bg-card p-4 sm:p-5 flex flex-col justify-between shadow-xs">
        <div className="flex items-center justify-between text-muted-foreground text-xs uppercase tracking-wider font-semibold">
          <span>Allocated Tasks</span>
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <BarChart3 className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-mono font-bold text-foreground">
              {totalAssignedTasks}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              Active Tasks
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Current in-flight sprint assignments
          </p>
        </div>
      </div>

      {/* 3. High Load Warning Alert */}
      <div className="rounded-lg border border-border bg-card p-4 sm:p-5 flex flex-col justify-between shadow-xs">
        <div className="flex items-center justify-between text-muted-foreground text-xs uppercase tracking-wider font-semibold">
          <span>Bottleneck Risk</span>
          <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
            {overloadedMembers.length > 0 ? (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            )}
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl sm:text-3xl font-mono font-bold ${
                overloadedMembers.length > 0 ? "text-destructive" : "text-emerald-500"
              }`}
            >
              {overloadedMembers.length}
            </span>
            <span
              className={`text-xs font-medium ${
                overloadedMembers.length > 0 ? "text-destructive" : "text-emerald-500"
              }`}
            >
              {overloadedMembers.length > 0
                ? "Overloaded (>85%)"
                : highMembers.length > 0
                ? `${highMembers.length} at High Capacity`
                : "Balanced Squad"}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {overloadedMembers.length > 0
              ? "Reallocation recommended to avoid blockers"
              : "Capacity is evenly distributed"}
          </p>
        </div>
      </div>
    </div>
  );
}
