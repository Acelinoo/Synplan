import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { Role } from "@prisma/client";

// GET /api/search?q=...&workspaceId=... - Global scoped search across Projects, Tasks, and Team Members
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q")?.trim();
    const workspaceId = searchParams.get("workspaceId");

    // Strict Permission Guard: search.view
    const { auth, errorResponse } = await requireAuthGuard(req, "search.view", workspaceId || undefined);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!query) {
      return NextResponse.json({
        success: true,
        data: { projects: [], tasks: [], members: [] },
      });
    }

    const targetWorkspaceId = auth.workspaceId;

    const [projects, tasks, members] = await Promise.all([
      // 1. Projects
      prisma.project.findMany({
        where: {
          workspaceId: targetWorkspaceId,
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          name: true,
          description: true,
          color: true,
          status: true,
          progress: true,
        },
        take: 5,
      }),

      // 2. Tasks
      prisma.task.findMany({
        where: {
          workspaceId: targetWorkspaceId,
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
          ],
        },
        include: {
          project: { select: { id: true, name: true, color: true } },
          phase: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true } },
        },
        take: 8,
      }),

      // 3. Squad Members
      prisma.workspaceMember.findMany({
        where: {
          workspaceId: targetWorkspaceId,
          user: {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
            ],
          },
        },
        include: {
          user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } },
        },
        take: 5,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          color: p.color,
          status: p.status,
          progress: p.progress,
        })),
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status.toLowerCase(),
          priority: t.priority.toLowerCase(),
          projectId: t.projectId,
          projectName: t.project.name,
          projectColor: t.project.color,
          phaseName: t.phase?.name,
          assigneeName: t.assignee?.name,
          dueDate: t.dueDate ? t.dueDate.toISOString().split("T")[0] : null,
        })),
        members: members.map((m) => ({
          id: m.userId,
          name: m.user.name,
          email: m.user.email,
          role: m.role.toLowerCase(),
        })),
      },
    });
  } catch (error: any) {
    console.error("GET /api/search error:", error);
    return NextResponse.json(
      { success: false, error: "Search failed", message: error?.message },
      { status: 500 }
    );
  }
}
