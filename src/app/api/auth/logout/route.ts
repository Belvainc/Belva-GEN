import { NextResponse, type NextRequest } from "next/server";
import type { ApiResponse } from "@/types/api-responses";
import { successResponse, errorResponse } from "@/types/api-responses";
import { logout } from "@/server/services/auth.service";
import { getAuthFromHeaders } from "@/server/auth/middleware-helpers";
import {
  createRequestContext,
  runWithRequestContext,
} from "@/server/config/request-context";

/**
 * POST /api/auth/logout — Revoke session and clear auth cookie.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<{ message: string }>>> {
  const requestId =
    request.headers.get("x-request-id") ?? crypto.randomUUID();
  const ctx = createRequestContext(requestId);

  return runWithRequestContext(ctx, async () => {
    try {
      const auth = getAuthFromHeaders(request.headers);

      if (auth !== null) {
        await logout(auth.sessionId, auth.userId);
      }

      const response = NextResponse.json(
        successResponse({ message: "Logged out successfully" }),
        { status: 200 }
      );

      // Clear the auth cookie
      response.cookies.set("auth-token", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });

      return response;
    } catch {
      return NextResponse.json(
        errorResponse("INTERNAL_ERROR", "An unexpected error occurred"),
        { status: 500 }
      );
    }
  });
}
