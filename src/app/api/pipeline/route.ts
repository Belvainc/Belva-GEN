import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { ApiResponse } from "@/types/api-responses";
import { successResponse } from "@/types/api-responses";
import { getServerContext } from "@/server/context";
import {
  getAllEpics,
  getEpicsByState,
  type EpicSummary,
} from "@/server/services/pipeline.service";
import type { EpicState } from "@/server/orchestrator/types";
import {
  createRequestContext,
  runWithRequestContext,
} from "@/server/config/request-context";

const VALID_STATES = new Set<EpicState>([
  "funnel",
  "refinement",
  "approved",
  "in-progress",
  "review",
  "done",
]);

/**
 * GET /api/pipeline — Get current pipeline state with all epics.
 * Optional query param: ?state=funnel|refinement|approved|in-progress|review|done
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResponse<EpicSummary[]>>> {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const ctx = createRequestContext(requestId);

  return runWithRequestContext(ctx, () => {
    const serverContext = getServerContext();
    const deps = { engine: serverContext.engine };

    const stateParam = request.nextUrl.searchParams.get("state");

    if (stateParam && VALID_STATES.has(stateParam as EpicState)) {
      const epics = getEpicsByState(deps, stateParam as EpicState);
      return NextResponse.json(successResponse(epics));
    }

    const epics = getAllEpics(deps);
    return NextResponse.json(successResponse(epics));
  });
}
