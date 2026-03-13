import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { successResponse, errorResponse } from "@/types/api-responses";
import { requireAdmin } from "@/server/auth/guards";
import { resetCircuitBreaker } from "@/server/lib/circuit-breaker-registry";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";

const ResetRequestSchema = z.object({
  name: z.string().min(1),
});

/**
 * POST /api/admin/system-health/circuit-breakers — Reset a circuit breaker.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    requireAdmin(request.headers);

    const body: unknown = await request.json();
    const parsed = ResetRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        errorResponse("VALIDATION_ERROR", "Invalid request body", {
          issues: parsed.error.issues,
        }),
        { status: 400 }
      );
    }

    const { name } = parsed.data;
    const wasReset = resetCircuitBreaker(name);

    if (!wasReset) {
      return NextResponse.json(
        errorResponse("NOT_FOUND", `Circuit breaker "${name}" not found`),
        { status: 404 }
      );
    }

    return NextResponse.json(
      successResponse({ name, reset: true }),
      { status: 200 }
    );
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
