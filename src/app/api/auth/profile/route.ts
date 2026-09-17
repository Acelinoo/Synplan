import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { applyRateLimit, apiRateLimiter } from "@/lib/rateLimit";
import { validateRequestBody } from "@/lib/validation/apiValidator";
import { UpdateUserProfileSchema } from "@/lib/validation/schemas";
import { createApiErrorResponse } from "@/lib/apiErrors";

// Helper to extract session token from request
function extractSessionToken(req: NextRequest): string | undefined {
  let token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    }
  }
  if (!token) {
    token = req.headers.get("x-synplan-session-token") || undefined;
  }
  return token;
}

// GET /api/auth/profile - Fetch authenticated user profile and security metadata
export async function GET(req: NextRequest) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const token = extractSessionToken(req);
    if (!token) {
      return NextResponse.json(
        { success: false, authenticated: false, error: "No active session found" },
        { status: 401 }
      );
    }

    const sessionRes = await validateSessionToken(token);
    if (!sessionRes || !sessionRes.user) {
      return NextResponse.json(
        { success: false, authenticated: false, error: "Session expired or invalid" },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: sessionRes.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        accounts: {
          select: {
            id: true,
            provider: true,
            createdAt: true,
            // Strictly exclude tokens/secrets
          },
        },
        sessions: {
          where: { expiresAt: { gt: new Date() } },
          select: {
            id: true,
            sessionToken: true,
            expiresAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Not Found", message: "User not found" },
        { status: 404 }
      );
    }

    // Mask session tokens for secure client representation
    const maskedSessions = user.sessions.map((s) => ({
      id: s.id,
      tokenSnippet: s.sessionToken.substring(0, 8) + "..." + s.sessionToken.slice(-4),
      isCurrent: s.sessionToken === token,
      expiresAt: s.expiresAt,
      createdAt: s.createdAt,
    }));

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        accounts: user.accounts,
        activeSessions: maskedSessions,
      },
    }, { headers: rateLimit.rateLimitHeaders });
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to retrieve user profile");
  }
}

// PATCH /api/auth/profile - Update authenticated user name and avatar
export async function PATCH(req: NextRequest) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const token = extractSessionToken(req);
    if (!token) {
      return NextResponse.json(
        { success: false, authenticated: false, error: "No active session found" },
        { status: 401 }
      );
    }

    const sessionRes = await validateSessionToken(token);
    if (!sessionRes || !sessionRes.user) {
      return NextResponse.json(
        { success: false, authenticated: false, error: "Session expired or invalid" },
        { status: 401 }
      );
    }

    const validation = await validateRequestBody(req, UpdateUserProfileSchema);
    if (validation.errorResponse) return validation.errorResponse;

    const { name, avatarUrl } = validation.data;

    // Persist user profile updates
    const updated = await prisma.user.update({
      where: { id: sessionRes.user.id },
      data: {
        name: name !== undefined ? name.trim() : undefined,
        avatarUrl: avatarUrl !== undefined ? avatarUrl : undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Record audit log if workspace context is present
    const headerWsId = req.headers.get("x-synplan-workspace-id");
    if (headerWsId) {
      try {
        await prisma.auditLog.create({
          data: {
            workspaceId: headerWsId,
            actorId: sessionRes.user.id,
            action: "USER_PROFILE_UPDATE",
            target: `Updated profile for "${updated.name}"`,
            entityType: "USER",
            entityId: updated.id,
            after: { name: updated.name, avatarUrl: updated.avatarUrl },
          },
        });
      } catch (auditError) {
        console.warn("Audit log creation skipped:", auditError);
      }
    }

    return NextResponse.json({
      success: true,
      data: updated,
      message: "Profile updated successfully",
    }, { headers: rateLimit.rateLimitHeaders });
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to update user profile");
  }
}
