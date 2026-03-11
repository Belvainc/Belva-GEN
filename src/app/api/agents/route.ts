import { NextResponse } from "next/server";
import type { ApiResponse } from "@/types/api-responses";
import { successResponse } from "@/types/api-responses";
import type { AgentStatus } from "@/server/agents/types";

/**
 * GET /api/agents — List all agents and their current statuses.
 */
export async function GET(): Promise<NextResponse<ApiResponse<AgentStatus[]>>> {
  // TODO: Connect to AgentRegistry singleton
  const statuses: AgentStatus[] = [];
  return NextResponse.json(successResponse(statuses));
}
