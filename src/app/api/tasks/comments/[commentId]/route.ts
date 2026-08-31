import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { Role } from "@prisma/client";
import { applyRateLimit, apiRateLimiter } from "@/lib/rateLimit";
import { createApiErrorResponse } from "@/lib/apiErrors";
import { publishWorkspaceEvent } from "@/lib/realtimeServer";

import { createAuditEntry } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ commentId: string }>;
}

// PUT /api/tasks/comments/[commentId] - Edit own comment
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { commentId } = await params;
    if (!commentId || typeof commentId !== "string") {
      return NextResponse.json({ success: false, error: "Bad Request", message: "Invalid comment ID" }, { status: 400 });
    }

    const body = await req.json();
    const { content } = body;

    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { success: false, error: "Bad Request", message: "Comment content cannot be empty" },
        { status: 400 }
      );
    }

    const comment = await prisma.taskComment.findUnique({
      where: { id: commentId },
      include: {
        task: { select: { id: true, workspaceId: true } },
      },
    });

    if (!comment) {
      return NextResponse.json({ success: false, error: "Not Found", message: "Comment not found" }, { status: 404 });
    }

    // Strict Permission Guard: tasks.update
    const { auth, errorResponse } = await requireAuthGuard(req, "tasks.update", comment.task.workspaceId);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // Only comment author or admin can edit
    if (comment.authorId !== auth.user.id && auth.role !== Role.ADMIN && auth.role !== Role.OWNER) {
      return NextResponse.json(
        { success: false, error: "Forbidden", message: "You can only edit your own comments" },
        { status: 403 }
      );
    }

    const updated = await prisma.taskComment.update({
      where: { id: commentId },
      data: { content: content.trim() },
      include: {
        author: {
          select: { id: true, name: true, email: true, avatarUrl: true, role: true },
        },
      },
    });

    // Publish server-authoritative realtime event
    await publishWorkspaceEvent(auth, "COMMENT_UPDATED", {
      id: commentId,
      taskId: comment.task.id,
      content: updated.content,
    }, {
      taskId: comment.task.id,
    });

    // Record audit trail
    await createAuditEntry({
      workspaceId: comment.task.workspaceId,
      actorId: auth.user.id,
      actorType: "USER",
      action: "COMMENT_UPDATE",
      target: `Comment updated on task`,
      entityType: "comment",
      entityId: commentId,
      before: { id: comment.id, taskId: comment.taskId, content: comment.content, authorId: comment.authorId },
      after: { id: updated.id, taskId: updated.taskId, content: updated.content, authorId: updated.authorId },
      requestId: req.headers.get("x-request-id"),
      source: "TASK_FORM",
      ipAddress: auth.ipAddress,
    });

    return NextResponse.json(
      { success: true, data: updated },
      { headers: rateLimit.rateLimitHeaders }
    );
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to update comment");
  }
}

// DELETE /api/tasks/comments/[commentId] - Delete own comment
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { commentId } = await params;
    if (!commentId || typeof commentId !== "string") {
      return NextResponse.json({ success: false, error: "Bad Request", message: "Invalid comment ID" }, { status: 400 });
    }

    const comment = await prisma.taskComment.findUnique({
      where: { id: commentId },
      include: {
        task: { select: { id: true, workspaceId: true } },
      },
    });

    if (!comment) {
      return NextResponse.json({ success: false, error: "Not Found", message: "Comment not found" }, { status: 404 });
    }

    // Strict Permission Guard: tasks.update
    const { auth, errorResponse } = await requireAuthGuard(req, "tasks.update", comment.task.workspaceId);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // Only author or admin can delete
    if (comment.authorId !== auth.user.id && auth.role !== Role.ADMIN && auth.role !== Role.OWNER) {
      return NextResponse.json(
        { success: false, error: "Forbidden", message: "You can only delete your own comments" },
        { status: 403 }
      );
    }

    await prisma.taskComment.delete({ where: { id: commentId } });

    // Publish server-authoritative realtime event
    await publishWorkspaceEvent(auth, "COMMENT_DELETED", {
      id: commentId,
      taskId: comment.task.id,
    }, {
      taskId: comment.task.id,
    });

    // Record audit trail
    await createAuditEntry({
      workspaceId: comment.task.workspaceId,
      actorId: auth.user.id,
      actorType: "USER",
      action: "COMMENT_DELETE",
      target: `Comment deleted on task`,
      entityType: "comment",
      entityId: commentId,
      before: { id: comment.id, taskId: comment.taskId, content: comment.content, authorId: comment.authorId },
      requestId: req.headers.get("x-request-id"),
      source: "TASK_FORM",
      ipAddress: auth.ipAddress,
    });

    return NextResponse.json(
      { success: true, message: "Comment deleted successfully" },
      { headers: rateLimit.rateLimitHeaders }
    );
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to delete comment");
  }
}
