import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { Role } from "@prisma/client";

interface RouteParams {
  params: Promise<{ commentId: string }>;
}

// PUT /api/tasks/comments/[commentId] - Edit own comment
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { commentId } = await params;
    const body = await req.json();
    const { content } = body;

    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { success: false, error: "Comment content cannot be empty" },
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
      return NextResponse.json({ success: false, error: "Comment not found" }, { status: 404 });
    }

    // Strict Permission Guard: tasks.update
    const { auth, errorResponse } = await requireAuthGuard(req, "tasks.update", comment.task.workspaceId);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // Only comment author or admin can edit
    if (comment.authorId !== auth.user.id && auth.role !== Role.ADMIN && auth.role !== Role.OWNER) {
      return NextResponse.json(
        { success: false, error: "You can only edit your own comments" },
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

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("PUT /api/tasks/comments/[commentId] error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update comment", message: error?.message },
      { status: 500 }
    );
  }
}

// DELETE /api/tasks/comments/[commentId] - Delete own comment
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { commentId } = await params;

    const comment = await prisma.taskComment.findUnique({
      where: { id: commentId },
      include: {
        task: { select: { id: true, workspaceId: true } },
      },
    });

    if (!comment) {
      return NextResponse.json({ success: false, error: "Comment not found" }, { status: 404 });
    }

    // Strict Permission Guard: tasks.update
    const { auth, errorResponse } = await requireAuthGuard(req, "tasks.update", comment.task.workspaceId);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // Only author or admin can delete
    if (comment.authorId !== auth.user.id && auth.role !== Role.ADMIN && auth.role !== Role.OWNER) {
      return NextResponse.json(
        { success: false, error: "You can only delete your own comments" },
        { status: 403 }
      );
    }

    await prisma.taskComment.delete({ where: { id: commentId } });

    return NextResponse.json({ success: true, message: "Comment deleted successfully" });
  } catch (error: any) {
    console.error("DELETE /api/tasks/comments/[commentId] error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete comment", message: error?.message },
      { status: 500 }
    );
  }
}
