import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { ProjectStatus } from "@prisma/client";
import { applyRateLimit, apiRateLimiter } from "@/lib/rateLimit";
import { validateRequestBody } from "@/lib/validation/apiValidator";
import { CreateProjectSchema } from "@/lib/validation/schemas";
import { createApiErrorResponse } from "@/lib/apiErrors";
import { parsePaginationParams } from "@/lib/pagination";
import { publishWorkspaceEvent } from "@/lib/realtimeServer";
import { idempotency } from "@/lib/idempotency";
import { createAuditEntry } from "@/lib/audit";

// GET /api/projects - Retrieve projects list for authorized workspace
export async function GET(req: NextRequest) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");
    const statusParam = searchParams.get("status")?.toUpperCase();
    const search = searchParams.get("search")?.trim();

    // Parse standardized pagination parameters
    const pagination = parsePaginationParams(req, { defaultLimit: 20, maxLimit: 50 });

    // Verify workspace membership & authorization (projects.view)
    const { auth, errorResponse } = await requireAuthGuard(req, "projects.view", workspaceId || undefined);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const whereClause: any = { workspaceId: auth.workspaceId };
    if (statusParam && Object.values(ProjectStatus).includes(statusParam as ProjectStatus)) {
      whereClause.status = statusParam as ProjectStatus;
    }

    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    // Count total matching projects
    const total = await prisma.project.count({ where: whereClause });

    const queryOptions: any = {
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
      take: pagination.limit,
    };

    if (pagination.cursor) {
      queryOptions.skip = 1;
      queryOptions.cursor = { id: pagination.cursor };
    } else {
      queryOptions.skip = pagination.skip;
    }

    const [projects, doneTaskGroups] = await Promise.all([
      prisma.project.findMany(queryOptions),
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
    const projectsWithProgress = projects.map((p: any) => {
      const totalTasks = p._count?.tasks ?? p.totalTasks ?? 0;
      const completed = doneCountMap.get(p.id) || 0;
      const computedProgress = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;

      return {
        ...p,
        totalTasks,
        completedTasks: completed,
        progress: computedProgress,
      };
    });

    const totalPages = Math.ceil(total / pagination.limit) || 1;
    const hasMore = pagination.page < totalPages || (projects.length === pagination.limit && projects.length > 0);
    const nextCursor = hasMore && projects.length > 0 ? projects[projects.length - 1].id : null;

    return NextResponse.json(
      {
        success: true,
        data: projectsWithProgress,
        pagination: {
          total,
          page: pagination.page,
          limit: pagination.limit,
          totalPages,
          hasMore,
          nextCursor,
        },
      },
      { headers: rateLimit.rateLimitHeaders }
    );
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to retrieve projects");
  }
}

// POST /api/projects - Create a new project in authorized workspace with idempotency protection
export async function POST(req: NextRequest) {
  const idempotencyKey = idempotency.extractKey(req);
  let authContext: any = null;

  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    // Strict Input Validation with Zod
    const validation = await validateRequestBody(req, CreateProjectSchema);
    if (validation.errorResponse) return validation.errorResponse;

    const { name, description, color, deadline, memberIds, status, workspaceId } = validation.data;

    // Strict Permission Guard: projects.create
    const { auth, errorResponse } = await requireAuthGuard(req, "projects.create", workspaceId || undefined);
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
          { success: false, error: "Conflict", message: "Project creation is already in flight for this key" },
          { status: 409 }
        );
      }
      idempotency.start(idempotencyKey, targetWorkspaceId, auth.userId);
    }

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
        color: color || "#0284C7",
        deadline: deadline ? new Date(deadline) : null,
        status: (status as ProjectStatus) || ProjectStatus.ACTIVE,
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

    // Publish server-authoritative realtime event
    await publishWorkspaceEvent(auth, "PROJECT_CREATED", project as any, {
      projectId: project.id,
    });

    // Record forensic audit log with client IP tracking
    await createAuditEntry({
      workspaceId: targetWorkspaceId,
      actorId: auth.userId,
      actorType: "USER",
      action: "PROJECT_CREATE",
      target: `Project "${project.name}" created`,
      entityType: "project",
      entityId: project.id,
      after: project,
      requestId: req.headers.get("x-request-id"),
      source: "WEB",
      ipAddress: auth.ipAddress,
    });

    const responseBody = {
      success: true,
      data: project,
      message: `Project "${project.name}" created successfully`,
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
    return createApiErrorResponse(error, "Failed to create project");
  }
}
