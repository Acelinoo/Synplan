import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { Role } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// PUT /api/phases/[id] - Edit Phase name / description / order
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description, order, workspaceId } = body;

    const existingPhase = await prisma.phase.findUnique({
      where: { id },
      include: { project: { select: { id: true, name: true, workspaceId: true } } },
    });

    if (!existingPhase) {
      return NextResponse.json({ success: false, error: "Phase not found" }, { status: 404 });
    }

    const { auth, errorResponse } = await requireAuthGuard(
      req,
      Role.MEMBER,
      existingPhase.project.workspaceId
    );
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const updatedPhase = await prisma.phase.update({
      where: { id },
      data: {
        name: typeof name === "string" && name.trim() ? name.trim() : existingPhase.name,
        description: description !== undefined ? (description ? description.trim() : null) : existingPhase.description,
        order: typeof order === "number" ? order : existingPhase.order,
      },
    });

    // Record Activity
    await prisma.auditLog.create({
      data: {
        workspaceId: auth.workspaceId,
        actorId: auth.user.id,
        action: `Updated Phase "${updatedPhase.name}" in project "${existingPhase.project.name}"`,
        target: existingPhase.project.name,
        entityType: "Phase",
        entityId: updatedPhase.id,
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedPhase,
      message: `Phase "${updatedPhase.name}" updated successfully`,
    });
  } catch (error: any) {
    console.error("PUT /api/phases/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update phase", message: error?.message },
      { status: 500 }
    );
  }
}

// DELETE /api/phases/[id] - Safe Phase Deletion
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const existingPhase = await prisma.phase.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true, workspaceId: true } },
        tasks: { select: { id: true } },
      },
    });

    if (!existingPhase) {
      return NextResponse.json({ success: false, error: "Phase not found" }, { status: 404 });
    }

    const { auth, errorResponse } = await requireAuthGuard(
      req,
      Role.MEMBER,
      existingPhase.project.workspaceId
    );
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // Safe deletion rule: Prevent deletion if active tasks are attached
    if (existingPhase.tasks.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete phase "${existingPhase.name}" because it contains ${existingPhase.tasks.length} task(s). Please reassign or delete the tasks first.`,
        },
        { status: 400 }
      );
    }

    await prisma.phase.delete({ where: { id } });

    // Record Activity
    await prisma.auditLog.create({
      data: {
        workspaceId: auth.workspaceId,
        actorId: auth.user.id,
        action: `Deleted Phase "${existingPhase.name}" from project "${existingPhase.project.name}"`,
        target: existingPhase.project.name,
        entityType: "Phase",
        entityId: id,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Phase "${existingPhase.name}" deleted successfully`,
    });
  } catch (error: any) {
    console.error("DELETE /api/phases/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete phase", message: error?.message },
      { status: 500 }
    );
  }
}
