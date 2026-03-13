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
 * GET /api/admin/queues/[name] — Get queue detail with failed jobs.
 */
export async function GET(
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

    const [counts, failedJobs] = await Promise.all([
      queue.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
      queue.getFailed(0, 25),
    ]);

    const serializedFailed = failedJobs.map((job) => ({
      id: job.id ?? "unknown",
      name: job.name,
      failedReason: job.failedReason ?? "Unknown error",
      timestamp: job.timestamp,
    }));

    return NextResponse.json(
      successResponse({
        name,
        counts: {
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
        },
        failedJobs: serializedFailed,
      }),
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
