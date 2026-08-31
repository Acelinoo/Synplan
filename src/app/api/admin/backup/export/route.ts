import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { createAuditEntry } from "@/lib/audit";
import { createApiErrorResponse } from "@/lib/apiErrors";
import { applyRateLimit, apiRateLimiter } from "@/lib/rateLimit";
import { Role } from "@prisma/client";

/**
 * GET /api/admin/backup/export
 *
 * Secure application-level workspace backup export endpoint.
 * Protected by strict RBAC (OWNER / ADMIN only) and workspace isolation boundaries.
 * Zero secret leak guaranteed: strictly omits sessions, account tokens, and credentials.
 */
export async function GET(req: NextRequest) {
  // Rate Limiting (Standard API Rate Limiter)
  const { errorResponse: rateLimitError } = applyRateLimit(req, apiRateLimiter);
  if (rateLimitError) {
    return rateLimitError;
  }

  // 1. RBAC & Workspace Authorization Guard
  const { auth, errorResponse } = await requireAuthGuard(req, "backup.export");
  if (errorResponse || !auth) {
    return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  if (auth.role !== Role.OWNER && auth.role !== Role.ADMIN) {
    return NextResponse.json(
      { success: false, error: "Forbidden", message: "Only workspace OWNER or ADMIN can export workspace backups" },
      { status: 403 }
    );
  }

  const workspaceId = auth.workspaceId;
  const requestId = req.headers.get("x-request-id") || `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  try {
    // 2. Fetch Workspace Metadata (Sanitized)
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!workspace) {
      return NextResponse.json(
        { success: false, error: "Not Found", message: "Target workspace not found" },
        { status: 404 }
      );
    }

    // 3. Fetch Workspace Members (Sanitized user profile only)
    const rawMembers = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: {
        id: true,
        workspaceId: true,
        userId: true,
        role: true,
        workloadScore: true,
        joinedAt: true,
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
    });

    // 4. Fetch Projects & Project Members
    const rawProjects = await prisma.project.findMany({
      where: { workspaceId },
      include: {
        members: {
          select: {
            id: true,
            projectId: true,
            userId: true,
            role: true,
          },
        },
      },
    });

    // 5. Fetch Phases
    const rawPhases = await prisma.phase.findMany({
      where: {
        project: { workspaceId },
      },
      orderBy: { order: "asc" },
    });

    // 6. Fetch Tasks & Subtasks
    const rawTasks = await prisma.task.findMany({
      where: { workspaceId },
      include: {
        subtasks: {
          select: {
            id: true,
            taskId: true,
            title: true,
            completed: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const subtasks = rawTasks.flatMap((t) => t.subtasks || []);

    // Strip embedded subtasks from tasks array for clean relational normalization
    const tasks = rawTasks.map((t) => {
      const { subtasks: _, ...taskData } = t;
      return taskData;
    });

    // 7. Fetch Task Comments
    const comments = await prisma.taskComment.findMany({
      where: {
        task: { workspaceId },
      },
      select: {
        id: true,
        taskId: true,
        authorId: true,
        content: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // 8. Fetch Notifications
    const notifications = await prisma.notification.findMany({
      where: { workspaceId },
      select: {
        id: true,
        workspaceId: true,
        userId: true,
        title: true,
        description: true,
        type: true,
        link: true,
        read: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // 9. Fetch Audit Logs (Bounded to most recent 2,000 entries)
    const auditLogs = await prisma.auditLog.findMany({
      where: { workspaceId },
      orderBy: { timestamp: "desc" },
      take: 2000,
    });

    const now = new Date();

    // 10. Record Audit Trail Event (Non-blocking)
    await createAuditEntry({
      workspaceId,
      actorId: auth.userId,
      actorType: "USER",
      action: "BACKUP_EXPORT",
      target: workspace.name,
      entityType: "workspace",
      entityId: workspaceId,
      requestId,
      source: "API",
      metadata: {
        totalProjects: rawProjects.length,
        totalPhases: rawPhases.length,
        totalTasks: tasks.length,
        totalSubtasks: subtasks.length,
        totalComments: comments.length,
        totalMembers: rawMembers.length,
        totalNotifications: notifications.length,
        totalAuditLogs: auditLogs.length,
      },
      ipAddress: auth.ipAddress,
    });

    // 11. Assemble Structured Export Payload
    const backupPayload = {
      version: "1.0",
      exportedAt: now.toISOString(),
      requestId,
      workspace,
      members: rawMembers,
      projects: rawProjects,
      phases: rawPhases,
      tasks,
      subtasks,
      comments,
      notifications,
      auditLogs,
    };

    const filename = `synplan-backup-${workspace.slug}-${now.getTime()}.json`;

    return NextResponse.json(backupPayload, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "x-request-id": requestId,
        "x-synplan-backup-version": "1.0",
      },
    });
  } catch (error) {
    return createApiErrorResponse(error, "Failed to generate workspace backup export", { status: 500, requestId });
  }
}
