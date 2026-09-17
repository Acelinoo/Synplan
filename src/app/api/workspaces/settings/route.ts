import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { applyRateLimit, apiRateLimiter } from "@/lib/rateLimit";
import { validateRequestBody } from "@/lib/validation/apiValidator";
import { UpdateWorkspaceSettingsSchema } from "@/lib/validation/schemas";
import { createApiErrorResponse } from "@/lib/apiErrors";

// GET /api/workspaces/settings - Retrieve workspace configuration & metadata
export async function GET(req: NextRequest) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { searchParams } = new URL(req.url);
    let targetWorkspaceId = searchParams.get("workspaceId");
    if (!targetWorkspaceId) {
      targetWorkspaceId = req.headers.get("x-synplan-workspace-id");
    }

    if (!targetWorkspaceId) {
      return NextResponse.json(
        { success: false, error: "Bad Request", message: "workspaceId is required" },
        { status: 400 }
      );
    }

    // Strict Permission Guard: workspace.view on target workspace
    const { auth, errorResponse } = await requireAuthGuard(req, "workspace.view", targetWorkspaceId);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: targetWorkspaceId },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: {
            members: true,
            projects: true,
            tasks: true,
          },
        },
      },
    });

    if (!workspace) {
      return NextResponse.json(
        { success: false, error: "Not Found", message: "Workspace not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        logoUrl: workspace.logoUrl,
        ownerId: workspace.ownerId,
        owner: workspace.owner,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
        counts: workspace._count,
        userRole: auth.role,
      },
    }, { headers: rateLimit.rateLimitHeaders });
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to retrieve workspace settings");
  }
}

// Internal update handler shared by PUT and PATCH
async function handleUpdate(req: NextRequest) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const validation = await validateRequestBody(req, UpdateWorkspaceSettingsSchema);
    if (validation.errorResponse) return validation.errorResponse;

    const { workspaceId, name, slug, logoUrl } = validation.data;

    let targetWorkspaceId: string | undefined = workspaceId;
    if (!targetWorkspaceId) {
      const { searchParams } = new URL(req.url);
      targetWorkspaceId = searchParams.get("workspaceId") || undefined;
    }
    if (!targetWorkspaceId) {
      const headerWsId = req.headers.get("x-synplan-workspace-id");
      if (headerWsId) targetWorkspaceId = headerWsId;
    }

    if (!targetWorkspaceId) {
      return NextResponse.json(
        { success: false, error: "Bad Request", message: "workspaceId is required to update settings" },
        { status: 400 }
      );
    }

    // 1. Resolve target workspace first
    const existing = await prisma.workspace.findUnique({
      where: { id: targetWorkspaceId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Not Found", message: "Workspace not found" },
        { status: 404 }
      );
    }

    // 2. Strict Permission Guard: workspace.update on this specific workspace
    const { auth, errorResponse } = await requireAuthGuard(req, "workspace.update", existing.id);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // 3. Check slug collision if slug is changing
    if (slug && slug !== existing.slug) {
      const slugCollision = await prisma.workspace.findUnique({
        where: { slug: slug.trim().toLowerCase() },
      });
      if (slugCollision && slugCollision.id !== existing.id) {
        return NextResponse.json(
          { success: false, error: "Conflict", message: "Workspace slug is already in use by another workspace" },
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

    // Record audit log with IP and entity metadata
    try {
      await prisma.auditLog.create({
        data: {
          workspaceId: existing.id,
          actorId: auth.userId,
          action: "WORKSPACE_SETTINGS_UPDATE",
          target: `Updated workspace "${updated.name}" settings`,
          entityType: "WORKSPACE",
          entityId: existing.id,
          before: { name: existing.name, slug: existing.slug, logoUrl: existing.logoUrl },
          after: { name: updated.name, slug: updated.slug, logoUrl: updated.logoUrl },
          ipAddress: auth.ipAddress,
        },
      });
    } catch (auditError) {
      console.warn("Audit log creation skipped:", auditError);
    }

    return NextResponse.json({
      success: true,
      data: updated,
      message: "Workspace settings updated successfully",
    }, { headers: rateLimit.rateLimitHeaders });
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to update workspace settings");
  }
}

// PUT /api/workspaces/settings
export async function PUT(req: NextRequest) {
  return handleUpdate(req);
}

// PATCH /api/workspaces/settings
export async function PATCH(req: NextRequest) {
  return handleUpdate(req);
}
