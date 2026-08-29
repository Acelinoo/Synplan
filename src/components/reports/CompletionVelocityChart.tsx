"use client";

import * as React from "react";
import { TrendingUp, BarChart2 } from "lucide-react";
import { SpotlightCard } from "@/components/ui/spotlight-card";

interface VelocityDataPoint {
  week: string;
  completed: number;
  planned: number;
}

const velocityDatasets: Record<"30d" | "q3" | "ytd", { data: VelocityDataPoint[]; trend: string; maxVal: number }> = {
  "30d": {
    data: [
      { week: "Wk 33", completed: 22, planned: 20 },
      { week: "Wk 34", completed: 19, planned: 24 },
      { week: "Wk 35", completed: 28, planned: 26 },
      { week: "Wk 36", completed: 32, planned: 30 },
    ],
    trend: "+18.4% WoW",
    maxVal: 35,
  },
  q3: {
    data: [
      { week: "Jul '26", completed: 64, planned: 70 },
      { week: "Aug '26", completed: 88, planned: 85 },
      { week: "Sep '26", completed: 92, planned: 90 },
    ],
    trend: "+24.1% MoM",
    maxVal: 100,
  },
  ytd: {
    data: [
      { week: "Q1 '26", completed: 142, planned: 150 },
      { week: "Q2 '26", completed: 180, planned: 175 },
      { week: "Q3 '26", completed: 195, planned: 185 },
    ],
    trend: "+31.2% YoY",
    maxVal: 220,
  },
};

interface CompletionVelocityChartProps {
  dateRange?: "30d" | "q3" | "ytd";
}

export function CompletionVelocityChart({ dateRange = "30d" }: CompletionVelocityChartProps) {
  const current = velocityDatasets[dateRange] || velocityDatasets["30d"];

  return (
    <SpotlightCard className="flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Sprint Velocity & Throughput</h3>
          </div>
          <span className="flex items-center gap-1 text-[11px] font-mono text-status-done font-semibold">
            <TrendingUp className="h-3 w-3" /> {current.trend}
          </span>
        </div>

        {/* Legend */}
        <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
            <span>Completed Tasks</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-muted" />
            <span>Planned Scope</span>
          </div>
        </div>

        {/* Bar Chart Visualization */}
        <div className="mt-6 flex items-end justify-between gap-3 h-44 pt-4 border-b border-border/80">
          {current.data.map((dp) => {
            const completedHeight = Math.min(100, Math.round((dp.completed / current.maxVal) * 100));
            const plannedHeight = Math.min(100, Math.round((dp.planned / current.maxVal) * 100));

            return (
              <div key={dp.week} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                <div className="flex items-end gap-1.5 h-full w-full justify-center">
                  {/* Planned bar */}
                  <div
                    className="w-3.5 rounded-t bg-muted/60 transition-all duration-500 group-hover:bg-muted"
                    style={{ height: `${plannedHeight}%` }}
                    title={`Planned: ${dp.planned}`}
                  />
                  {/* Completed bar */}
                  <div
                    className="w-3.5 rounded-t bg-primary transition-all duration-500 group-hover:bg-primary-hover shadow-sm"
                    style={{ height: `${completedHeight}%` }}
                    title={`Completed: ${dp.completed}`}
                  />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground group-hover:text-foreground transition-colors">
                  {dp.week}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground pt-2">
        <span>Average Completion Rate</span>
        <span className="font-mono font-bold text-foreground">
          {Math.round(
            (current.data.reduce((a, b) => a + b.completed, 0) /
              current.data.reduce((a, b) => a + b.planned, 0)) *
              100
          )}
          %
        </span>
      </div>
    </SpotlightCard>
  );
}
