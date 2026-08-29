import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { Role } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/projects/[id] - Retrieve single project with workspace authorization
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
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
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    // Verify requesting user is an authorized member of the project's workspace
    const { errorResponse } = await requireAuthGuard(req, Role.VIEWER, project.workspaceId);
    if (errorResponse) return errorResponse;

    return NextResponse.json({ success: true, data: project });
  } catch (error: any) {
    console.error("GET /api/projects/[id] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to retrieve project",
        message: error?.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}

// PUT /api/projects/[id] - Update project details
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description, color, deadline, status, progress } = body;

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    // Verify user has MEMBER permissions in this specific project's workspace
    const { auth, errorResponse } = await requireAuthGuard(req, Role.MEMBER, existing.workspaceId);
    if (errorResponse) return errorResponse;

    const updated = await prisma.project.update({
      where: { id },
      data: {
        name: name ? name.trim() : existing.name,
        description: description !== undefined ? description : existing.description,
        color: color || existing.color,
        deadline: deadline ? new Date(deadline) : existing.deadline,
        status: status || existing.status,
        progress: progress !== undefined ? progress : existing.progress,
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: "Project updated successfully",
    });
  } catch (error: any) {
    console.error("PUT /api/projects/[id] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update project",
        message: error?.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id] - Delete project (Requires ADMIN/OWNER)
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    // Verify user has ADMIN permissions in this specific project's workspace
    const { auth, errorResponse } = await requireAuthGuard(req, Role.ADMIN, existing.workspaceId);
    if (errorResponse) return errorResponse;

    // Delete related project members and tasks in transaction
    await prisma.$transaction([
      prisma.task.deleteMany({ where: { projectId: id } }),
      prisma.projectMember.deleteMany({ where: { projectId: id } }),
      prisma.project.delete({ where: { id } }),
    ]);

    return NextResponse.json({
      success: true,
      message: "Project deleted successfully",
    });
  } catch (error: any) {
    console.error("DELETE /api/projects/[id] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete project",
        message: error?.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}
