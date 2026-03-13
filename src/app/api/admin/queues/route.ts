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

interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

interface QueueSummary {
  name: string;
  counts: QueueCounts;
}

const queues = [
  { name: QUEUE_NAMES.WEBHOOK_PROCESSING, queue: webhookQueue },
  { name: QUEUE_NAMES.AGENT_TASKS, queue: agentTaskQueue },
  { name: QUEUE_NAMES.NOTIFICATIONS, queue: notificationQueue },
  { name: QUEUE_NAMES.EXPIRATION_CHECKS, queue: expirationQueue },
  { name: QUEUE_NAMES.KNOWLEDGE_EXTRACTION, queue: knowledgeExtractionQueue },
] as const;

/**
 * GET /api/admin/queues — Get job counts for all queues.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    requireAdmin(request.headers);

    const results: QueueSummary[] = await Promise.all(
      queues.map(async ({ name, queue }) => {
        const counts = await queue.getJobCounts(
          "waiting",
          "active",
          "completed",
          "failed",
          "delayed"
        );
        return {
          name,
          counts: {
            waiting: counts.waiting ?? 0,
            active: counts.active ?? 0,
            completed: counts.completed ?? 0,
            failed: counts.failed ?? 0,
            delayed: counts.delayed ?? 0,
          },
        };
      })
    );

    return NextResponse.json(successResponse(results), { status: 200 });
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
