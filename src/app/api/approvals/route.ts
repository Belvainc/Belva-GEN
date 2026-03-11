import { NextResponse } from "next/server";
import type { ApiResponse } from "@/types/api-responses";
import { successResponse } from "@/types/api-responses";
import type { HumanApprovalRequest } from "@/types/agent-protocol";

/**
 * GET /api/approvals — List pending plan approvals.
 */
export async function GET(): Promise<
  NextResponse<ApiResponse<HumanApprovalRequest[]>>
> {
  // TODO: Connect to orchestrator to fetch pending approvals
  const approvals: HumanApprovalRequest[] = [];
  return NextResponse.json(successResponse(approvals));
}
