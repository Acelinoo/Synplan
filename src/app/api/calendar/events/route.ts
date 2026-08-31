import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { applyRateLimit, apiRateLimiter } from "@/lib/rateLimit";
import { createApiErrorResponse } from "@/lib/apiErrors";

export async function GET(req: NextRequest) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");
    const projectId = searchParams.get("projectId");
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    // Strict Permission Guard: workspace.view
    const { auth, errorResponse } = await requireAuthGuard(req, "workspace.view", workspaceId || undefined);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const targetWorkspaceId = auth.workspaceId;

    // Verify projectId belongs to authorized workspace if provided (IDOR check)
    if (projectId) {
      const proj = await prisma.project.findUnique({
        where: { id: projectId },
        select: { workspaceId: true },
      });
      if (!proj || proj.workspaceId !== targetWorkspaceId) {
        return NextResponse.json(
          { success: false, error: "Not Found", message: "Project not found in this workspace" },
          { status: 404 }
        );
      }
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
      color: t.project?.color || "#0284C7",
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
    }, { headers: rateLimit.rateLimitHeaders });
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to fetch calendar events");
  }
}
