import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { applyRateLimit, apiRateLimiter } from "@/lib/rateLimit";
import { validateRequestBody } from "@/lib/validation/apiValidator";
import { UpdatePhaseSchema } from "@/lib/validation/schemas";
import { createApiErrorResponse } from "@/lib/apiErrors";
import { publishWorkspaceEvent } from "@/lib/realtimeServer";

import { createAuditEntry } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// PUT /api/phases/[id] - Edit Phase name / description / order
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { id } = await params;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ success: false, error: "Bad Request", message: "Invalid phase ID" }, { status: 400 });
    }

    const validation = await validateRequestBody(req, UpdatePhaseSchema);
    if (validation.errorResponse) return validation.errorResponse;

    const { name, description, order } = validation.data;

    const existingPhase = await prisma.phase.findUnique({
      where: { id },
      include: { project: { select: { id: true, name: true, workspaceId: true } } },
    });

    if (!existingPhase) {
      return NextResponse.json({ success: false, error: "Not Found", message: "Phase not found" }, { status: 404 });
    }

    const { auth, errorResponse } = await requireAuthGuard(
      req,
      "phases.update",
      existingPhase.project.workspaceId
    );
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const updatedPhase = await prisma.phase.update({
      where: { id },
      data: {
        name: name ? name.trim() : existingPhase.name,
        description: description !== undefined ? description : existingPhase.description,
        order: typeof order === "number" ? order : existingPhase.order,
      },
    });

    // Publish server-authoritative realtime event
    await publishWorkspaceEvent(auth, "PHASE_UPDATED", updatedPhase as any, {
      projectId: existingPhase.projectId,
    });

    // Record Activity with IP
    await createAuditEntry({
      workspaceId: auth.workspaceId,
      actorId: auth.user.id,
      actorType: "USER",
      action: "PHASE_UPDATE",
      target: `Updated Phase "${updatedPhase.name}" in project "${existingPhase.project.name}"`,
      entityType: "phase",
      entityId: updatedPhase.id,
      before: existingPhase,
      after: updatedPhase,
      requestId: req.headers.get("x-request-id"),
      source: "WEB",
      ipAddress: auth.ipAddress,
    });

    return NextResponse.json({
      success: true,
      data: updatedPhase,
      message: `Phase "${updatedPhase.name}" updated successfully`,
    }, { headers: rateLimit.rateLimitHeaders });
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to update phase");
  }
}

// DELETE /api/phases/[id] - Safe Phase Deletion (phases.delete - OWNER/ADMIN)
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { id } = await params;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ success: false, error: "Bad Request", message: "Invalid phase ID" }, { status: 400 });
    }

    const existingPhase = await prisma.phase.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true, workspaceId: true } },
        tasks: { select: { id: true } },
      },
    });

    if (!existingPhase) {
      return NextResponse.json({ success: false, error: "Not Found", message: "Phase not found" }, { status: 404 });
    }

    const { auth, errorResponse } = await requireAuthGuard(
      req,
      "phases.delete",
      existingPhase.project.workspaceId
    );
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // Safe deletion rule: Prevent deletion if active tasks are attached
    if (existingPhase.tasks.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Bad Request",
          message: `Cannot delete phase "${existingPhase.name}" because it contains ${existingPhase.tasks.length} task(s). Please reassign or delete the tasks first.`,
        },
        { status: 400 }
      );
    }

    await prisma.phase.delete({ where: { id } });

    // Publish server-authoritative realtime event
    await publishWorkspaceEvent(auth, "PHASE_DELETED", {
      id,
      projectId: existingPhase.projectId,
    }, {
      projectId: existingPhase.projectId,
    });

    // Record Activity with IP
    await createAuditEntry({
      workspaceId: auth.workspaceId,
      actorId: auth.user.id,
      actorType: "USER",
      action: "PHASE_DELETE",
      target: `Deleted Phase "${existingPhase.name}" from project "${existingPhase.project.name}"`,
      entityType: "phase",
      entityId: id,
      before: existingPhase,
      requestId: req.headers.get("x-request-id"),
      source: "WEB",
      ipAddress: auth.ipAddress,
    });

    return NextResponse.json({
      success: true,
      message: `Phase "${existingPhase.name}" deleted successfully`,
    }, { headers: rateLimit.rateLimitHeaders });
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to delete phase");
  }
}
