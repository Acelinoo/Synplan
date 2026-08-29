import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { createNotification } from "@/lib/notificationService";
import { Role } from "@prisma/client";

// GET /api/team/members - Workspace squad members with dynamic workload metrics
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");

    // Verify workspace authorization
    const { auth, errorResponse } = await requireAuthGuard(req, Role.VIEWER, workspaceId || undefined);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const targetWorkspaceId = auth.workspaceId;

    // Execute member list query and task breakdown groupBy in parallel (2 queries total vs 3N+1)
    const [members, taskStatusGroups] = await Promise.all([
      prisma.workspaceMember.findMany({
        where: { workspaceId: targetWorkspaceId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
              role: true,
              createdAt: true,
            },
          },
        },
        orderBy: { joinedAt: "asc" },
      }),
      prisma.task.groupBy({
        by: ["assigneeId", "status"],
        where: { workspaceId: targetWorkspaceId, assigneeId: { not: null } },
        _count: { _all: true },
      }),
    ]);

    // Build fast in-memory map of assignee stats
    const assigneeStatsMap = new Map<string, { totalAssigned: number; activeTasks: number; completedTasks: number }>();
    for (const g of taskStatusGroups) {
      if (!g.assigneeId) continue;
      const curr = assigneeStatsMap.get(g.assigneeId) || { totalAssigned: 0, activeTasks: 0, completedTasks: 0 };
      const count = g._count._all;
      curr.totalAssigned += count;
      if (g.status === "DONE") {
        curr.completedTasks += count;
      } else if (["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED"].includes(g.status)) {
        curr.activeTasks += count;
      }
      assigneeStatsMap.set(g.assigneeId, curr);
    }

    // Compute workload capacity in-memory (0ms)
    const squadWithWorkload = members.map((m) => {
      const stats = assigneeStatsMap.get(m.userId) || { totalAssigned: 0, activeTasks: 0, completedTasks: 0 };
      const activeTasks = stats.activeTasks;
      const totalAssigned = stats.totalAssigned;
      const completedTasks = stats.completedTasks;

      // Dynamic workload calculation (5 active tasks = 100% capacity)
      const computedScore = Math.min(Math.round((activeTasks / 5) * 100), 100);
      const effectiveScore = activeTasks > 0 ? computedScore : m.workloadScore;

      let capacityStatus: "OPTIMAL" | "HIGH" | "OVERLOADED" = "OPTIMAL";
      if (effectiveScore > 85) {
        capacityStatus = "OVERLOADED";
      } else if (effectiveScore > 65) {
        capacityStatus = "HIGH";
      }

      return {
        id: m.id,
        workspaceId: m.workspaceId,
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
        workloadScore: effectiveScore,
        capacityStatus,
        activeTaskCount: activeTasks,
        totalAssignedCount: totalAssigned,
        completedTaskCount: completedTasks,
        joinedAt: m.joinedAt.toISOString(),
      };
    });

    return NextResponse.json({
      success: true,
      data: squadWithWorkload,
      meta: {
        totalMembers: squadWithWorkload.length,
        optimalCount: squadWithWorkload.filter((m) => m.capacityStatus === "OPTIMAL").length,
        highCount: squadWithWorkload.filter((m) => m.capacityStatus === "HIGH").length,
        overloadedCount: squadWithWorkload.filter((m) => m.capacityStatus === "OVERLOADED").length,
      },
    });
  } catch (error: any) {
    console.error("GET /api/team/members error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to retrieve members", message: error?.message },
      { status: 500 }
    );
  }
}

// POST /api/team/members - Invite a new squad member (Requires ADMIN or OWNER)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workspaceId, name, email, role } = body;

    const { auth, errorResponse } = await requireAuthGuard(req, Role.ADMIN, workspaceId || undefined);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!email || !name) {
      return NextResponse.json(
        { success: false, error: "Name and email are required" },
        { status: 400 }
      );
    }

    const targetWorkspaceId = auth.workspaceId;

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          role: role || Role.MEMBER,
        },
      });
    }

    // Check if already in workspace
    const existingMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: targetWorkspaceId,
          userId: user.id,
        },
      },
    });

    if (existingMember) {
      return NextResponse.json(
        { success: false, error: "User is already a member of this workspace" },
        { status: 409 }
      );
    }

    const newMember = await prisma.workspaceMember.create({
      data: {
        workspaceId: targetWorkspaceId,
        userId: user.id,
        role: role || Role.MEMBER,
        workloadScore: 0,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    // Record Activity
    await prisma.auditLog.create({
      data: {
        workspaceId: targetWorkspaceId,
        actorId: auth.user.id,
        action: `Invited "${user.name}" to workspace squad as ${role || "MEMBER"}`,
        target: user.name,
        entityType: "WorkspaceMember",
        entityId: newMember.id,
      },
    });

    // Dispatch direct notification to the new member
    if (user.id !== auth.userId) {
      createNotification({
        workspaceId: targetWorkspaceId,
        userId: user.id,
        type: "TEAM_MEMBER_ADDED",
        title: "Added to Team Squad",
        description: `You were added as a team squad member in this workspace as ${role || "MEMBER"}`,
        entityType: "TEAM",
        entityId: newMember.id,
        link: `/team`,
      }).catch(() => {});
    }

    return NextResponse.json(
      {
        success: true,
        data: newMember,
        message: `Member ${user.name} invited successfully`,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/team/members error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to invite team member",
        message: error?.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}

// PUT /api/team/members - Update squad member role (Requires ADMIN/OWNER)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { memberId, role } = body;

    if (!memberId || !role) {
      return NextResponse.json(
        { success: false, error: "memberId and role are required" },
        { status: 400 }
      );
    }

    const normalizedRole = role.toUpperCase() as Role;
    if (![Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER].includes(normalizedRole)) {
      return NextResponse.json(
        { success: false, error: "Invalid role specified" },
        { status: 400 }
      );
    }

    // Fetch target member to know their workspace
    const target = await prisma.workspaceMember.findUnique({ where: { id: memberId } });
    if (!target) {
      return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
    }

    // Verify caller is ADMIN or OWNER in this workspace
    const { auth, errorResponse } = await requireAuthGuard(req, Role.ADMIN, target.workspaceId);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // Only OWNER can modify another OWNER
    if (target.role === Role.OWNER && auth.role !== Role.OWNER) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Only workspace Owner can modify Owner role" },
        { status: 403 }
      );
    }

    const updated = await prisma.workspaceMember.update({
      where: { id: memberId },
      data: { role: normalizedRole },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return NextResponse.json({ success: true, data: updated, message: "Member role updated" });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update member role" },
      { status: 500 }
    );
  }
}

// DELETE /api/team/members - Remove squad member (Requires ADMIN/OWNER)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let memberId = searchParams.get("memberId") || searchParams.get("id");

    if (!memberId) {
      try {
        const body = await req.json();
        memberId = body.memberId || body.id;
      } catch (e) {
        // query param used
      }
    }

    if (!memberId) {
      return NextResponse.json(
        { success: false, error: "memberId is required" },
        { status: 400 }
      );
    }

    // Check if target exists
    const target = await prisma.workspaceMember.findUnique({ where: { id: memberId } });
    if (!target) {
      return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
    }

    // Verify caller is ADMIN or OWNER in this workspace
    const { auth, errorResponse } = await requireAuthGuard(req, Role.ADMIN, target.workspaceId);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (target.role === Role.OWNER) {
      return NextResponse.json(
        { success: false, error: "Cannot remove workspace Owner." },
        { status: 403 }
      );
    }

    await prisma.workspaceMember.delete({ where: { id: memberId } });
    return NextResponse.json({ success: true, message: "Member removed from workspace" });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to remove member" },
      { status: 500 }
    );
  }
}
