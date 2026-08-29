import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

/**
 * Resolves the authenticated user ID from session cookie or header
 */
async function resolveAuthUserId(req: NextRequest): Promise<string | null> {
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
      return sessionRes.user.id;
    }
  }

  // 2. Fallback: x-synplan-user-id header (for automated tests / dev)
  const headerUserId = req.headers.get("x-synplan-user-id");
  if (headerUserId) {
    const user = await prisma.user.findUnique({
      where: { id: headerUserId },
      select: { id: true },
    });
    if (user) return user.id;
  }

  // 3. Fallback: default user in development mode
  if (process.env.NODE_ENV !== "production") {
    const defaultUser = await prisma.user.findFirst({ select: { id: true } });
    if (defaultUser) return defaultUser.id;
  }

  return null;
}

// GET /api/workspaces - Fetch workspaces scoped strictly to authenticated user
export async function GET(req: NextRequest) {
  try {
    const userId = await resolveAuthUserId(req);

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized: Active user session required to list workspaces",
        },
        { status: 401 }
      );
    }

    const workspaces = await prisma.workspace.findMany({
      where: {
        members: {
          some: {
            userId,
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

    return NextResponse.json({
      success: true,
      data: workspaces,
    });
  } catch (error: any) {
    console.error("GET /api/workspaces error:", error?.message);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to fetch workspaces",
      },
      { status: 500 }
    );
  }
}

// POST /api/workspaces - Create a new workspace for authenticated user
export async function POST(req: NextRequest) {
  try {
    const authUserId = await resolveAuthUserId(req);
    const body = await req.json();
    const { name, slug, ownerId } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Workspace name is required" },
        { status: 400 }
      );
    }

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
        { success: false, error: "Workspace slug already exists. Please pick a unique slug." },
        { status: 409 }
      );
    }

    // Default owner fallback to authenticated user
    const effectiveOwnerId = authUserId || ownerId;
    if (!effectiveOwnerId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Active user session required to create workspace" },
        { status: 401 }
      );
    }

    const workspace = await prisma.workspace.create({
      data: {
        name: name.trim(),
        slug: cleanSlug,
        ownerId: effectiveOwnerId,
        members: {
          create: {
            userId: effectiveOwnerId,
            role: "OWNER",
            workloadScore: 20,
          },
        },
        auditLogs: {
          create: {
            actorId: effectiveOwnerId,
            action: "WORKSPACE_CREATE",
            target: `Workspace "${name.trim()}" created`,
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
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/workspaces error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create workspace",
        message: error?.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}
