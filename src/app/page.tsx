import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { KpiSummaryGrid } from "@/components/dashboard/KpiSummaryGrid";
import { ProjectProgressList } from "@/components/dashboard/ProjectProgressList";
import { UpcomingDeadlinesWidget } from "@/components/dashboard/UpcomingDeadlinesWidget";
import { RecentActivityFeed } from "@/components/dashboard/RecentActivityFeed";

export default function HomePage() {
  return (
    <div className="relative flex flex-col gap-6">
      {/* Header & Quick Action Launcher */}
      <DashboardHeader />

      {/* 4 KPI Metric Cards */}
      <KpiSummaryGrid />

      {/* Middle Row: Recent Projects (Left) & Due Date (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ProjectProgressList />
        <UpcomingDeadlinesWidget />
      </div>

      {/* Bottom Row: Recent Workspace Activity (Full Width) */}
      <RecentActivityFeed />
    </div>
  );
}
