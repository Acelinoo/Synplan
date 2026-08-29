"use client";

import * as React from "react";
import { PieChart, Layers } from "lucide-react";
import { SpotlightCard } from "@/components/ui/spotlight-card";

interface Slice {
  label: string;
  count: number;
  color: string;
  percentage: number;
}

const statusSlices: Slice[] = [
  { label: "Done", count: 42, color: "#10B981", percentage: 56 },
  { label: "In Progress", count: 18, color: "#3B82F6", percentage: 24 },
  { label: "In Review", count: 8, color: "#F59E0B", percentage: 11 },
  { label: "To Do", count: 5, color: "#94A3B8", percentage: 7 },
  { label: "Blocked", count: 2, color: "#EF4444", percentage: 2 },
];

export function StatusDistributionDonut() {
  const totalTasks = statusSlices.reduce((acc, s) => acc + s.count, 0);

  return (
    <SpotlightCard className="flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <PieChart className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Task Status Breakdown</h3>
          </div>
          <span className="rounded-full bg-card border border-border px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
            {totalTasks} Total Tasks
          </span>
        </div>

        {/* Donut graphic + stats */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-around gap-6">
          {/* Custom SVG Ring */}
          <div className="relative flex h-36 w-36 items-center justify-center">
            <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
              {/* Slices */}
              {(() => {
                let accumulated = 0;
                return statusSlices.map((slice, i) => {
                  const strokeDasharray = `${slice.percentage} ${100 - slice.percentage}`;
                  const strokeDashoffset = -accumulated;
                  accumulated += slice.percentage;

                  return (
                    <circle
                      key={i}
                      cx="18"
                      cy="18"
                      r="15.91549430918954"
                      fill="transparent"
                      stroke={slice.color}
                      strokeWidth="3.5"
                      strokeDasharray={strokeDasharray}
                      strokeDashoffset={strokeDashoffset}
                      className="transition-all duration-500 hover:opacity-80"
                    />
                  );
                });
              })()}
            </svg>
            <div className="absolute flex flex-col items-center justify-center text-center">
              <span className="text-xl font-bold font-mono text-foreground">56%</span>
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">Done</span>
            </div>
          </div>

          {/* Slices Legend */}
          <div className="space-y-2 flex-1 max-w-[200px]">
            {statusSlices.map((slice) => (
              <div key={slice.label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="text-muted-foreground">{slice.label}</span>
                </div>
                <span className="font-mono font-bold text-foreground">
                  {slice.count} ({slice.percentage}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-border/60 text-[11px] text-muted-foreground text-center font-mono">
        Sprint Completion Ratio: 80% Threshold Surpassed
      </div>
    </SpotlightCard>
  );
}
