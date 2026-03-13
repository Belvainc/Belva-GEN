import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// ─── Next.js Middleware ──────────────────────────────────────────────────────
// Runs on every matched request before hitting route handlers.
// Handles: request IDs, security headers, JWT auth, route protection.
// Note: Uses `jose` for JWT verification (Edge Runtime compatible).

const AUTH_COOKIE = "auth-token";

// Public paths that don't require authentication
const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/health",
]);

// Paths that start with these prefixes are always public
const PUBLIC_PREFIXES = [
  "/_next/",
  "/favicon.ico",
  "/sitemap.xml",
  "/robots.txt",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (secret === undefined || secret.length < 32) {
    // Fallback for development — matches the default in env.ts
    return new TextEncoder().encode(
      "dev-jwt-secret-must-be-at-least-32-characters"
    );
  }
  return new TextEncoder().encode(secret);
}

export async function proxy(
  request: NextRequest
): Promise<NextResponse> {
  const requestId =
    request.headers.get("x-request-id") ?? crypto.randomUUID();
  const { pathname } = request.nextUrl;

  // ─── Public paths: no auth required ────────────────────────────────────
  if (isPublicPath(pathname)) {
    return addSecurityHeaders(NextResponse.next(), requestId);
  }

  // ─── Verify JWT ────────────────────────────────────────────────────────
  const token = request.cookies.get(AUTH_COOKIE)?.value;

  if (token === undefined) {
    return handleUnauthenticated(request, requestId);
  }

  let payload: { userId: string; role: string; sessionId: string };

  try {
    const result = await jwtVerify(token, getSecret(), {
      issuer: "belva-gen",
    });

    const userId = result.payload.userId;
    const role = result.payload.role;
    const sessionId = result.payload.sessionId;

    if (
      typeof userId !== "string" ||
      typeof role !== "string" ||
      typeof sessionId !== "string"
    ) {
      return handleUnauthenticated(request, requestId);
    }

    payload = { userId, role, sessionId };
  } catch {
    return handleUnauthenticated(request, requestId);
  }

  // ─── Admin-only route protection ───────────────────────────────────────
  if (pathname.startsWith("/admin") && payload.role !== "ADMIN") {
    if (isApiRoute(pathname)) {
      return addSecurityHeaders(
        NextResponse.json(
          { success: false, error: { code: "FORBIDDEN", message: "Admin access required" } },
          { status: 403 }
        ),
        requestId
      );
    }
    // Redirect non-admin users to dashboard
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // ─── Inject auth context into request headers for downstream handlers ──
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-user-id", payload.userId);
  requestHeaders.set("x-user-role", payload.role);
  requestHeaders.set("x-session-id", payload.sessionId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  return addSecurityHeaders(response, requestId);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function handleUnauthenticated(
  request: NextRequest,
  requestId: string
): NextResponse {
  const { pathname } = request.nextUrl;

  if (isApiRoute(pathname)) {
    return addSecurityHeaders(
      NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      ),
      requestId
    );
  }

  // Redirect to login with return URL
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("returnTo", pathname);
  return NextResponse.redirect(loginUrl);
}

function addSecurityHeaders(
  response: NextResponse,
  requestId: string
): NextResponse {
  response.headers.set("x-request-id", requestId);
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("x-xss-protection", "1; mode=block");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=()"
  );
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
