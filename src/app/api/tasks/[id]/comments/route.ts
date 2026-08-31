import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { applyRateLimit, apiRateLimiter } from "@/lib/rateLimit";
import { validateRequestBody } from "@/lib/validation/apiValidator";
import { CreateTaskCommentSchema } from "@/lib/validation/schemas";
import { createApiErrorResponse } from "@/lib/apiErrors";
import { publishWorkspaceEvent } from "@/lib/realtimeServer";
import { createAuditEntry } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/tasks/[id]/comments - List all comments for a task
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { id } = await params;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ success: false, error: "Bad Request", message: "Invalid task ID" }, { status: 400 });
    }

    const task = await prisma.task.findUnique({
      where: { id },
      select: { id: true, workspaceId: true },
    });

    if (!task) {
      return NextResponse.json({ success: false, error: "Not Found", message: "Task not found" }, { status: 404 });
    }

    // Strict Permission Guard: tasks.view
    const { auth, errorResponse } = await requireAuthGuard(req, "tasks.view", task.workspaceId);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const comments = await prisma.taskComment.findMany({
      where: { taskId: id },
      include: {
        author: {
          select: { id: true, name: true, email: true, avatarUrl: true, role: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, data: comments }, { headers: rateLimit.rateLimitHeaders });
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to retrieve comments");
  }
}

// POST /api/tasks/[id]/comments - Create a new comment on a task
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { id } = await params;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ success: false, error: "Bad Request", message: "Invalid task ID" }, { status: 400 });
    }

    const validation = await validateRequestBody(req, CreateTaskCommentSchema);
    if (validation.errorResponse) return validation.errorResponse;

    const { content } = validation.data;

    const task = await prisma.task.findUnique({
      where: { id },
      include: { project: { select: { id: true, name: true } } },
    });

    if (!task) {
      return NextResponse.json({ success: false, error: "Not Found", message: "Task not found" }, { status: 404 });
    }

    // Strict Permission Guard: tasks.update
    const { auth, errorResponse } = await requireAuthGuard(req, "tasks.update", task.workspaceId);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const comment = await prisma.taskComment.create({
      data: {
        taskId: id,
        authorId: auth.user.id,
        content: content.trim(),
      },
      include: {
        author: {
          select: { id: true, name: true, email: true, avatarUrl: true, role: true },
        },
      },
    });

    // Publish server-authoritative realtime event
    await publishWorkspaceEvent(auth, "COMMENT_CREATED", {
      id: comment.id,
      taskId: id,
      content: comment.content,
      author: {
        id: comment.author.id,
        name: comment.author.name,
        avatarUrl: comment.author.avatarUrl || undefined,
      },
      createdAt: comment.createdAt.toISOString(),
    }, {
      taskId: id,
      projectId: task.projectId,
    });

    // Record Activity with IP
    await createAuditEntry({
      workspaceId: auth.workspaceId,
      actorId: auth.user.id,
      actorType: "USER",
      action: "COMMENT_CREATE",
      target: `Commented on task "${task.title}"`,
      entityType: "comment",
      entityId: comment.id,
      after: { id: comment.id, taskId: id, content: comment.content, authorId: comment.authorId },
      requestId: req.headers.get("x-request-id"),
      source: "TASK_FORM",
      ipAddress: auth.ipAddress,
    });

    return NextResponse.json(
      { success: true, data: comment, message: "Comment added successfully" },
      { status: 201, headers: rateLimit.rateLimitHeaders }
    );
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to add comment");
  }
}
