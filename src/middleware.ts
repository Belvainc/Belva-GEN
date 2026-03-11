import { NextResponse, type NextRequest } from "next/server";

// ─── Next.js Middleware ──────────────────────────────────────────────────────
// Runs on every matched request before hitting route handlers.
// Adds request IDs, security headers, and basic CORS.
// Note: Uses Web Crypto API (not node:crypto) for Edge Runtime compatibility.

export function middleware(request: NextRequest): NextResponse {
  const requestId =
    request.headers.get("x-request-id") ?? crypto.randomUUID();

  const response = NextResponse.next();

  // ─── Request ID ──────────────────────────────────────────────────────────
  response.headers.set("x-request-id", requestId);

  // ─── Security Headers ────────────────────────────────────────────────────
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("x-xss-protection", "1; mode=block");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=()"
  );

  // CSP — restrictive by default, allow self and inline styles for Tailwind
  response.headers.set(
    "content-security-policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join("; ")
  );

  return response;
}

// ─── Matcher ─────────────────────────────────────────────────────────────────
// Run middleware on all routes except static files and Next.js internals.

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
