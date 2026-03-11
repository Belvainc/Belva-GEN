import { NextResponse } from "next/server";
import type { ApiResponse } from "@/types/api-responses";
import { successResponse } from "@/types/api-responses";
import type { EpicContext } from "@/server/orchestrator/types";

/**
 * GET /api/pipeline — Get current pipeline state with all epics.
 */
export async function GET(): Promise<
  NextResponse<ApiResponse<EpicContext[]>>
> {
  // TODO: Connect to OrchestratorEngine singleton
  const epics: EpicContext[] = [];
  return NextResponse.json(successResponse(epics));
}
