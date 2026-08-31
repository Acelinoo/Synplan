import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { createNotification } from "@/lib/notificationService";
import { TaskStatus, TaskPriority } from "@prisma/client";
import { applyRateLimit, apiRateLimiter } from "@/lib/rateLimit";
import { validateRequestBody } from "@/lib/validation/apiValidator";
import { CreateTaskSchema } from "@/lib/validation/schemas";
import { createApiErrorResponse } from "@/lib/apiErrors";
import { parsePaginationParams } from "@/lib/pagination";
import { publishWorkspaceEvent } from "@/lib/realtimeServer";
import { idempotency } from "@/lib/idempotency";
import { createAuditEntry } from "@/lib/audit";

// GET /api/tasks - Retrieve tasks list for authorized workspace
export async function GET(req: NextRequest) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");
    const projectId = searchParams.get("projectId");
    const phaseId = searchParams.get("phaseId");
    const statusParam = searchParams.get("status")?.toUpperCase();
    const priorityParam = searchParams.get("priority")?.toUpperCase();
    const assigneeId = searchParams.get("assigneeId");
    const search = searchParams.get("search")?.trim();

    // Parse standardized pagination parameters
    const pagination = parsePaginationParams(req, { defaultLimit: 50, maxLimit: 100 });

    // Verify workspace membership & authorization (tasks.view)
    const { auth, errorResponse } = await requireAuthGuard(req, "tasks.view", workspaceId || undefined);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const whereClause: any = { workspaceId: auth.workspaceId };

    if (projectId) {
      const proj = await prisma.project.findFirst({
        where: { id: projectId, workspaceId: auth.workspaceId },
        select: { id: true },
      });
      if (proj) {
        whereClause.projectId = projectId;
      }
    }

    if (phaseId) {
      whereClause.phaseId = phaseId;
    }

    if (assigneeId) whereClause.assigneeId = assigneeId;
    if (statusParam && Object.values(TaskStatus).includes(statusParam as TaskStatus)) {
      whereClause.status = statusParam as TaskStatus;
    }
    if (priorityParam && Object.values(TaskPriority).includes(priorityParam as TaskPriority)) {
      whereClause.priority = priorityParam as TaskPriority;
    }

    if (search) {
      whereClause.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    // Count total matching records for pagination metadata
    const total = await prisma.task.count({ where: whereClause });

    // Query paginated items
    const queryOptions: any = {
      where: whereClause,
      include: {
        assignee: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        subtasks: {
          orderBy: { createdAt: "asc" },
        },
        phase: {
          select: { id: true, name: true, order: true },
        },
        project: {
          select: { id: true, name: true, color: true },
        },
      },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      take: pagination.limit,
    };

    if (pagination.cursor) {
      queryOptions.skip = 1;
      queryOptions.cursor = { id: pagination.cursor };
    } else {
      queryOptions.skip = pagination.skip;
    }

    const tasks = await prisma.task.findMany(queryOptions);

    const totalPages = Math.ceil(total / pagination.limit) || 1;
    const hasMore = pagination.page < totalPages || (tasks.length === pagination.limit && tasks.length > 0);
    const nextCursor = hasMore && tasks.length > 0 ? tasks[tasks.length - 1].id : null;

    return NextResponse.json({
      success: true,
      data: tasks,
      pagination: {
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages,
        hasMore,
        nextCursor,
      },
    }, { headers: rateLimit.rateLimitHeaders });
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to retrieve tasks");
  }
}

// POST /api/tasks - Create new task in authorized workspace with idempotency protection
export async function POST(req: NextRequest) {
  const idempotencyKey = idempotency.extractKey(req);
  let authContext: any = null;

  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const validation = await validateRequestBody(req, CreateTaskSchema);
    if (validation.errorResponse) return validation.errorResponse;

    const {
      workspaceId,
      projectId,
      phaseId,
      title,
      description,
      status,
      priority,
      assigneeId,
      dueDate,
      tags,
      subtasks,
    } = validation.data;

    // Strict Permission Guard: tasks.create
    const { auth, errorResponse } = await requireAuthGuard(req, "tasks.create", workspaceId || undefined);
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
          { success: false, error: "Conflict", message: "Task creation is already in flight for this key" },
          { status: 409 }
        );
      }
      idempotency.start(idempotencyKey, targetWorkspaceId, auth.userId);
    }

    // Resolve & verify project belongs to user's workspace
    let targetProjectId = projectId;
    let existingProj = targetProjectId
      ? await prisma.project.findFirst({
          where: { id: targetProjectId, workspaceId: targetWorkspaceId },
          select: { id: true },
        })
      : null;

    if (!existingProj) {
      const firstProj = await prisma.project.findFirst({
        where: { workspaceId: targetWorkspaceId },
        select: { id: true },
      });
      if (!firstProj) {
        if (idempotencyKey) idempotency.release(idempotencyKey, targetWorkspaceId, auth.userId);
        return NextResponse.json(
          { success: false, error: "Bad Request", message: "No projects found in this workspace to attach task" },
          { status: 400 }
        );
      }
      targetProjectId = firstProj.id;
    }

    // Validate phaseId belongs to targetProjectId
    let validPhaseId: string | null = null;
    if (phaseId) {
      const phase = await prisma.phase.findFirst({
        where: { id: phaseId, projectId: targetProjectId },
        select: { id: true },
      });
      if (phase) validPhaseId = phase.id;
    }

    if (!validPhaseId) {
      const defaultPhase = await prisma.phase.findFirst({
        where: { projectId: targetProjectId },
        orderBy: { order: "asc" },
        select: { id: true },
      });
      if (defaultPhase) validPhaseId = defaultPhase.id;
    }

    // Validate assigneeId belongs to this workspace
    let validAssigneeId: string | null = null;
    if (assigneeId) {
      const isMember = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: targetWorkspaceId,
            userId: assigneeId,
          },
        },
        select: { userId: true },
      });
      if (isMember) validAssigneeId = isMember.userId;
    }

    const task = await prisma.task.create({
      data: {
        workspaceId: targetWorkspaceId,
        projectId: targetProjectId as string,
        phaseId: validPhaseId,
        title: title.trim(),
        description: description ? description.trim() : null,
        status: (status as TaskStatus) || TaskStatus.TODO,
        priority: (priority as TaskPriority) || TaskPriority.MEDIUM,
        assigneeId: validAssigneeId,
        dueDate: dueDate ? new Date(dueDate) : null,
        tags: Array.isArray(tags) ? tags : [],
        subtasks: {
          create: Array.isArray(subtasks)
            ? subtasks.map((st) => ({
                title: st.title.trim(),
                completed: !!st.completed,
              }))
            : [],
        },
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        phase: { select: { id: true, name: true, order: true } },
        subtasks: { orderBy: { createdAt: "asc" } },
        project: { select: { id: true, name: true, color: true } },
      },
    });

    // Send direct notification to assignee if assigned to another user
    if (validAssigneeId && validAssigneeId !== auth.userId) {
      createNotification({
        workspaceId: targetWorkspaceId,
        userId: validAssigneeId,
        type: "TASK_ASSIGNED",
        title: "Task Assigned",
        description: `You were assigned to "${task.title}"`,
        entityType: "TASK",
        entityId: task.id,
        link: `/tasks?taskId=${task.id}`,
      }).catch(() => {});
    }

    // Publish server-authoritative realtime event
    await publishWorkspaceEvent(auth, "TASK_CREATED", task as any, {
      projectId: task.projectId,
      taskId: task.id,
    });

    // Record forensic audit log
    await createAuditEntry({
      workspaceId: targetWorkspaceId,
      actorId: auth.userId,
      actorType: "USER",
      action: "TASK_CREATE",
      target: `Task "${task.title}" created`,
      entityType: "task",
      entityId: task.id,
      after: task,
      requestId: req.headers.get("x-request-id"),
      source: "TASK_FORM",
      ipAddress: auth.ipAddress,
    });

    const responseBody = {
      success: true,
      data: task,
      message: `Task "${task.title}" created successfully`,
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
    return createApiErrorResponse(error, "Failed to create task");
  }
}
