import { NextResponse, type NextRequest } from "next/server";
import type { ApiResponse } from "@/types/api-responses";
import { successResponse, errorResponse } from "@/types/api-responses";
import {
  listEntries,
  type PaginatedResult,
} from "@/server/services/knowledge/knowledge-store";
import type { KnowledgeEntry, KnowledgeCategory, KnowledgeStatus } from "@prisma/client";
import {
  createRequestContext,
  runWithRequestContext,
} from "@/server/config/request-context";

const VALID_CATEGORIES = new Set(["PATTERN", "GOTCHA", "DECISION", "OPTIMIZATION"]);
const VALID_STATUSES = new Set(["DRAFT", "VALIDATED", "PROMOTED", "ARCHIVED"]);

/**
 * GET /api/knowledge — List knowledge entries with optional filters.
 *
 * Query params:
 * - category: PATTERN | GOTCHA | DECISION | OPTIMIZATION
 * - status: DRAFT | VALIDATED | PROMOTED | ARCHIVED
 * - cursor: pagination cursor
 * - limit: page size (default 20, max 100)
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResponse<PaginatedResult<KnowledgeEntry>>>> {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const ctx = createRequestContext(requestId);

  return runWithRequestContext(ctx, async () => {
    try {
      const params = request.nextUrl.searchParams;
      const cursor = params.get("cursor") ?? undefined;
      const limit = Math.min(
        parseInt(params.get("limit") ?? "20", 10),
        100
      );

      const categoryParam = params.get("category");
      const statusParam = params.get("status");

      const category =
        categoryParam !== null && VALID_CATEGORIES.has(categoryParam)
          ? (categoryParam as KnowledgeCategory)
          : undefined;

      const status =
        statusParam !== null && VALID_STATUSES.has(statusParam)
          ? (statusParam as KnowledgeStatus)
          : undefined;

      const result = await listEntries(
        { category, status },
        { cursor, limit }
      );

      return NextResponse.json(successResponse(result));
    } catch {
      return NextResponse.json(
        errorResponse("INTERNAL_ERROR", "Failed to fetch knowledge entries"),
        { status: 500 }
      );
    }
  });
}
