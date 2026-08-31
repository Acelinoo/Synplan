import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { applyRateLimit, apiRateLimiter } from "@/lib/rateLimit";
import { validateRequestBody } from "@/lib/validation/apiValidator";
import { CreatePhaseSchema } from "@/lib/validation/schemas";
import { createApiErrorResponse } from "@/lib/apiErrors";
import { publishWorkspaceEvent } from "@/lib/realtimeServer";
import { idempotency } from "@/lib/idempotency";
import { createAuditEntry } from "@/lib/audit";

// GET /api/phases?projectId=... - Retrieve phases for a project
export async function GET(req: NextRequest) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const workspaceId = searchParams.get("workspaceId");

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "Bad Request", message: "projectId query param is required" },
        { status: 400 }
      );
    }

    // Strict Permission Guard: phases.view
    const { auth, errorResponse } = await requireAuthGuard(req, "phases.view", workspaceId || undefined);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // Verify project belongs to authorized workspace
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId: auth.workspaceId },
      select: { id: true },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Not Found", message: "Project not found or not authorized" },
        { status: 404 }
      );
    }

    const phases = await prisma.phase.findMany({
      where: { projectId },
      include: {
        tasks: {
          select: { id: true, status: true, title: true, priority: true, assigneeId: true },
        },
      },
      orderBy: { order: "asc" },
    });

    return NextResponse.json({ success: true, data: phases }, { headers: rateLimit.rateLimitHeaders });
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to fetch phases");
  }
}

// POST /api/phases - Create new phase in project with idempotency protection
export async function POST(req: NextRequest) {
  const idempotencyKey = idempotency.extractKey(req);
  let authContext: any = null;

  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const validation = await validateRequestBody(req, CreatePhaseSchema);
    if (validation.errorResponse) return validation.errorResponse;

    const { projectId, name, description, order, workspaceId } = validation.data;

    // Strict Permission Guard: phases.create
    const { auth, errorResponse } = await requireAuthGuard(req, "phases.create", workspaceId || undefined);
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
          { success: false, error: "Conflict", message: "Phase creation is already in flight for this key" },
          { status: 409 }
        );
      }
      idempotency.start(idempotencyKey, targetWorkspaceId, auth.userId);
    }

    // Verify project belongs to authorized workspace
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId: targetWorkspaceId },
      select: { id: true, name: true },
    });

    if (!project) {
      if (idempotencyKey) idempotency.release(idempotencyKey, targetWorkspaceId, auth.userId);
      return NextResponse.json(
        { success: false, error: "Not Found", message: "Project not found or not authorized" },
        { status: 404 }
      );
    }

    // Determine default order if not provided
    let phaseOrder = typeof order === "number" ? order : 0;
    if (phaseOrder === 0) {
      const highestPhase = await prisma.phase.findFirst({
        where: { projectId },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      phaseOrder = (highestPhase?.order ?? 0) + 1;
    }

    const phase = await prisma.phase.create({
      data: {
        projectId,
        name: name.trim(),
        description: description ? description.trim() : null,
        order: phaseOrder,
      },
    });

    // Publish server-authoritative realtime event
    await publishWorkspaceEvent(auth, "PHASE_CREATED", phase as any, {
      projectId,
    });

    // Record Activity with IP
    await createAuditEntry({
      workspaceId: auth.workspaceId,
      actorId: auth.user.id,
      actorType: "USER",
      action: "PHASE_CREATE",
      target: `Created Phase "${phase.name}" in project "${project.name}"`,
      entityType: "phase",
      entityId: phase.id,
      after: phase,
      requestId: req.headers.get("x-request-id"),
      source: "WEB",
      ipAddress: auth.ipAddress,
    });

    const responseBody = {
      success: true,
      data: phase,
      message: `Phase "${phase.name}" created successfully`,
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
    return createApiErrorResponse(error, "Failed to create phase");
  }
}
