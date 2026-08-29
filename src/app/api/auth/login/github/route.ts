import { NextRequest, NextResponse } from "next/server";
import { generateOAuthState, getGitHubAuthorizationUrl } from "@/lib/auth/oauth";
import { OAUTH_STATE_COOKIE_NAME } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        new URL("/login?error=github_not_configured", req.url)
      );
    }

    const state = generateOAuthState();
    const authUrl = getGitHubAuthorizationUrl(state);

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
    console.error("GET /api/auth/login/github error:", error);
    return NextResponse.redirect(
      new URL("/login?error=oauth_init_failed", req.url)
    );
  }
}
