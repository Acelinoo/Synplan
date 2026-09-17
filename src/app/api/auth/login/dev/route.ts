import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, getSessionCookieOptions } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  try {
    // 1. Find the primary owner or first user in the database
    let user = await prisma.user.findFirst({
      where: { role: "OWNER" },
      orderBy: { createdAt: "asc" },
    });

    if (!user) {
      user = await prisma.user.findFirst({
        orderBy: { createdAt: "asc" },
      });
    }

    if (!user) {
      return NextResponse.json(
        { success: false, error: "No users found in database. Please run npx prisma db seed first." },
        { status: 404 }
      );
    }

    // 2. Create a persistent session in the active database
    const { sessionToken } = await createSession(user.id);

    // 3. Set session cookie and redirect to home dashboard
    const response = NextResponse.redirect(new URL("/", req.url));
    const cookieOptions = getSessionCookieOptions();

    response.cookies.set({
      ...cookieOptions,
      value: sessionToken,
    });

    return response;
  } catch (error: any) {
    console.error("GET /api/auth/login/dev error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to initialize dev session" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
