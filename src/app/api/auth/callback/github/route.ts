import { NextRequest, NextResponse } from "next/server";
import { exchangeGitHubCode } from "@/lib/auth/oauth";
import { findOrCreateOAuthUser } from "@/lib/auth/user";
import {
  createSession,
  getSessionCookieOptions,
  OAUTH_STATE_COOKIE_NAME,
} from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // 1. Handle OAuth cancellation / error from GitHub
  if (error) {
    console.warn("GitHub OAuth callback error:", error, errorDescription);
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(errorDescription || error)}`, req.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", req.url));
  }

  // 2. Validate CSRF state against HttpOnly cookie
  const storedState = req.cookies.get(OAUTH_STATE_COOKIE_NAME)?.value;
  if (!state || !storedState || state !== storedState) {
    console.error("OAuth state mismatch: possible CSRF attempt.");
    return NextResponse.redirect(new URL("/login?error=invalid_state", req.url));
  }

  try {
    // 3. Exchange code for user profile
    const profile = await exchangeGitHubCode(code);

    // 4. Find or create Synplan user identity
    const { user } = await findOrCreateOAuthUser(profile);

    // 5. Create persistent database session
    const { sessionToken } = await createSession(user.id);

    // 6. Set session cookie and redirect to dashboard
    const response = NextResponse.redirect(new URL("/", req.url));
    const cookieOptions = getSessionCookieOptions();

    response.cookies.set({
      ...cookieOptions,
      value: sessionToken,
    });

    // Clear one-time OAuth state cookie
    response.cookies.delete(OAUTH_STATE_COOKIE_NAME);

    return response;
  } catch (err: any) {
    console.error("GitHub callback processing error:", err);
    const errorMessage = err?.message?.includes("not configured")
      ? "github_not_configured"
      : "oauth_exchange_failed";
    return NextResponse.redirect(new URL(`/login?error=${errorMessage}`, req.url));
  }
}
