"use client";

import * as React from "react";
import {
  BarChart3,
  Download,
  Calendar,
  TrendingUp,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MagnetButton } from "@/components/ui/magnet-button";
import dynamic from "next/dynamic";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { CompletionVelocityChart } from "@/components/reports/CompletionVelocityChart";
import { StatusDistributionDonut } from "@/components/reports/StatusDistributionDonut";
import { PriorityBreakdownChart } from "@/components/reports/PriorityBreakdownChart";
import { AnimatedGrid } from "@/components/ui/animated-grid";
import { CountUp } from "@/components/ui/count-up";
import { apiClient } from "@/lib/apiClient";

const ExportReportModal = dynamic(
  () => import("@/components/reports/ExportReportModal").then((mod) => mod.ExportReportModal),
  { ssr: false }
);

export default function ReportsPage() {
  const [isExportOpen, setIsExportOpen] = React.useState(false);
  const [dateRange, setDateRange] = React.useState<"30d" | "q3" | "ytd">("30d");

  const [baseMetrics, setBaseMetrics] = React.useState({
    onTimeRate: 91.2,
    cycleTimeDays: 3.4,
    velocityTasksPerWk: 32,
    overdueCount: 2,
    completionRate: 88.0,
  });

  React.useEffect(() => {
    async function loadAnalytics() {
      try {
        const [repRes, pulseRes] = await Promise.all([
          apiClient.getAnalyticsReports(),
          apiClient.getAnalyticsPulse(),
        ]);
        if (repRes.success && repRes.data) {
          setBaseMetrics((prev) => ({
            ...prev,
            completionRate: repRes.data.completionRate ?? prev.completionRate,
            overdueCount: repRes.data.overdueList ? repRes.data.overdueList.length : prev.overdueCount,
          }));
        }
        if (pulseRes.success && pulseRes.data) {
          setBaseMetrics((prev) => ({
            ...prev,
            onTimeRate: pulseRes.data.onTimeRate ?? prev.onTimeRate,
            cycleTimeDays: pulseRes.data.cycleTimeDays ?? prev.cycleTimeDays,
            velocityTasksPerWk: Math.round(pulseRes.data.avgVelocity) ?? prev.velocityTasksPerWk,
          }));
        }
      } catch (e) {
        console.warn("Analytics API load fallback:", e);
      }
    }
    loadAnalytics();
  }, []);

  // Compute reactive metrics based on dateRange
  const displayedMetrics = React.useMemo(() => {
    if (dateRange === "q3") {
      return {
        onTimeRate: 94.6,
        cycleTimeDays: 2.8,
        velocityTasksPerWk: 45,
        overdueCount: 1,
        completionRate: 92.4,
        periodName: "Q3 2026 Aggregate",
      };
    }
    if (dateRange === "ytd") {
      return {
        onTimeRate: 89.1,
        cycleTimeDays: 3.9,
        velocityTasksPerWk: 38,
        overdueCount: 4,
        completionRate: 86.5,
        periodName: "Year-to-Date 2026",
      };
    }
    return {
      ...baseMetrics,
      periodName: "Last 30 Days (Sprint #14)",
    };
  }, [dateRange, baseMetrics]);

  return (
    <div className="relative flex flex-col gap-6">
      <AnimatedGrid />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Reports & Analytics
            </h1>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-mono font-bold text-primary">
              {displayedMetrics.periodName}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Data-focused metrics on sprint throughput, completion turnaround, priority allocations, and milestone delivery.
          </p>
        </div>

        {/* Action & Date Range Filter */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center rounded-md border border-border bg-card p-0.5 text-xs">
            {(
              [
                { key: "30d", label: "Last 30 Days" },
                { key: "q3", label: "Q3 2026" },
                { key: "ytd", label: "Year-to-Date" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setDateRange(tab.key)}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  dateRange === tab.key
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <MagnetButton
            size="sm"
            onClick={() => setIsExportOpen(true)}
            className="gap-1.5 text-xs font-semibold"
          >
            <Download className="h-4 w-4" />
            <span>Export Analytics</span>
          </MagnetButton>
        </div>
      </div>

      {/* KPI Top Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SpotlightCard className="flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground text-xs uppercase font-semibold">
            <span>On-Time Rate</span>
            <CheckCircle2 className="h-4 w-4 text-status-done" />
          </div>
          <div className="mt-3">
            <span className="text-3xl font-mono font-bold text-foreground">
              <CountUp value={displayedMetrics.onTimeRate} decimals={1} suffix="%" duration={900} />
            </span>
            <p className="text-[11px] text-status-done mt-1">
              +4.8% vs last sprint
            </p>
          </div>
        </SpotlightCard>

        <SpotlightCard className="flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground text-xs uppercase font-semibold">
            <span>Avg. Cycle Time</span>
            <Clock className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-mono font-bold text-foreground">
                <CountUp value={displayedMetrics.cycleTimeDays} decimals={1} duration={800} />
              </span>
              <span className="text-xs font-mono text-muted-foreground">days</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              From To Do to Completed
            </p>
          </div>
        </SpotlightCard>

        <SpotlightCard className="flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground text-xs uppercase font-semibold">
            <span>Sprint Velocity</span>
            <TrendingUp className="h-4 w-4 text-status-progress" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-mono font-bold text-foreground">
                <CountUp value={displayedMetrics.velocityTasksPerWk} duration={700} />
              </span>
              <span className="text-xs font-mono text-muted-foreground">tasks/wk</span>
            </div>
            <p className="text-[11px] text-status-done mt-1">
              Consistent high output
            </p>
          </div>
        </SpotlightCard>

        <SpotlightCard className="flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground text-xs uppercase font-semibold">
            <span>Overdue Scope</span>
            <AlertTriangle className="h-4 w-4 text-status-blocked" />
          </div>
          <div className="mt-3">
            <span className="text-3xl font-mono font-bold text-status-blocked">
              <CountUp value={displayedMetrics.overdueCount} duration={500} />
            </span>
            <p className="text-[11px] text-muted-foreground mt-1">
              Awaiting blocker resolution
            </p>
          </div>
        </SpotlightCard>
      </div>

      {/* Analytical Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CompletionVelocityChart dateRange={dateRange} />
        <StatusDistributionDonut />
      </div>

      <PriorityBreakdownChart />

      {/* Export Modal */}
      <ExportReportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        dateRange={dateRange}
      />
    </div>
  );
}
