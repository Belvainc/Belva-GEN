import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import type { ApiResponse } from "@/types/api-responses";
import { successResponse, errorResponse } from "@/types/api-responses";
import { refreshToken } from "@/server/services/auth.service";

const AUTH_COOKIE = "auth-token";

/**
 * Get the JWT signing secret (same logic as proxy.ts).
 */
function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (secret === undefined || secret.length < 32) {
    return new TextEncoder().encode(
      "dev-jwt-secret-must-be-at-least-32-characters"
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * POST /api/auth/refresh — Refresh the JWT if session is still valid.
 * Resets idle timeout and issues a new token.
 *
 * This endpoint is in PUBLIC_PATHS (no middleware auth) so it can handle
 * expired JWTs. It reads the cookie directly and allows up to 24h of
 * clock tolerance so that refresh works even after JWT expiry — the
 * Redis session (30-min idle / 24h absolute) is the real gate.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<{ refreshed: boolean }>>> {
  try {
    const token = request.cookies.get(AUTH_COOKIE)?.value;

    if (token === undefined) {
      return NextResponse.json(
        errorResponse("AUTHENTICATION_ERROR", "Authentication required"),
        { status: 401 }
      );
    }

    // Allow up to 24h clock tolerance so refresh works after JWT expiry.
    // The Redis session check is the real validation gate.
    let userId: string;
    let role: string;
    let sessionId: string;

    try {
      const result = await jwtVerify(token, getSecret(), {
        issuer: "belva-gen",
        clockTolerance: 24 * 60 * 60, // 24 hours
      });

      const p = result.payload;
      if (
        typeof p.userId !== "string" ||
        typeof p.role !== "string" ||
        typeof p.sessionId !== "string"
      ) {
        return clearCookieResponse("Invalid token claims");
      }

      userId = p.userId;
      role = p.role;
      sessionId = p.sessionId;
    } catch {
      return clearCookieResponse("Invalid or expired token");
    }

    const newToken = await refreshToken(sessionId, userId, role);

    if (newToken === null) {
      return clearCookieResponse("Session has expired");
    }

    const response = NextResponse.json(
      successResponse({ refreshed: true }),
      { status: 200 }
    );

    response.cookies.set(AUTH_COOKIE, newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60, // 1 hour
    });

    return response;
  } catch {
    return NextResponse.json(
      errorResponse("INTERNAL_ERROR", "An unexpected error occurred"),
      { status: 500 }
    );
  }
}

function clearCookieResponse(
  message: string
): NextResponse<ApiResponse<{ refreshed: boolean }>> {
  const response = NextResponse.json(
    errorResponse("SESSION_EXPIRED", message),
    { status: 401 }
  );

  response.cookies.set(AUTH_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
