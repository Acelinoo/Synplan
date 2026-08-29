import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { Role } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/tasks/[id]/comments - List all comments for a task
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const task = await prisma.task.findUnique({
      where: { id },
      select: { id: true, workspaceId: true },
    });

    if (!task) {
      return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
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

    return NextResponse.json({ success: true, data: comments });
  } catch (error: any) {
    console.error("GET /api/tasks/[id]/comments error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to retrieve comments", message: error?.message },
      { status: 500 }
    );
  }
}

// POST /api/tasks/[id]/comments - Create a new comment on a task
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { content } = body;

    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { success: false, error: "Comment content cannot be empty" },
        { status: 400 }
      );
    }

    const task = await prisma.task.findUnique({
      where: { id },
      include: { project: { select: { id: true, name: true } } },
    });

    if (!task) {
      return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
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

    // Record Activity
    await prisma.auditLog.create({
      data: {
        workspaceId: auth.workspaceId,
        actorId: auth.user.id,
        action: `Commented on task "${task.title}"`,
        target: task.title,
        entityType: "TaskComment",
        entityId: comment.id,
      },
    });

    return NextResponse.json(
      { success: true, data: comment, message: "Comment added successfully" },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/tasks/[id]/comments error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to add comment", message: error?.message },
      { status: 500 }
    );
  }
}
