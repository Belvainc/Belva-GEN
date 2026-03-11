import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { ApiResponse } from "@/types/api-responses";
import { successResponse, errorResponse } from "@/types/api-responses";
import { HumanApprovalResponseSchema } from "@/types/agent-protocol";
import type { HumanApprovalResponse } from "@/types/agent-protocol";
import { safeParse } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/approvals/[id] — Update a specific approval decision.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse<ApiResponse<HumanApprovalResponse>>> {
  const { id } = await context.params;
  const body: unknown = await request.json();

  const parsed = typeof body === "object" && body !== null ? body : {};
  const result = safeParse(HumanApprovalResponseSchema, {
    ...(parsed as Record<string, unknown>),
    approvalRequestId: id,
  });

  if (!result.success) {
    return NextResponse.json(
      errorResponse("VALIDATION_ERROR", result.error.message),
      { status: 400 }
    );
  }

  // TODO: Forward approval response to orchestrator engine
  return NextResponse.json(successResponse(result.data));
}
