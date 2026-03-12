import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { ApiResponse } from "@/types/api-responses";
import { successResponse, errorResponse } from "@/types/api-responses";
import { JiraWebhookPayloadSchema } from "@/server/mcp/jira/schemas";
import { safeParse } from "@/lib/validation";
import { logger } from "@/lib/logger";
import { verifyWebhookSignature } from "@/server/lib/webhook-auth";
import { webhookQueue } from "@/server/queues";

/**
 * POST /api/webhooks/jira — Receive and process Jira webhook events.
 * 
 * Processing order:
 * 1. Read raw body (needed for HMAC verification)
 * 2. Verify signature if present (optional - Jira Cloud doesn't send HMAC by default)
 * 3. Parse JSON
 * 4. Validate with Zod
 * 5. Enqueue to BullMQ for async processing
 * 6. Return 200 immediately (queue-first pattern)
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<{ received: boolean }>>> {
  // 1. Read raw body first (required for HMAC verification)
  const rawBody = await request.text();

  // 2. Verify signature if header is present
  // Jira Cloud webhooks don't include HMAC by default, so this is optional.
  // If you configure webhook signing or use Atlassian Connect, the header will be present.
  const signature = request.headers.get("x-hub-signature-256");
  if (signature !== null) {
    // Strip "sha256=" prefix if present
    const signatureValue = signature.startsWith("sha256=")
      ? signature.slice(7)
      : signature;

    if (!verifyWebhookSignature(rawBody, signatureValue)) {
      logger.warn("Invalid Jira webhook signature");
      return NextResponse.json(
        errorResponse("UNAUTHORIZED", "Invalid webhook signature"),
        { status: 401 }
      );
    }
  }

  // 3. Parse JSON
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    logger.error("Invalid JSON in Jira webhook payload");
    return NextResponse.json(
      errorResponse("VALIDATION_ERROR", "Invalid JSON payload"),
      { status: 400 }
    );
  }

  // 4. Validate with Zod
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

  // 5. Enqueue to BullMQ for async processing (queue-first pattern)
  await webhookQueue.add("jira-event", {
    source: "jira",
    payload: result.data,
    receivedAt: new Date().toISOString(),
    signature: signature ?? undefined,
  });

  logger.info(`Enqueued Jira webhook for processing`, {
    issueKey: payload.issue.key,
    event: payload.webhookEvent,
  });

  // 6. Return 200 immediately
  return NextResponse.json(successResponse({ received: true }));
}
