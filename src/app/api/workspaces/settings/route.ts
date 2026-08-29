import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { Role } from "@prisma/client";

// PUT /api/workspaces/settings - Update workspace configuration & settings
export async function PUT(req: NextRequest) {
  try {
    // 1. RBAC Guard: Require at least ADMIN role to modify workspace settings
    const { auth, errorResponse } = await requireAuthGuard(req, Role.ADMIN);
    if (errorResponse) return errorResponse;

    const body = await req.json();
    const { workspaceId, name, slug, logoUrl, actorId } = body;

    if (!workspaceId) {
      // If workspaceId is not specified, pick the active/first workspace
      const defaultWorkspace = await prisma.workspace.findFirst();
      if (!defaultWorkspace) {
        return NextResponse.json(
          { success: false, error: "No workspace available to update" },
          { status: 404 }
        );
      }

      const updated = await prisma.workspace.update({
        where: { id: defaultWorkspace.id },
        data: {
          name: name ? name.trim() : defaultWorkspace.name,
          slug: slug ? slug.trim().toLowerCase() : defaultWorkspace.slug,
          logoUrl: logoUrl !== undefined ? logoUrl : defaultWorkspace.logoUrl,
        },
      });

      return NextResponse.json({
        success: true,
        data: updated,
        message: "Workspace settings updated successfully",
      });
    }

    const existing = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Check slug collision if slug is changing
    if (slug && slug !== existing.slug) {
      const slugCollision = await prisma.workspace.findUnique({
        where: { slug: slug.trim().toLowerCase() },
      });
      if (slugCollision) {
        return NextResponse.json(
          { success: false, error: "Workspace slug is already in use by another workspace" },
          { status: 409 }
        );
      }
    }

    const updated = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        name: name ? name.trim() : existing.name,
        slug: slug ? slug.trim().toLowerCase() : existing.slug,
        logoUrl: logoUrl !== undefined ? logoUrl : existing.logoUrl,
      },
    });

    // Record audit log
    try {
      await prisma.auditLog.create({
        data: {
          workspaceId: existing.id,
          actorId: actorId || existing.ownerId,
          action: "WORKSPACE_SETTINGS_UPDATE",
          target: `Updated workspace "${updated.name}" settings`,
        },
      });
    } catch (auditError) {
      console.warn("Audit log creation skipped:", auditError);
    }

    return NextResponse.json({
      success: true,
      data: updated,
      message: "Workspace settings updated successfully",
    });
  } catch (error: any) {
    console.error("PUT /api/workspaces/settings error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update workspace settings",
        message: error?.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}
