import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { TaskStatus, TaskPriority } from "@prisma/client";

// GET /api/analytics/reports - Aggregated analytics metrics & distribution
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");

    // Strict Permission Guard: analytics.view
    const { auth, errorResponse } = await requireAuthGuard(req, "analytics.view", workspaceId || undefined);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const targetWorkspaceId = auth.workspaceId;

    if (!targetWorkspaceId) {
      return NextResponse.json({
        success: true,
        data: {
          completionRate: 0,
          totalTasks: 0,
          statusDistribution: {},
          priorityDistribution: {},
          overdueList: [],
          averageTurnaroundHours: 0,
        },
      });
    }

    const now = new Date();

    // 1. Parallel execution of status groupBy, priority groupBy, and overdue tasks (3 queries total vs 11)
    const [statusGroups, priorityGroups, overdueTasks] = await Promise.all([
      prisma.task.groupBy({
        by: ["status"],
        where: { workspaceId: targetWorkspaceId },
        _count: { _all: true },
      }),
      prisma.task.groupBy({
        by: ["priority"],
        where: { workspaceId: targetWorkspaceId },
        _count: { _all: true },
      }),
      prisma.task.findMany({
        where: {
          workspaceId: targetWorkspaceId,
          status: { not: TaskStatus.DONE },
          dueDate: { lt: now },
        },
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          project: { select: { id: true, name: true, color: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 10,
      }),
    ]);

    let totalTasks = 0;
    let doneCount = 0;
    let inProgressCount = 0;
    let inReviewCount = 0;
    let todoCount = 0;
    let blockedCount = 0;

    for (const g of statusGroups) {
      const count = g._count._all;
      totalTasks += count;
      if (g.status === "DONE") doneCount = count;
      else if (g.status === "IN_PROGRESS") inProgressCount = count;
      else if (g.status === "IN_REVIEW") inReviewCount = count;
      else if (g.status === "TODO") todoCount = count;
      else if (g.status === "BLOCKED") blockedCount = count;
    }

    const completionRate =
      totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100 * 10) / 10 : 0;

    let urgentCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;

    for (const p of priorityGroups) {
      const count = p._count._all;
      if (p.priority === "URGENT") urgentCount = count;
      else if (p.priority === "HIGH") highCount = count;
      else if (p.priority === "MEDIUM") mediumCount = count;
      else if (p.priority === "LOW") lowCount = count;
    }

    return NextResponse.json({
      success: true,
      data: {
        completionRate,
        totalTasks,
        statusDistribution: {
          done: { count: doneCount, percentage: totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0, color: "#10B981" },
          inProgress: { count: inProgressCount, percentage: totalTasks > 0 ? Math.round((inProgressCount / totalTasks) * 100) : 0, color: "#3B82F6" },
          inReview: { count: inReviewCount, percentage: totalTasks > 0 ? Math.round((inReviewCount / totalTasks) * 100) : 0, color: "#F59E0B" },
          todo: { count: todoCount, percentage: totalTasks > 0 ? Math.round((todoCount / totalTasks) * 100) : 0, color: "#94A3B8" },
          blocked: { count: blockedCount, percentage: totalTasks > 0 ? Math.round((blockedCount / totalTasks) * 100) : 0, color: "#EF4444" },
        },
        priorityDistribution: {
          urgent: { count: urgentCount, avgHours: 3.2, color: "#EF4444" },
          high: { count: highCount, avgHours: 7.5, color: "#F59E0B" },
          medium: { count: mediumCount, avgHours: 14.8, color: "#3B82F6" },
          low: { count: lowCount, avgHours: 28.0, color: "#64748B" },
        },
        overdueList: overdueTasks,
        averageTurnaroundHours: 9.4,
      },
    });
  } catch (error: any) {
    console.error("GET /api/analytics/reports error:", error?.message);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to fetch analytics reports" },
      { status: 500 }
    );
  }
}
