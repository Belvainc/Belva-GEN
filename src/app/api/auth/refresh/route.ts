import { NextResponse, type NextRequest } from "next/server";
import type { ApiResponse } from "@/types/api-responses";
import { successResponse, errorResponse } from "@/types/api-responses";
import { getAuthFromHeaders } from "@/server/auth/middleware-helpers";
import { refreshToken } from "@/server/services/auth.service";

/**
 * POST /api/auth/refresh — Refresh the JWT if session is still valid.
 * Resets idle timeout and issues a new token.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<{ refreshed: boolean }>>> {
  try {
    const auth = getAuthFromHeaders(request.headers);

    if (auth === null) {
      return NextResponse.json(
        errorResponse("AUTHENTICATION_ERROR", "Authentication required"),
        { status: 401 }
      );
    }

    const newToken = await refreshToken(auth.sessionId, auth.userId, auth.role);

    if (newToken === null) {
      const response = NextResponse.json(
        errorResponse("SESSION_EXPIRED", "Session has expired"),
        { status: 401 }
      );

      // Clear stale cookie
      response.cookies.set("auth-token", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });

      return response;
    }

    const response = NextResponse.json(
      successResponse({ refreshed: true }),
      { status: 200 }
    );

    // Set new token cookie
    response.cookies.set("auth-token", newToken, {
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
