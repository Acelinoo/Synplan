import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/api/auth"];

/**
 * Enterprise Production Security & Authentication Middleware for Synplan
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // 1. Comprehensive Security Headers & Content-Security-Policy
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  const isProduction = process.env.NODE_ENV === "production";
  const cspHeader = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${isProduction ? "" : "'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data: https:",
    "connect-src 'self' https: wss: ws:",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ]
    .filter(Boolean)
    .join("; ");

  response.headers.set("Content-Security-Policy", cspHeader);

  // 2. CSRF & Origin Verification on State-Changing API Mutations
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth")) {
    const method = request.method.toUpperCase();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      const origin = request.headers.get("origin");
      const host = request.headers.get("host");

      if (origin && host) {
        try {
          const originHost = new URL(origin).host;
          if (originHost !== host) {
            return NextResponse.json(
              {
                success: false,
                error: "Forbidden",
                message: "CSRF check failed: Origin does not match Host.",
              },
              { status: 403 }
            );
          }
        } catch (e) {
          return NextResponse.json(
            {
              success: false,
              error: "Forbidden",
              message: "Invalid Origin header provided.",
            },
            { status: 403 }
          );
        }
      }
    }
  }

  // 3. Route Access & Authentication Protection
  const isPublic = PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const sessionToken = request.cookies.get("synplan_session_token")?.value;

  // Case A: Authenticated user visiting /login -> Redirect to dashboard unless force/expired/error is set
  const isForceLogin =
    request.nextUrl.searchParams.get("force") === "true" ||
    request.nextUrl.searchParams.get("expired") === "true" ||
    Boolean(request.nextUrl.searchParams.get("error"));

  if (pathname === "/login" && sessionToken && !isForceLogin) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Case B: Unauthenticated user visiting protected UI routes -> Redirect to /login
  if (!isPublic && !pathname.startsWith("/api/")) {
    if (!sessionToken) {
      const loginUrl = new URL("/login", request.url);
      if (pathname !== "/") {
        loginUrl.searchParams.set("returnTo", pathname);
      }
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public asset files (.svg, .png, .jpg, etc)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
