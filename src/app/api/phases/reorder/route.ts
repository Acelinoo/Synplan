import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { Role } from "@prisma/client";

// POST /api/phases/reorder - Batch update phase ordering
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, phaseOrders, workspaceId } = body;

    if (!projectId || !Array.isArray(phaseOrders)) {
      return NextResponse.json(
        { success: false, error: "projectId and phaseOrders array are required" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, workspaceId: true },
    });

    if (!project) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    const { auth, errorResponse } = await requireAuthGuard(req, Role.MEMBER, project.workspaceId);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // Update orders sequentially or in transaction
    await prisma.$transaction(
      phaseOrders.map((item: { id: string; order: number }) =>
        prisma.phase.updateMany({
          where: { id: item.id, projectId },
          data: { order: item.order },
        })
      )
    );

    // Record Activity
    await prisma.auditLog.create({
      data: {
        workspaceId: auth.workspaceId,
        actorId: auth.user.id,
        action: `Reordered phases in project "${project.name}"`,
        target: project.name,
        entityType: "Phase",
        entityId: projectId,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Phase ordering saved successfully",
    });
  } catch (error: any) {
    console.error("POST /api/phases/reorder error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to reorder phases", message: error?.message },
      { status: 500 }
    );
  }
}
