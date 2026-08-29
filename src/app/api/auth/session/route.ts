import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  try {
    // 1. Extract session token from cookie or header
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

    if (!token) {
      return NextResponse.json(
        { success: false, authenticated: false, error: "No active session found" },
        { status: 401 }
      );
    }

    // 2. Validate session in database
    const sessionRes = await validateSessionToken(token);
    if (!sessionRes) {
      return NextResponse.json(
        { success: false, authenticated: false, error: "Session expired or invalid" },
        { status: 401 }
      );
    }

    const { user } = sessionRes;

    // 3. Fetch user's workspaces
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: user.id },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    const workspaces = memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      logoUrl: m.workspace.logoUrl,
      role: m.role,
    }));

    return NextResponse.json({
      success: true,
      authenticated: true,
      user,
      workspaces,
    });
  } catch (error: any) {
    console.error("GET /api/auth/session error:", error);
    return NextResponse.json(
      { success: false, authenticated: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
