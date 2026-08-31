import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { applyRateLimit, apiRateLimiter, getClientIp } from "@/lib/rateLimit";
import { validateRequestBody } from "@/lib/validation/apiValidator";
import { CreateWorkspaceSchema } from "@/lib/validation/schemas";
import { createApiErrorResponse } from "@/lib/apiErrors";

/**
 * Resolves the authenticated user ID strictly from session cookie or Bearer header
 */
async function resolveAuthUserId(req: NextRequest): Promise<{ userId: string; ipAddress: string } | null> {
  const ipAddress = getClientIp(req);

  // 1. Session token from cookie, Authorization header, or x-synplan-session-token
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

  if (token) {
    const sessionRes = await validateSessionToken(token);
    if (sessionRes) {
      return { userId: sessionRes.user.id, ipAddress };
    }
  }

  // 2. Gated Test Mode Header Authentication (Strictly disabled in non-test env)
  const isTestEnv = process.env.NODE_ENV === "test" && process.env.ALLOW_TEST_HEADER_AUTH === "true";
  const headerUserId = req.headers.get("x-synplan-user-id");

  if (isTestEnv && headerUserId) {
    const user = await prisma.user.findUnique({
      where: { id: headerUserId },
      select: { id: true },
    });
    if (user) return { userId: user.id, ipAddress };
  }

  return null;
}

// GET /api/workspaces - Fetch workspaces scoped strictly to authenticated user
export async function GET(req: NextRequest) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const auth = await resolveAuthUserId(req);
    if (!auth) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
          message: "Active user session required to list workspaces",
        },
        { status: 401 }
      );
    }

    const workspaces = await prisma.workspace.findMany({
      where: {
        members: {
          some: {
            userId: auth.userId,
          },
        },
      },
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        projects: {
          select: { id: true, name: true, progress: true, status: true },
        },
        _count: {
          select: { projects: true, tasks: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const mappedWorkspaces = workspaces.map((w) => {
      const myMembership = w.members.find((m) => m.userId === auth.userId);
      const role = myMembership?.role || (w.ownerId === auth.userId ? "OWNER" : "MEMBER");
      return {
        ...w,
        role,
      };
    });

    return NextResponse.json({
      success: true,
      data: mappedWorkspaces,
    }, { headers: rateLimit.rateLimitHeaders });
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to fetch workspaces");
  }
}

// POST /api/workspaces - Create a new workspace for authenticated user
export async function POST(req: NextRequest) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const auth = await resolveAuthUserId(req);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: "Unauthorized", message: "Active user session required to create workspace" },
        { status: 401 }
      );
    }

    const validation = await validateRequestBody(req, CreateWorkspaceSchema);
    if (validation.errorResponse) return validation.errorResponse;

    const { name, slug } = validation.data;

    const cleanSlug = (slug || name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    // Check if slug is already taken
    const existingSlug = await prisma.workspace.findUnique({
      where: { slug: cleanSlug },
    });

    if (existingSlug) {
      return NextResponse.json(
        { success: false, error: "Conflict", message: "Workspace slug already exists. Please pick a unique slug." },
        { status: 409 }
      );
    }

    const workspace = await prisma.workspace.create({
      data: {
        name: name.trim(),
        slug: cleanSlug,
        ownerId: auth.userId,
        members: {
          create: {
            userId: auth.userId,
            role: "OWNER",
            workloadScore: 20,
          },
        },
        auditLogs: {
          create: {
            actorId: auth.userId,
            action: "WORKSPACE_CREATE",
            target: `Workspace "${name.trim()}" created`,
            ipAddress: auth.ipAddress,
          },
        },
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        members: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: workspace,
        message: "Workspace created successfully",
      },
      { status: 201, headers: rateLimit.rateLimitHeaders }
    );
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to create workspace");
  }
}
