import { NextResponse, type NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/types/api-responses";
import { requireAdmin } from "@/server/auth/guards";
import { getSystemHealth } from "@/server/services/health.service";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";

/**
 * GET /api/admin/system-health — Get system health status.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    requireAdmin(request.headers);

    const health = await getSystemHealth();
    return NextResponse.json(successResponse(health), { status: 200 });
  } catch (error: unknown) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        errorResponse("AUTHENTICATION_ERROR", error.message),
        { status: 401 }
      );
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        errorResponse("AUTHORIZATION_ERROR", error.message),
        { status: 403 }
      );
    }
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(
      errorResponse("INTERNAL_ERROR", message),
      { status: 500 }
    );
  }
}
