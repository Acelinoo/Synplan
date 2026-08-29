import { NextRequest, NextResponse } from "next/server";
import { generateOAuthState, getGoogleAuthorizationUrl } from "@/lib/auth/oauth";
import { OAUTH_STATE_COOKIE_NAME } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        new URL("/login?error=google_not_configured", req.url)
      );
    }

    const state = generateOAuthState();
    const authUrl = getGoogleAuthorizationUrl(state);

    const response = NextResponse.redirect(authUrl);

    // Store state in secure HttpOnly cookie for CSRF verification in callback
    response.cookies.set({
      name: OAUTH_STATE_COOKIE_NAME,
      value: state,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60, // 10 minutes
    });

    return response;
  } catch (error: any) {
    console.error("GET /api/auth/login/google error:", error);
    return NextResponse.redirect(
      new URL("/login?error=oauth_init_failed", req.url)
    );
  }
}
