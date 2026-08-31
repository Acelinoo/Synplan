import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { applyRateLimit, apiRateLimiter } from "@/lib/rateLimit";
import { validateRequestBody } from "@/lib/validation/apiValidator";
import { ReorderPhasesSchema } from "@/lib/validation/schemas";
import { createApiErrorResponse } from "@/lib/apiErrors";
import { publishWorkspaceEvent } from "@/lib/realtimeServer";
import { createAuditEntry } from "@/lib/audit";

// POST /api/phases/reorder - Batch update phase ordering
export async function POST(req: NextRequest) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const validation = await validateRequestBody(req, ReorderPhasesSchema);
    if (validation.errorResponse) return validation.errorResponse;

    const { projectId, phaseOrders, workspaceId } = validation.data;

    // 1. Authoritative project lookup: Project is the single source of truth for workspace
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, workspaceId: true },
    });

    if (!project) {
      return NextResponse.json({ success: false, error: "Not Found", message: "Project not found" }, { status: 404 });
    }

    // 2. Reject payload spoofing if client supplies a conflicting workspaceId
    if (workspaceId && workspaceId !== project.workspaceId) {
      return NextResponse.json(
        {
          success: false,
          error: "Bad Request",
          message: "Provided workspaceId does not match the project's workspace",
        },
        { status: 400 }
      );
    }

    // 3. Strict Permission Guard against authoritative project.workspaceId
    const { auth, errorResponse } = await requireAuthGuard(req, "phases.update", project.workspaceId);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // 4. Verify all phase IDs belong strictly to this project
    const phaseIds = phaseOrders.map((p) => p.id);
    const existingPhases = await prisma.phase.findMany({
      where: {
        id: { in: phaseIds },
        projectId,
      },
      select: { id: true },
    });

    if (existingPhases.length !== phaseIds.length) {
      return NextResponse.json(
        {
          success: false,
          error: "Bad Request",
          message: "One or more phases do not exist or do not belong to this project",
        },
        { status: 400 }
      );
    }

    // 5. Update orders sequentially in transaction
    await prisma.$transaction(
      phaseOrders.map((item) =>
        prisma.phase.updateMany({
          where: { id: item.id, projectId },
          data: { order: item.order },
        })
      )
    );

    // 6. Publish server-authoritative realtime event
    await publishWorkspaceEvent(auth, "PHASES_REORDERED", {
      projectId,
      phases: phaseOrders,
    }, {
      projectId,
    });

    // 7. Record Activity with IP
    await createAuditEntry({
      workspaceId: project.workspaceId,
      actorId: auth.user.id,
      actorType: "USER",
      action: "PHASE_REORDER",
      target: `Reordered phases in project "${project.name}"`,
      entityType: "phase",
      entityId: projectId,
      after: { projectId, phaseOrders },
      requestId: req.headers.get("x-request-id"),
      source: "WEB",
      ipAddress: auth.ipAddress,
    });

    return NextResponse.json({
      success: true,
      message: "Phase ordering saved successfully",
    }, { headers: rateLimit.rateLimitHeaders });
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to reorder phases");
  }
}
