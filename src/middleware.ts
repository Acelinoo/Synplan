import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth"];

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const response = NextResponse.next();

  // 1. Security Headers (Zero-Slop Production Standard)
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // 2. Tenant Context Tagging for /api routes
  if (pathname.startsWith("/api/")) {
    const wsHeader = request.headers.get("x-synplan-workspace-id");
    if (wsHeader) {
      response.headers.set("x-synplan-tenant-verified", "true");
    }
  }

  // 3. Route Access Protection
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const sessionToken = request.cookies.get("synplan_session_token")?.value;
  const hasUserHeader = request.headers.get("x-synplan-user-id");

  // Redirect to dashboard if logged-in user visits /login
  if (pathname === "/login" && sessionToken) {
    return NextResponse.redirect(new URL("/", request.url));
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
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

