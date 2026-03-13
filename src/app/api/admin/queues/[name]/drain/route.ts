import { NextResponse, type NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/types/api-responses";
import { requireAdmin } from "@/server/auth/guards";
import {
  webhookQueue,
  agentTaskQueue,
  notificationQueue,
  expirationQueue,
  knowledgeExtractionQueue,
  QUEUE_NAMES,
} from "@/server/queues/index";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import type { Queue } from "bullmq";

type RouteParams = { params: Promise<{ name: string }> };

const queueMap: Record<string, Queue<unknown>> = {
  [QUEUE_NAMES.WEBHOOK_PROCESSING]: webhookQueue as Queue<unknown>,
  [QUEUE_NAMES.AGENT_TASKS]: agentTaskQueue as Queue<unknown>,
  [QUEUE_NAMES.NOTIFICATIONS]: notificationQueue as Queue<unknown>,
  [QUEUE_NAMES.EXPIRATION_CHECKS]: expirationQueue as Queue<unknown>,
  [QUEUE_NAMES.KNOWLEDGE_EXTRACTION]: knowledgeExtractionQueue as Queue<unknown>,
};

/**
 * POST /api/admin/queues/[name]/drain — Drain all waiting jobs from a queue.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    requireAdmin(request.headers);
    const { name } = await params;

    const queue = queueMap[name];
    if (queue === undefined) {
      return NextResponse.json(
        errorResponse("NOT_FOUND", `Queue "${name}" not found`),
        { status: 404 }
      );
    }

    await queue.drain();

    return NextResponse.json(
      successResponse({ name, drained: true }),
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        errorResponse("AUTHENTICATION_ERROR", error.message),
        { status: 401 }
      );
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        errorResponse("AUTHORIZATION_ERROR", error.message),
        { status: 403 }
      );
    }
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(
      errorResponse("INTERNAL_ERROR", message),
      { status: 500 }
    );
  }
}
