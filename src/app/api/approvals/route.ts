import { NextResponse, type NextRequest } from "next/server";
import type { ApiResponse } from "@/types/api-responses";
import { successResponse, errorResponse } from "@/types/api-responses";
import { getServerContext } from "@/server/context";
import {
  getPendingApprovals,
  type PaginatedResult,
} from "@/server/services/approval.service";
import type { Approval } from "@prisma/client";
import {
  createRequestContext,
  runWithRequestContext,
} from "@/server/config/request-context";

/**
 * GET /api/approvals — List pending plan approvals.
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResponse<PaginatedResult<Approval>>>> {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const ctx = createRequestContext(requestId);

  return runWithRequestContext(ctx, async () => {
    try {
      const context = getServerContext();
      const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
      const limit = Math.min(
        parseInt(request.nextUrl.searchParams.get("limit") ?? "20", 10),
        100
      );

      const result = await getPendingApprovals(
        { engine: context.engine },
        { cursor, limit }
      );
      return NextResponse.json(successResponse(result));
    } catch {
      return NextResponse.json(
        errorResponse("INTERNAL_ERROR", "Failed to fetch approvals"),
        { status: 500 }
      );
    }
  });
}
