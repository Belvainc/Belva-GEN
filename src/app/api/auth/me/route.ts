import { NextResponse, type NextRequest } from "next/server";
import type { ApiResponse } from "@/types/api-responses";
import { successResponse, errorResponse } from "@/types/api-responses";
import { requireAuth } from "@/server/auth/guards";
import { getUserById } from "@/server/services/user.service";
import type { UserResponse } from "@/types/auth";
import { AuthenticationError } from "@/lib/errors";

/**
 * GET /api/auth/me — Return current authenticated user.
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResponse<UserResponse>>> {
  try {
    const auth = requireAuth(request.headers);
    const user = await getUserById(auth.userId);

    return NextResponse.json(successResponse(user), { status: 200 });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        errorResponse("AUTHENTICATION_ERROR", error.message),
        { status: 401 }
      );
    }
    return NextResponse.json(
      errorResponse("INTERNAL_ERROR", "An unexpected error occurred"),
      { status: 500 }
    );
  }
}
