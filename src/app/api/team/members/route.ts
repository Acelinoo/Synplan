import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { createNotification } from "@/lib/notificationService";
import { canModifyRole, canRemoveMember } from "@/lib/permissions";
import { Role } from "@prisma/client";
import { applyRateLimit, apiRateLimiter } from "@/lib/rateLimit";
import { validateRequestBody } from "@/lib/validation/apiValidator";
import { InviteMemberSchema, UpdateMemberRoleSchema } from "@/lib/validation/schemas";
import { createApiErrorResponse } from "@/lib/apiErrors";
import { parsePaginationParams } from "@/lib/pagination";
import { publishWorkspaceEvent } from "@/lib/realtimeServer";
import { idempotency } from "@/lib/idempotency";
import { createAuditEntry } from "@/lib/audit";

// GET /api/team/members - Workspace squad members with dynamic workload metrics
export async function GET(req: NextRequest) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");
    const roleParam = searchParams.get("role")?.toUpperCase();
    const search = searchParams.get("search")?.trim();

    const pagination = parsePaginationParams(req, { defaultLimit: 50, maxLimit: 100 });

    // Strict Permission Guard: members.view
    const { auth, errorResponse } = await requireAuthGuard(req, "members.view", workspaceId || undefined);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const targetWorkspaceId = auth.workspaceId;

    const whereClause: any = { workspaceId: targetWorkspaceId };
    if (roleParam && Object.values(Role).includes(roleParam as Role)) {
      whereClause.role = roleParam as Role;
    }

    if (search) {
      whereClause.user = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    const total = await prisma.workspaceMember.count({ where: whereClause });

    const queryOptions: any = {
      where: whereClause,
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
      take: pagination.limit,
    };

    if (pagination.cursor) {
      queryOptions.skip = 1;
      queryOptions.cursor = { id: pagination.cursor };
    } else {
      queryOptions.skip = pagination.skip;
    }

    // Execute member list query and task breakdown groupBy in parallel
    const [members, taskStatusGroups] = await Promise.all([
      prisma.workspaceMember.findMany(queryOptions),
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
    const squadWithWorkload = members.map((m: any) => {
      const stats = assigneeStatsMap.get(m.userId) || { totalAssigned: 0, activeTasks: 0, completedTasks: 0 };
      const activeTasks = stats.activeTasks;
      const totalAssigned = stats.totalAssigned;
      const completedTasks = stats.completedTasks;

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

    const totalPages = Math.ceil(total / pagination.limit) || 1;
    const hasMore = pagination.page < totalPages || (squadWithWorkload.length === pagination.limit && squadWithWorkload.length > 0);
    const nextCursor = hasMore && squadWithWorkload.length > 0 ? squadWithWorkload[squadWithWorkload.length - 1].id : null;

    return NextResponse.json({
      success: true,
      data: squadWithWorkload,
      pagination: {
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages,
        hasMore,
        nextCursor,
      },
      meta: {
        totalMembers: total,
        optimalCount: squadWithWorkload.filter((m) => m.capacityStatus === "OPTIMAL").length,
        highCount: squadWithWorkload.filter((m) => m.capacityStatus === "HIGH").length,
        overloadedCount: squadWithWorkload.filter((m) => m.capacityStatus === "OVERLOADED").length,
      },
    }, { headers: rateLimit.rateLimitHeaders });
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to retrieve members");
  }
}

// POST /api/team/members - Invite a new squad member with idempotency protection
export async function POST(req: NextRequest) {
  const idempotencyKey = idempotency.extractKey(req);
  let authContext: any = null;

  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const validation = await validateRequestBody(req, InviteMemberSchema);
    if (validation.errorResponse) return validation.errorResponse;

    const { workspaceId, name, email, role } = validation.data;

    // Strict Permission Guard: members.invite
    const { auth, errorResponse } = await requireAuthGuard(req, "members.invite", workspaceId || undefined);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    authContext = auth;

    const targetWorkspaceId = auth.workspaceId;

    // Check Idempotency Key if provided
    if (idempotencyKey) {
      const { cachedResponse, isInFlight } = idempotency.check(idempotencyKey, targetWorkspaceId, auth.userId);
      if (cachedResponse) return cachedResponse;
      if (isInFlight) {
        return NextResponse.json(
          { success: false, error: "Conflict", message: "A member invitation is already in flight for this key" },
          { status: 409 }
        );
      }
      idempotency.start(idempotencyKey, targetWorkspaceId, auth.userId);
    }

    const normalizedRole = (role as Role) || Role.MEMBER;

    // Role Hierarchy & Privilege Escalation Check:
    const modCheck = canModifyRole(auth.role, Role.VIEWER, normalizedRole);
    if (!modCheck.allowed) {
      if (idempotencyKey) idempotency.release(idempotencyKey, targetWorkspaceId, auth.userId);
      return NextResponse.json(
        { success: false, error: "Forbidden", message: modCheck.reason || "Forbidden: Insufficient privileges to assign this role." },
        { status: 403 }
      );
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          name,
          email,
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
      if (idempotencyKey) idempotency.release(idempotencyKey, targetWorkspaceId, auth.userId);
      return NextResponse.json(
        { success: false, error: "Conflict", message: "User is already a member of this workspace" },
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

    // Publish server-authoritative realtime event
    await publishWorkspaceEvent(auth, "MEMBER_INVITED", newMember as any);

    // Record Activity with IP
    await createAuditEntry({
      workspaceId: targetWorkspaceId,
      actorId: auth.user.id,
      actorType: "USER",
      action: "MEMBER_INVITED",
      target: `Invited "${user.name}" as ${normalizedRole}`,
      entityType: "member",
      entityId: newMember.id,
      after: newMember,
      requestId: req.headers.get("x-request-id"),
      source: "WEB",
      ipAddress: auth.ipAddress,
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

    const responseBody = {
      success: true,
      data: newMember,
      message: `Member ${user.name} invited successfully`,
    };

    if (idempotencyKey) {
      idempotency.save(idempotencyKey, 201, responseBody, targetWorkspaceId, auth.userId);
    }

    return NextResponse.json(
      responseBody,
      { status: 201, headers: rateLimit.rateLimitHeaders }
    );
  } catch (error: any) {
    if (idempotencyKey && authContext) {
      idempotency.release(idempotencyKey, authContext.workspaceId, authContext.userId);
    }
    return createApiErrorResponse(error, "Failed to invite team member");
  }
}

// PUT /api/team/members - Update squad member role
export async function PUT(req: NextRequest) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const validation = await validateRequestBody(req, UpdateMemberRoleSchema);
    if (validation.errorResponse) return validation.errorResponse;

    const { memberId, role } = validation.data;
    const normalizedRole = role as Role;

    // 1. Resolve target member to verify resource exists
    const target = await prisma.workspaceMember.findUnique({ where: { id: memberId } });
    if (!target) {
      return NextResponse.json({ success: false, error: "Not Found", message: "Member not found" }, { status: 404 });
    }

    // 2. Strict Permission Guard: members.update_role on target's actual workspace
    const { auth, errorResponse } = await requireAuthGuard(req, "members.update_role", target.workspaceId);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // 3. Prevent owner self-demotion directly (Owner must transfer ownership)
    if (target.userId === auth.userId && target.role === Role.OWNER && normalizedRole !== Role.OWNER) {
      return NextResponse.json(
        { success: false, error: "Forbidden", message: "Forbidden: Workspace Owner cannot demote themselves. Transfer ownership first." },
        { status: 403 }
      );
    }

    // 4. Role Hierarchy & Privilege Boundary Check
    const roleCheck = canModifyRole(auth.role, target.role, normalizedRole);
    if (!roleCheck.allowed) {
      return NextResponse.json(
        { success: false, error: "Forbidden", message: roleCheck.reason || "Forbidden: Cannot perform this role modification." },
        { status: 403 }
      );
    }

    const updated = await prisma.workspaceMember.update({
      where: { id: memberId },
      data: { role: normalizedRole },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    // Publish server-authoritative realtime event
    await publishWorkspaceEvent(auth, "MEMBER_ROLE_UPDATED", {
      id: memberId,
      userId: target.userId,
      role: normalizedRole,
      newRole: normalizedRole,
    } as any);

    // Record Activity with IP
    await createAuditEntry({
      workspaceId: target.workspaceId,
      actorId: auth.user.id,
      actorType: "USER",
      action: "MEMBER_ROLE_UPDATED",
      target: `Updated role of member to ${normalizedRole}`,
      entityType: "member",
      entityId: memberId,
      before: target,
      after: updated,
      requestId: req.headers.get("x-request-id"),
      source: "WEB",
      ipAddress: auth.ipAddress,
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: "Member role updated successfully",
    }, { headers: rateLimit.rateLimitHeaders });
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to update member role");
  }
}

// DELETE /api/team/members - Remove squad member atomically (cleans up task assignments & project memberships)
export async function DELETE(req: NextRequest) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

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

    if (!memberId || typeof memberId !== "string") {
      return NextResponse.json(
        { success: false, error: "Bad Request", message: "memberId is required" },
        { status: 400 }
      );
    }

    // 1. Resolve target member
    const target = await prisma.workspaceMember.findUnique({ where: { id: memberId } });
    if (!target) {
      return NextResponse.json({ success: false, error: "Not Found", message: "Member not found" }, { status: 404 });
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
        { success: false, error: "Forbidden", message: removeCheck.reason || "Forbidden: Cannot remove this member." },
        { status: 403 }
      );
    }

    // 4. Atomic Transaction: unassign tasks in this workspace, remove project memberships in this workspace, and delete workspace member
    await prisma.$transaction([
      prisma.task.updateMany({
        where: {
          workspaceId: target.workspaceId,
          assigneeId: target.userId,
        },
        data: { assigneeId: null },
      }),
      prisma.projectMember.deleteMany({
        where: {
          userId: target.userId,
          project: { workspaceId: target.workspaceId },
        },
      }),
      prisma.workspaceMember.delete({ where: { id: memberId } }),
    ]);

    // Publish server-authoritative realtime event
    await publishWorkspaceEvent(auth, "MEMBER_REMOVED", {
      id: memberId,
      userId: target.userId,
    });

    // Record Activity with IP
    await createAuditEntry({
      workspaceId: target.workspaceId,
      actorId: auth.user.id,
      actorType: "USER",
      action: "MEMBER_REMOVED",
      target: `Removed member from workspace`,
      entityType: "member",
      entityId: memberId,
      before: target,
      requestId: req.headers.get("x-request-id"),
      source: "WEB",
      ipAddress: auth.ipAddress,
    });

    return NextResponse.json({
      success: true,
      message: "Member removed from workspace successfully",
    }, { headers: rateLimit.rateLimitHeaders });
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to remove member");
  }
}
