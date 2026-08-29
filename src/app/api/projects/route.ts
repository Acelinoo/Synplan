import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { ProjectStatus, Role } from "@prisma/client";

// GET /api/projects - Retrieve projects list for authorized workspace
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");
    const statusParam = searchParams.get("status")?.toUpperCase();

    // Verify workspace membership & authorization
    const { auth, errorResponse } = await requireAuthGuard(req, Role.VIEWER, workspaceId || undefined);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const whereClause: any = { workspaceId: auth.workspaceId };
    if (statusParam && Object.values(ProjectStatus).includes(statusParam as ProjectStatus)) {
      whereClause.status = statusParam as ProjectStatus;
    }

    const [projects, doneTaskGroups] = await Promise.all([
      prisma.project.findMany({
        where: whereClause,
        include: {
          members: {
            include: {
              user: { select: { id: true, name: true, email: true, role: true } },
            },
          },
          _count: {
            select: { tasks: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.task.groupBy({
        by: ["projectId"],
        where: { workspaceId: auth.workspaceId, status: "DONE" },
        _count: { _all: true },
      }),
    ]);

    const doneCountMap = new Map<string, number>();
    for (const g of doneTaskGroups) {
      doneCountMap.set(g.projectId, g._count._all);
    }

    // Calculate dynamic progress in-memory (0ms)
    const projectsWithProgress = projects.map((p) => {
      const total = p._count.tasks;
      const completed = doneCountMap.get(p.id) || 0;
      const computedProgress = total > 0 ? Math.round((completed / total) * 100) : 0;

      return {
        ...p,
        totalTasks: total,
        completedTasks: completed,
        progress: computedProgress,
      };
    });

    return NextResponse.json({
      success: true,
      data: projectsWithProgress,
    });
  } catch (error: any) {
    console.error("GET /api/projects error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to retrieve projects", message: error?.message },
      { status: 500 }
    );
  }
}

// POST /api/projects - Create a new project in authorized workspace
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workspaceId, name, description, color, deadline, memberIds, status } = body;

    const { auth, errorResponse } = await requireAuthGuard(req, Role.MEMBER, workspaceId || undefined);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Project name is required" },
        { status: 400 }
      );
    }

    const targetWorkspaceId = auth.workspaceId;

    // Filter only valid user IDs who belong to the same workspace
    let validMemberIds: string[] = [];
    if (Array.isArray(memberIds) && memberIds.length > 0) {
      const workspaceMembers = await prisma.workspaceMember.findMany({
        where: {
          workspaceId: targetWorkspaceId,
          userId: { in: memberIds },
        },
        select: { userId: true },
      });
      validMemberIds = workspaceMembers.map((m) => m.userId);
    }

    const project = await prisma.project.create({
      data: {
        workspaceId: targetWorkspaceId,
        name: name.trim(),
        description: description ? description.trim() : null,
        color: color || "#6366F1",
        deadline: deadline ? new Date(deadline) : null,
        status: status || ProjectStatus.ACTIVE,
        progress: 0,
        totalTasks: 0,
        completedTasks: 0,
        members: {
          create: validMemberIds.map((uId: string) => ({ userId: uId, role: "MEMBER" })),
        },
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    // Record audit log
    try {
      await prisma.auditLog.create({
        data: {
          workspaceId: targetWorkspaceId,
          actorId: auth.userId,
          action: "PROJECT_CREATE",
          target: `Project "${project.name}" created`,
        },
      });
    } catch (auditErr) {
      console.warn("Audit log creation skipped:", auditErr);
    }

    return NextResponse.json(
      {
        success: true,
        data: project,
        message: `Project "${project.name}" created successfully`,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/projects error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create project",
        message: error?.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}
