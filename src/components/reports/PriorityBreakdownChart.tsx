"use client";

import * as React from "react";
import { Flag, Clock } from "lucide-react";
import { SpotlightCard } from "@/components/ui/spotlight-card";

interface PriorityStat {
  level: string;
  count: number;
  avgHours: number;
  color: string;
  percentage: number;
}

const priorityStats: PriorityStat[] = [
  { level: "Urgent", count: 4, avgHours: 3.2, color: "#EF4444", percentage: 8 },
  { level: "High", count: 18, avgHours: 7.5, color: "#F59E0B", percentage: 36 },
  { level: "Medium", count: 22, avgHours: 14.8, color: "#3B82F6", percentage: 44 },
  { level: "Low", count: 6, avgHours: 28.0, color: "#64748B", percentage: 12 },
];

export function PriorityBreakdownChart() {
  return (
    <SpotlightCard className="flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Priority Allocation & Turnaround</h3>
          </div>
          <span className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
            <Clock className="h-3 w-3" /> SLA Performance
          </span>
        </div>

        {/* Stacked Percentage Bar */}
        <div className="mt-5">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
            {priorityStats.map((p) => (
              <div
                key={p.level}
                style={{ width: `${p.percentage}%`, backgroundColor: p.color }}
                className="h-full transition-all duration-300 hover:opacity-80"
                title={`${p.level}: ${p.count} tasks (${p.percentage}%)`}
              />
            ))}
          </div>
        </div>

        {/* Breakdown details */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {priorityStats.map((p) => (
            <div key={p.level} className="rounded-lg border border-border/80 bg-surface/50 p-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="text-[11px] font-bold text-foreground">{p.level}</span>
              </div>
              <p className="mt-2 text-base font-bold font-mono text-foreground">
                {p.count} <span className="text-[10px] text-muted-foreground font-sans">tasks</span>
              </p>
              <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                Avg: {p.avgHours}h
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-border/60 text-[11px] text-muted-foreground text-center font-mono">
        Average Resolution Turnaround: 9.4h (Target: &lt;12h)
      </div>
    </SpotlightCard>
  );
}
