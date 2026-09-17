import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { ProjectRole } from "@prisma/client";
import { applyRateLimit, apiRateLimiter } from "@/lib/rateLimit";
import { createApiErrorResponse } from "@/lib/apiErrors";
import { publishWorkspaceEvent } from "@/lib/realtimeServer";
import { createAuditEntry } from "@/lib/audit";
import { createNotification } from "@/lib/notificationService";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/projects/[id]/members - List project members with task telemetry
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { id: projectId } = await params;
    if (!projectId || typeof projectId !== "string") {
      return NextResponse.json(
        { success: false, error: "Bad Request", message: "Invalid project ID" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, workspaceId: true, name: true },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Not Found", message: "Project not found" },
        { status: 404 }
      );
    }

    // Require projects.view permission in this project's workspace
    const { errorResponse } = await requireAuthGuard(req, "projects.view", project.workspaceId);
    if (errorResponse) return errorResponse;

    // Fetch project members with user info
    const members = await prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            role: true,
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    // Compute active tasks count for each member in this project
    const memberUserIds = members.map((m) => m.userId);
    const activeTasks = await prisma.task.groupBy({
      by: ["assigneeId"],
      where: {
        projectId,
        assigneeId: { in: memberUserIds },
        status: { notIn: ["DONE", "CANCELED"] },
      },
      _count: {
        _all: true,
      },
    });

    const activeTaskMap = new Map<string, number>();
    for (const item of activeTasks) {
      if (item.assigneeId) {
        activeTaskMap.set(item.assigneeId, item._count._all);
      }
    }

    const formatted = members.map((m) => ({
      id: m.id,
      projectId: m.projectId,
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt,
      user: m.user,
      activeTaskCount: activeTaskMap.get(m.userId) || 0,
    }));

    return NextResponse.json(
      { success: true, data: formatted },
      { headers: rateLimit.rateLimitHeaders }
    );
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to fetch project members");
  }
}

// POST /api/projects/[id]/members - Add member to project
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { id: projectId } = await params;
    if (!projectId || typeof projectId !== "string") {
      return NextResponse.json(
        { success: false, error: "Bad Request", message: "Invalid project ID" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, workspaceId: true, name: true },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Not Found", message: "Project not found" },
        { status: 404 }
      );
    }

    // Require projects.update permission
    const { auth, errorResponse } = await requireAuthGuard(req, "projects.update", project.workspaceId);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { userId, role = "CONTRIBUTOR" } = body;

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { success: false, error: "Bad Request", message: "userId is required" },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = ["LEAD", "CONTRIBUTOR", "VIEWER"];
    const normalizedRole = (role as string).toUpperCase() as ProjectRole;
    if (!validRoles.includes(normalizedRole)) {
      return NextResponse.json(
        { success: false, error: "Bad Request", message: "Invalid project role. Allowed: LEAD, CONTRIBUTOR, VIEWER" },
        { status: 400 }
      );
    }

    // Cross-workspace validation: Target user MUST belong to the same workspace!
    const targetWorkspaceMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: project.workspaceId,
          userId,
        },
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
    });

    if (!targetWorkspaceMember) {
      return NextResponse.json(
        {
          success: false,
          error: "Bad Request",
          message: "User does not belong to the project workspace. Invite to workspace first.",
        },
        { status: 400 }
      );
    }

    // Check if user is already a member of this project
    const existingProjectMember = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });

    let projectMember;
    if (existingProjectMember) {
      // Update role if already member
      projectMember = await prisma.projectMember.update({
        where: { id: existingProjectMember.id },
        data: { role: normalizedRole },
        include: {
          user: {
            select: { id: true, name: true, email: true, avatarUrl: true, role: true },
          },
        },
      });
    } else {
      // Create new ProjectMember
      projectMember = await prisma.projectMember.create({
        data: {
          projectId,
          userId,
          role: normalizedRole,
        },
        include: {
          user: {
            select: { id: true, name: true, email: true, avatarUrl: true, role: true },
          },
        },
      });
    }

    // Publish server-authoritative realtime event
    await publishWorkspaceEvent(auth, "PROJECT_MEMBER_ADDED", projectMember as any, {
      projectId,
    });

    // Record audit log
    await createAuditEntry({
      workspaceId: project.workspaceId,
      actorId: auth.userId,
      actorType: "USER",
      action: "PROJECT_MEMBER_ADD",
      target: `Added ${targetWorkspaceMember.user.name} (${normalizedRole}) to Project "${project.name}"`,
      entityType: "project_member",
      entityId: projectMember.id,
      after: projectMember,
      requestId: req.headers.get("x-request-id"),
      source: "WEB",
      ipAddress: auth.ipAddress,
    });

    // Dispatch direct notification to added squad member if not self
    if (userId !== auth.userId) {
      await createNotification({
        workspaceId: project.workspaceId,
        userId,
        actorId: auth.userId,
        type: "PROJECT_MEMBER_ADDED",
        title: "Added to Project Squad",
        description: `You were added to project "${project.name}" as ${normalizedRole}`,
        entityType: "PROJECT",
        entityId: project.id,
        link: `/projects/${project.id}`,
      }).catch(() => {});
    }

    return NextResponse.json(
      {
        success: true,
        data: projectMember,
        message: `Successfully added ${targetWorkspaceMember.user.name} to project.`,
      },
      { status: 201, headers: rateLimit.rateLimitHeaders }
    );
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to add member to project");
  }
}

// PATCH /api/projects/[id]/members - Update member role
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { id: projectId } = await params;
    if (!projectId || typeof projectId !== "string") {
      return NextResponse.json(
        { success: false, error: "Bad Request", message: "Invalid project ID" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, workspaceId: true, name: true },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Not Found", message: "Project not found" },
        { status: 404 }
      );
    }

    // Require projects.update permission
    const { auth, errorResponse } = await requireAuthGuard(req, "projects.update", project.workspaceId);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { memberId, userId, role } = body;

    if ((!memberId && !userId) || !role) {
      return NextResponse.json(
        { success: false, error: "Bad Request", message: "memberId or userId, and role are required" },
        { status: 400 }
      );
    }

    const validRoles = ["LEAD", "CONTRIBUTOR", "VIEWER"];
    const normalizedRole = (role as string).toUpperCase() as ProjectRole;
    if (!validRoles.includes(normalizedRole)) {
      return NextResponse.json(
        { success: false, error: "Bad Request", message: "Invalid project role. Allowed: LEAD, CONTRIBUTOR, VIEWER" },
        { status: 400 }
      );
    }

    const existing = await prisma.projectMember.findFirst({
      where: memberId
        ? { id: memberId, projectId }
        : { userId, projectId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Not Found", message: "Project member not found" },
        { status: 404 }
      );
    }

    const updated = await prisma.projectMember.update({
      where: { id: existing.id },
      data: { role: normalizedRole },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } },
      },
    });

    // Publish server-authoritative realtime event
    await publishWorkspaceEvent(auth, "PROJECT_MEMBER_UPDATED", updated as any, {
      projectId,
    });

    // Record audit log
    await createAuditEntry({
      workspaceId: project.workspaceId,
      actorId: auth.userId,
      actorType: "USER",
      action: "PROJECT_MEMBER_UPDATE",
      target: `Updated role of ${existing.user.name} to ${normalizedRole} in Project "${project.name}"`,
      entityType: "project_member",
      entityId: updated.id,
      before: existing,
      after: updated,
      requestId: req.headers.get("x-request-id"),
      source: "WEB",
      ipAddress: auth.ipAddress,
    });

    // Dispatch direct notification to updated squad member if not self
    if (existing.userId !== auth.userId) {
      await createNotification({
        workspaceId: project.workspaceId,
        userId: existing.userId,
        actorId: auth.userId,
        type: "PROJECT_UPDATED",
        title: "Project Role Updated",
        description: `Your role in project "${project.name}" was updated to ${normalizedRole}`,
        entityType: "PROJECT",
        entityId: project.id,
        link: `/projects/${project.id}`,
      }).catch(() => {});
    }

    return NextResponse.json(
      { success: true, data: updated, message: "Member role updated successfully" },
      { headers: rateLimit.rateLimitHeaders }
    );
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to update member role");
  }
}

// DELETE /api/projects/[id]/members - Remove member from project
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { id: projectId } = await params;
    if (!projectId || typeof projectId !== "string") {
      return NextResponse.json(
        { success: false, error: "Bad Request", message: "Invalid project ID" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, workspaceId: true, name: true },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Not Found", message: "Project not found" },
        { status: 404 }
      );
    }

    // Require projects.update permission
    const { auth, errorResponse } = await requireAuthGuard(req, "projects.update", project.workspaceId);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    let memberId = url.searchParams.get("memberId");
    let userId = url.searchParams.get("userId");

    // Also check body if not in query params
    if (!memberId && !userId) {
      const body = await req.json().catch(() => ({}));
      memberId = body.memberId;
      userId = body.userId;
    }

    if (!memberId && !userId) {
      return NextResponse.json(
        { success: false, error: "Bad Request", message: "memberId or userId parameter is required" },
        { status: 400 }
      );
    }

    const whereClause = memberId
      ? { id: memberId, projectId }
      : { userId: userId as string, projectId };

    const existing = await prisma.projectMember.findFirst({
      where: whereClause,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Not Found", message: "Project member not found" },
        { status: 404 }
      );
    }

    const userName = existing.user?.name || "Member";

    // Atomically unassign any tasks assigned to this user within this project and delete membership
    await prisma.$transaction([
      prisma.task.updateMany({
        where: {
          projectId,
          assigneeId: existing.userId,
        },
        data: { assigneeId: null },
      }),
      prisma.projectMember.delete({
        where: { id: existing.id },
      }),
    ]);

    // Publish server-authoritative realtime event
    await publishWorkspaceEvent(auth, "PROJECT_MEMBER_REMOVED", { id: existing.id, projectId, userId: existing.userId }, {
      projectId,
    });

    // Record audit log
    await createAuditEntry({
      workspaceId: project.workspaceId,
      actorId: auth.userId,
      actorType: "USER",
      action: "PROJECT_MEMBER_REMOVE",
      target: `Removed ${userName} from Project "${project.name}"`,
      entityType: "project_member",
      entityId: existing.id,
      before: existing,
      requestId: req.headers.get("x-request-id"),
      source: "WEB",
      ipAddress: auth.ipAddress,
    });

    return NextResponse.json(
      { success: true, message: `Successfully removed ${userName} from project.` },
      { headers: rateLimit.rateLimitHeaders }
    );
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to remove member from project");
  }
}
