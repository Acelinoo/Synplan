import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");
    const projectId = searchParams.get("projectId");
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    // Resolve workspace
    let targetWorkspaceId: string | undefined = workspaceId || undefined;
    if (!targetWorkspaceId) {
      const firstWs = await prisma.workspace.findFirst({ select: { id: true } });
      targetWorkspaceId = firstWs?.id;
    }

    if (!targetWorkspaceId) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Date range boundaries
    const start = startDateParam ? new Date(startDateParam) : new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
    const end = endDateParam ? new Date(endDateParam) : new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0);

    // 1. Parallel query for tasks with due dates and project milestones
    const taskWhere: any = {
      workspaceId: targetWorkspaceId,
      dueDate: {
        gte: start,
        lte: end,
      },
    };
    if (projectId) taskWhere.projectId = projectId;

    const projectWhere: any = {
      workspaceId: targetWorkspaceId,
      deadline: {
        gte: start,
        lte: end,
      },
    };
    if (projectId) projectWhere.id = projectId;

    const [tasks, projects] = await Promise.all([
      prisma.task.findMany({
        where: taskWhere,
        include: {
          project: { select: { id: true, name: true, color: true } },
          assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
        orderBy: { dueDate: "asc" },
      }),
      prisma.project.findMany({
        where: projectWhere,
        select: { id: true, name: true, deadline: true, color: true, progress: true, status: true },
      }),
    ]);

    // Normalize events
    const taskEvents = tasks.map((t) => ({
      id: t.id,
      type: "task" as const,
      title: t.title,
      date: t.dueDate ? t.dueDate.toISOString().split("T")[0] : "",
      fullDate: t.dueDate ? t.dueDate.toISOString() : "",
      status: t.status,
      priority: t.priority,
      color: t.project?.color || "#6366F1",
      project: t.project,
      assignee: t.assignee,
    }));

    const projectMilestones = projects.map((p) => ({
      id: `milestone-${p.id}`,
      type: "milestone" as const,
      title: `🏁 ${p.name} Milestone Deadline`,
      date: p.deadline ? p.deadline.toISOString().split("T")[0] : "",
      fullDate: p.deadline ? p.deadline.toISOString() : "",
      status: p.status,
      progress: p.progress,
      color: p.color || "#10B981",
      project: { id: p.id, name: p.name, color: p.color },
    }));

    const allEvents = [...taskEvents, ...projectMilestones].sort(
      (a, b) => new Date(a.fullDate).getTime() - new Date(b.fullDate).getTime()
    );

    return NextResponse.json({
      success: true,
      data: allEvents,
      meta: {
        total: allEvents.length,
        taskCount: taskEvents.length,
        milestoneCount: projectMilestones.length,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
    });
  } catch (error: any) {
    console.error("GET /api/calendar/events error:", error?.message);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to fetch calendar events", data: [] },
      { status: 500 }
    );
  }
}
