import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { createNotification } from "@/lib/notificationService";
import { canModifyRole, canRemoveMember } from "@/lib/permissions";
import { Role } from "@prisma/client";

// GET /api/team/members - Workspace squad members with dynamic workload metrics
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");

    // Strict Permission Guard: members.view
    const { auth, errorResponse } = await requireAuthGuard(req, "members.view", workspaceId || undefined);
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

// POST /api/team/members - Invite a new squad member
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workspaceId, name, email, role } = body;

    // Strict Permission Guard: members.invite
    const { auth, errorResponse } = await requireAuthGuard(req, "members.invite", workspaceId || undefined);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!email || !name) {
      return NextResponse.json(
        { success: false, error: "Name and email are required" },
        { status: 400 }
      );
    }

    const normalizedRole = (role ? role.toUpperCase() : Role.MEMBER) as Role;
    if (![Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER].includes(normalizedRole)) {
      return NextResponse.json(
        { success: false, error: "Invalid role specified" },
        { status: 400 }
      );
    }

    // Role Hierarchy & Privilege Escalation Check:
    // Admin cannot invite a member with role OWNER or ADMIN
    const modCheck = canModifyRole(auth.role, Role.VIEWER, normalizedRole);
    if (!modCheck.allowed) {
      return NextResponse.json(
        { success: false, error: modCheck.reason || "Forbidden: Insufficient privileges to assign this role." },
        { status: 403 }
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
          role: normalizedRole,
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
        role: normalizedRole,
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
        action: `Invited "${user.name}" to workspace squad as ${normalizedRole}`,
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
        description: `You were added as a team squad member in this workspace as ${normalizedRole}`,
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

// PUT /api/team/members - Update squad member role
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

    // 1. Resolve target member to verify resource exists
    const target = await prisma.workspaceMember.findUnique({ where: { id: memberId } });
    if (!target) {
      return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
    }

    // 2. Strict Permission Guard: members.update_role on target's actual workspace
    const { auth, errorResponse } = await requireAuthGuard(req, "members.update_role", target.workspaceId);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // 3. Prevent owner self-demotion directly (Owner must transfer ownership)
    if (target.userId === auth.userId && target.role === Role.OWNER && normalizedRole !== Role.OWNER) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Workspace Owner cannot demote themselves. Transfer ownership first." },
        { status: 403 }
      );
    }

    // 4. Role Hierarchy & Privilege Boundary Check
    const roleCheck = canModifyRole(auth.role, target.role, normalizedRole);
    if (!roleCheck.allowed) {
      return NextResponse.json(
        { success: false, error: roleCheck.reason || "Forbidden: Cannot perform this role modification." },
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

// DELETE /api/team/members - Remove squad member
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

    // 1. Resolve target member
    const target = await prisma.workspaceMember.findUnique({ where: { id: memberId } });
    if (!target) {
      return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
    }

    // 2. Strict Permission Guard: members.remove on target's actual workspace
    const { auth, errorResponse } = await requireAuthGuard(req, "members.remove", target.workspaceId);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // 3. Removal Boundary Verification
    const removeCheck = canRemoveMember(auth.role, target.role);
    if (!removeCheck.allowed) {
      return NextResponse.json(
        { success: false, error: removeCheck.reason || "Forbidden: Cannot remove this member." },
        { status: 403 }
      );
    }

    // 4. Delete member from workspace
    await prisma.workspaceMember.delete({ where: { id: memberId } });
    return NextResponse.json({ success: true, message: "Member removed from workspace" });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to remove member" },
      { status: 500 }
    );
  }
}
