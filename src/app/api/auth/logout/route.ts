import { NextRequest, NextResponse } from "next/server";
import { invalidateSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  try {
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
      await invalidateSession(token);
    }

    const response = NextResponse.json({
      success: true,
      message: "Logged out successfully",
    });

    // Clear session cookie
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error: any) {
    console.error("POST /api/auth/logout error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to logout cleanly" },
      { status: 500 }
    );
  }
}
