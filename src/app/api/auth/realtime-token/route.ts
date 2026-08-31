import { NextRequest, NextResponse } from "next/server";
import { requireAuthGuard } from "@/lib/authGuard";
import { prisma } from "@/lib/prisma";
import { applyRateLimit, authRateLimiter } from "@/lib/rateLimit";
import { createApiErrorResponse } from "@/lib/apiErrors";

/**
 * GET /api/auth/realtime-token
 * Issues short-lived Realtime Authorization tokens scoped to the authenticated user's
 * verified workspace memberships. Prevents cross-tenant channel subscription hijacking.
 */
export async function GET(req: NextRequest) {
  try {
    const rateLimit = applyRateLimit(req, authRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { auth, errorResponse } = await requireAuthGuard(req, "workspace.view");
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // 1. Query all active workspaces this user is an authorized member of
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: auth.userId },
      select: {
        workspaceId: true,
        role: true,
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    const allowedWorkspaces = memberships.map((m) => m.workspaceId);

    // 2. Build token payload with 1-hour expiration
    const tokenPayload = {
      sub: auth.userId,
      email: auth.user.email,
      name: auth.user.name,
      workspaces: allowedWorkspaces,
      activeWorkspaceId: auth.workspaceId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    };

    return NextResponse.json({
      success: true,
      data: {
        userId: auth.userId,
        activeWorkspaceId: auth.workspaceId,
        allowedWorkspaces,
        token: Buffer.from(JSON.stringify(tokenPayload)).toString("base64"),
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      },
    }, { headers: rateLimit.rateLimitHeaders });
  } catch (err: any) {
    return createApiErrorResponse(err, "Could not generate realtime token");
  }
}
