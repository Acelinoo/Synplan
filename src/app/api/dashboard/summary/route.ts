import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // Resolve workspace
    let targetWorkspaceId: string | undefined = searchParams.get("workspaceId") || undefined;
    if (!targetWorkspaceId) {
      const firstWs = await prisma.workspace.findFirst({ select: { id: true } });
      targetWorkspaceId = firstWs?.id;
    }

    if (!targetWorkspaceId) {
      return NextResponse.json({
        success: true,
        data: {
          totalProjects: 0,
          activeProjects: 0,
          completedProjects: 0,
          totalTasks: 0,
          activeTasks: 0,
          completedTasks: 0,
          overdueTasks: 0,
          inProgressTasks: 0,
          inReviewTasks: 0,
          blockedTasks: 0,
          velocityRate: 0,
          recentActivities: [],
        },
      });
    }

    const now = new Date();

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // 1. Parallel execution for high performance
    const [
      totalProjects,
      activeProjects,
      completedProjects,
      taskGroups,
      overdueTasks,
      tasksDueCount,
      completedThisWeek,
      teamMembersCount,
      auditLogs,
    ] = await Promise.all([
      prisma.project.count({ where: { workspaceId: targetWorkspaceId } }),
      prisma.project.count({ where: { workspaceId: targetWorkspaceId, status: "ACTIVE" } }),
      prisma.project.count({ where: { workspaceId: targetWorkspaceId, status: "COMPLETED" } }),
      prisma.task.groupBy({
        by: ["status"],
        where: { workspaceId: targetWorkspaceId },
        _count: { _all: true },
      }),
      prisma.task.count({
        where: {
          workspaceId: targetWorkspaceId,
          status: { not: "DONE" },
          dueDate: { lt: now },
        },
      }),
      prisma.task.count({
        where: {
          workspaceId: targetWorkspaceId,
          status: { not: "DONE" },
          dueDate: { not: null },
        },
      }),
      prisma.task.count({
        where: {
          workspaceId: targetWorkspaceId,
          status: "DONE",
          OR: [
            { completedAt: { gte: sevenDaysAgo } },
            { updatedAt: { gte: sevenDaysAgo } },
          ],
        },
      }),
      prisma.workspaceMember.count({
        where: { workspaceId: targetWorkspaceId },
      }),
      prisma.auditLog.findMany({
        where: { workspaceId: targetWorkspaceId },
        orderBy: { timestamp: "desc" },
        take: 20,
      }),
    ]);

    // Map task counts from groupBy
    let totalTasks = 0;
    let doneTasks = 0;
    let inProgressTasks = 0;
    let inReviewTasks = 0;
    let blockedTasks = 0;

    for (const group of taskGroups) {
      const count = group._count._all;
      totalTasks += count;
      if (group.status === "DONE") doneTasks = count;
      else if (group.status === "IN_PROGRESS") inProgressTasks = count;
      else if (group.status === "IN_REVIEW") inReviewTasks = count;
      else if (group.status === "BLOCKED") blockedTasks = count;
    }

    const activeTasks = inProgressTasks + inReviewTasks;
    const velocityRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100 * 10) / 10 : 0;

    // Resolve actor names for audit logs
    const actorIds = Array.from(new Set(auditLogs.map((l) => l.actorId).filter(Boolean)));
    const users = actorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true },
        })
      : [];

    const userMap = new Map<string, string>();
    for (const u of users) {
      userMap.set(u.id, u.name || u.email.split("@")[0]);
    }

    const recentActivities = auditLogs.map((log) => {
      let actorName = "System";
      if (log.actorId) {
        actorName = userMap.get(log.actorId) || (log.actorId === "system" ? "System" : "Squad Member");
      }

      // Format relative time
      const diffMs = now.getTime() - new Date(log.timestamp).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      let friendlyTime = "Just now";
      if (diffMins > 0 && diffMins < 60) friendlyTime = `${diffMins}m ago`;
      else if (diffHours >= 1 && diffHours < 24) friendlyTime = `${diffHours}h ago`;
      else if (diffDays >= 1) friendlyTime = `${diffDays}d ago`;

      return {
        id: log.id,
        actor: actorName,
        action: log.action,
        title: log.target,
        entityType: log.entityType,
        entityId: log.entityId,
        timestamp: friendlyTime,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        totalProjects,
        activeProjects,
        completedProjects,
        totalTasks,
        activeTasks,
        completedTasks: doneTasks,
        inProgressTasks,
        inReviewTasks,
        blockedTasks,
        overdueTasks,
        tasksDueCount,
        completedThisWeek: completedThisWeek || doneTasks,
        teamMembersCount: teamMembersCount || 1,
        velocityRate,
        recentActivities,
      },
    });
  } catch (error: any) {
    console.error("GET /api/dashboard/summary error:", error?.message);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to fetch dashboard summary",
      },
      { status: 500 }
    );
  }
}
