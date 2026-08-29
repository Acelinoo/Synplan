import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { Role } from "@prisma/client";

// GET /api/phases?projectId=... - Retrieve phases for a project
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const workspaceId = searchParams.get("workspaceId");

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "projectId query param is required" },
        { status: 400 }
      );
    }

    const { auth, errorResponse } = await requireAuthGuard(req, Role.VIEWER, workspaceId || undefined);
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
        { success: false, error: "Project not found or not authorized" },
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

    return NextResponse.json({ success: true, data: phases });
  } catch (error: any) {
    console.error("GET /api/phases error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch phases", message: error?.message },
      { status: 500 }
    );
  }
}

// POST /api/phases - Create new phase in project
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, name, description, order, workspaceId } = body;

    const { auth, errorResponse } = await requireAuthGuard(req, Role.MEMBER, workspaceId || undefined);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!projectId || !name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "projectId and valid name are required" },
        { status: 400 }
      );
    }

    // Verify project belongs to authorized workspace
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId: auth.workspaceId },
      select: { id: true, name: true },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found or not authorized" },
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

    // Record Activity
    await prisma.auditLog.create({
      data: {
        workspaceId: auth.workspaceId,
        actorId: auth.user.id,
        action: `Created Phase "${phase.name}" in project "${project.name}"`,
        target: project.name,
        entityType: "Phase",
        entityId: phase.id,
      },
    });

    return NextResponse.json(
      { success: true, data: phase, message: `Phase "${phase.name}" created successfully` },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/phases error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create phase", message: error?.message },
      { status: 500 }
    );
  }
}
