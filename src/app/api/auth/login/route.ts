import { NextResponse, type NextRequest } from "next/server";
import type { ApiResponse } from "@/types/api-responses";
import { successResponse, errorResponse } from "@/types/api-responses";
import { LoginRequestSchema, type LoginResponse } from "@/types/auth";
import { login } from "@/server/services/auth.service";
import { AuthenticationError } from "@/lib/errors";
import {
  createRequestContext,
  runWithRequestContext,
} from "@/server/config/request-context";

/**
 * POST /api/auth/login — Authenticate user and set auth cookie.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<LoginResponse>>> {
  const requestId =
    request.headers.get("x-request-id") ?? crypto.randomUUID();
  const ctx = createRequestContext(requestId);

  return runWithRequestContext(ctx, async () => {
    try {
      const body: unknown = await request.json();
      const parsed = LoginRequestSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          errorResponse("VALIDATION_ERROR", "Invalid request body", {
            issues: parsed.error.issues,
          }),
          { status: 400 }
        );
      }

      const { user, token } = await login(parsed.data.email, parsed.data.password);

      const response = NextResponse.json(
        successResponse({ user }),
        { status: 200 }
      );

      // Set httpOnly secure cookie with JWT
      response.cookies.set("auth-token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60, // 1 hour (matches JWT lifetime)
      });

      return response;
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
  });
}
