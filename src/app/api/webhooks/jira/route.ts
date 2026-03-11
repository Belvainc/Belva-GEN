import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { ApiResponse } from "@/types/api-responses";
import { successResponse, errorResponse } from "@/types/api-responses";
import { JiraWebhookPayloadSchema } from "@/server/mcp/jira/schemas";
import { safeParse } from "@/lib/validation";
import { logger } from "@/lib/logger";

/**
 * POST /api/webhooks/jira — Receive and process Jira webhook events.
 * Validates the payload with Zod before forwarding to the orchestrator.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<{ received: boolean }>>> {
  const body: unknown = await request.json();

  const result = safeParse(JiraWebhookPayloadSchema, body);

  if (!result.success) {
    logger.error("Invalid Jira webhook payload", {
      error: result.error.message,
    });
    return NextResponse.json(
      errorResponse("VALIDATION_ERROR", "Invalid webhook payload"),
      { status: 400 }
    );
  }

  const payload = result.data;
  logger.info(`Received Jira webhook: ${payload.webhookEvent}`, {
    issueKey: payload.issue.key,
  });

  // TODO: Forward validated payload to OrchestratorEngine.handleEvent()

  return NextResponse.json(successResponse({ received: true }));
}
