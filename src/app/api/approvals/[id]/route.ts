import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { ApiResponse } from "@/types/api-responses";
import { successResponse, errorResponse } from "@/types/api-responses";
import { HumanApprovalResponseSchema } from "@/types/agent-protocol";
import type { HumanApprovalResponse } from "@/types/agent-protocol";
import { safeParse } from "@/lib/validation";
import { getServerContext } from "@/server/context";
import {
  approveRequest,
  rejectRequest,
  requestRevision,
} from "@/server/services/approval.service";
import { NotFoundError } from "@/lib/errors";
import type { Approval } from "@prisma/client";
import {
  createRequestContext,
  runWithRequestContext,
} from "@/server/config/request-context";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/approvals/[id] — Update a specific approval decision.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse<ApiResponse<HumanApprovalResponse | Approval>>> {
  const { id } = await context.params;
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const ctx = createRequestContext(requestId);

  return runWithRequestContext(ctx, async () => {
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

    const serverContext = getServerContext();
    const deps = { engine: serverContext.engine };
    const { decision, reviewerIdentity, comment } = result.data;

    try {
      let approval: Approval;

      switch (decision) {
        case "approved":
          approval = await approveRequest(
            deps,
            id,
            reviewerIdentity,
            "", // planHash not in schema yet
            comment
          );
          break;
        case "rejected":
          approval = await rejectRequest(
            deps,
            id,
            reviewerIdentity,
            comment ?? "No reason provided"
          );
          break;
        case "revision-requested":
          approval = await requestRevision(
            deps,
            id,
            reviewerIdentity,
            comment ?? "No feedback provided"
          );
          break;
      }

      return NextResponse.json(successResponse(approval));
    } catch (error) {
      if (error instanceof NotFoundError) {
        return NextResponse.json(
          errorResponse(error.code, error.message),
          { status: 404 }
        );
      }
      return NextResponse.json(
        errorResponse("INTERNAL_ERROR", "Failed to process approval"),
        { status: 500 }
      );
    }
  });
}
