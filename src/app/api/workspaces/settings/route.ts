import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";

// PUT /api/workspaces/settings - Update workspace configuration & settings
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { workspaceId, name, slug, logoUrl, actorId } = body;

    let targetWorkspaceId = workspaceId;
    if (!targetWorkspaceId) {
      const headerWsId = req.headers.get("x-synplan-workspace-id");
      if (headerWsId) targetWorkspaceId = headerWsId;
    }

    if (!targetWorkspaceId) {
      return NextResponse.json(
        { success: false, error: "workspaceId is required to update settings" },
        { status: 400 }
      );
    }

    // 1. Resolve target workspace first
    const existing = await prisma.workspace.findUnique({
      where: { id: targetWorkspaceId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Workspace not found" },
        { status: 404 }
      );
    }

    // 2. Strict Permission Guard: workspace.update on this specific workspace
    const { auth, errorResponse } = await requireAuthGuard(req, "workspace.update", existing.id);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // 3. IDOR / Tenant Boundary Verification
    if (auth.workspaceId !== existing.id) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You cannot modify another workspace's settings" },
        { status: 403 }
      );
    }

    // 4. Check slug collision if slug is changing
    if (slug && slug !== existing.slug) {
      const slugCollision = await prisma.workspace.findUnique({
        where: { slug: slug.trim().toLowerCase() },
      });
      if (slugCollision && slugCollision.id !== existing.id) {
        return NextResponse.json(
          { success: false, error: "Workspace slug is already in use by another workspace" },
          { status: 409 }
        );
      }
    }

    const updated = await prisma.workspace.update({
      where: { id: existing.id },
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
          actorId: auth.userId || actorId || existing.ownerId,
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
