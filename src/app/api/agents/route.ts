import { NextResponse, type NextRequest } from "next/server";
import type { ApiResponse } from "@/types/api-responses";
import { successResponse, errorResponse } from "@/types/api-responses";
import { getServerContext } from "@/server/context";
import { getAllAgentStatuses, type AgentWithStatus } from "@/server/services/agent.service";
import {
  createRequestContext,
  runWithRequestContext,
} from "@/server/config/request-context";

/**
 * GET /api/agents — List all agents and their current statuses.
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResponse<AgentWithStatus[]>>> {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const ctx = createRequestContext(requestId);

  return runWithRequestContext(ctx, async () => {
    try {
      const context = getServerContext();
      const statuses = await getAllAgentStatuses({ registry: context.registry });
      return NextResponse.json(successResponse(statuses));
    } catch {
      return NextResponse.json(
        errorResponse("INTERNAL_ERROR", "Failed to fetch agent statuses"),
        { status: 500 }
      );
    }
  });
}
