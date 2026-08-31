import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { ProjectStatus } from "@prisma/client";
import { applyRateLimit, apiRateLimiter } from "@/lib/rateLimit";
import { validateRequestBody } from "@/lib/validation/apiValidator";
import { UpdateProjectSchema } from "@/lib/validation/schemas";
import { createApiErrorResponse } from "@/lib/apiErrors";
import { publishWorkspaceEvent } from "@/lib/realtimeServer";
import { createAuditEntry } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/projects/[id] - Retrieve single project with workspace authorization
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { id } = await params;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ success: false, error: "Bad Request", message: "Invalid project ID" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        phases: {
          orderBy: { order: "asc" },
        },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
        tasks: {
          include: {
            subtasks: true,
            phase: true,
            assignee: { select: { id: true, name: true, email: true } },
          },
          orderBy: { order: "asc" },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ success: false, error: "Not Found", message: "Project not found" }, { status: 404 });
    }

    // Verify requesting user is an authorized member of the project's workspace (projects.view)
    const { errorResponse } = await requireAuthGuard(req, "projects.view", project.workspaceId);
    if (errorResponse) return errorResponse;

    return NextResponse.json({ success: true, data: project }, { headers: rateLimit.rateLimitHeaders });
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to retrieve project");
  }
}

// PUT /api/projects/[id] - Update project details
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { id } = await params;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ success: false, error: "Bad Request", message: "Invalid project ID" }, { status: 400 });
    }

    const validation = await validateRequestBody(req, UpdateProjectSchema);
    if (validation.errorResponse) return validation.errorResponse;

    const { name, description, color, deadline, status } = validation.data;

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Not Found", message: "Project not found" }, { status: 404 });
    }

    // Verify user has projects.update permission in this specific project's workspace
    const { auth, errorResponse } = await requireAuthGuard(req, "projects.update", existing.workspaceId);
    if (errorResponse || !auth) return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const updated = await prisma.project.update({
      where: { id },
      data: {
        name: name ? name.trim() : existing.name,
        description: description !== undefined ? description : existing.description,
        color: color || existing.color,
        deadline: deadline ? new Date(deadline) : (deadline === null ? null : existing.deadline),
        status: status ? (status as ProjectStatus) : existing.status,
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    // Publish server-authoritative realtime event
    await publishWorkspaceEvent(auth, "PROJECT_UPDATED", updated as any, {
      projectId: updated.id,
    });

    // Record audit log
    await createAuditEntry({
      workspaceId: existing.workspaceId,
      actorId: auth.userId,
      actorType: "USER",
      action: "PROJECT_UPDATE",
      target: `Project "${updated.name}" updated`,
      entityType: "project",
      entityId: id,
      before: existing,
      after: updated,
      requestId: req.headers.get("x-request-id"),
      source: "WEB",
      ipAddress: auth.ipAddress,
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: "Project updated successfully",
    }, { headers: rateLimit.rateLimitHeaders });
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to update project");
  }
}

// DELETE /api/projects/[id] - Delete project (Requires projects.delete - OWNER/ADMIN)
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { id } = await params;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ success: false, error: "Bad Request", message: "Invalid project ID" }, { status: 400 });
    }

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Not Found", message: "Project not found" }, { status: 404 });
    }

    // Verify user has projects.delete permission in this specific project's workspace
    const { auth, errorResponse } = await requireAuthGuard(req, "projects.delete", existing.workspaceId);
    if (errorResponse || !auth) return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    // Delete related subtasks, comments, tasks, phases, and project members atomically in transaction
    await prisma.$transaction(async (tx) => {
      const projectTasks = await tx.task.findMany({
        where: { projectId: id },
        select: { id: true },
      });
      const taskIds = projectTasks.map((t) => t.id);

      if (taskIds.length > 0) {
        await tx.taskComment.deleteMany({ where: { taskId: { in: taskIds } } });
        await tx.subtask.deleteMany({ where: { taskId: { in: taskIds } } });
        await tx.task.deleteMany({ where: { id: { in: taskIds } } });
      }

      await tx.phase.deleteMany({ where: { projectId: id } });
      await tx.projectMember.deleteMany({ where: { projectId: id } });
      await tx.project.delete({ where: { id } });
    });

    // Publish server-authoritative realtime event
    await publishWorkspaceEvent(auth, "PROJECT_DELETED", { id }, {
      projectId: id,
    });

    // Record audit log
    await createAuditEntry({
      workspaceId: existing.workspaceId,
      actorId: auth.userId,
      actorType: "USER",
      action: "PROJECT_DELETE",
      target: `Project "${existing.name}" deleted`,
      entityType: "project",
      entityId: id,
      before: existing,
      requestId: req.headers.get("x-request-id"),
      source: "WEB",
      ipAddress: auth.ipAddress,
    });

    return NextResponse.json({
      success: true,
      message: "Project deleted successfully",
    }, { headers: rateLimit.rateLimitHeaders });
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to delete project");
  }
}
