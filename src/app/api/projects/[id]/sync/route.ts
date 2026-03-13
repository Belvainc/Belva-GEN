import { NextResponse, type NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/types/api-responses";
import { requireProjectAccess } from "@/server/auth/guards";
import { syncJiraTickets } from "@/server/workers";
import { prisma } from "@/server/db/client";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";

/** Minimum interval between manual syncs (1 minute). */
const SYNC_COOLDOWN_MS = 60 * 1000;

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/projects/[id]/sync — Trigger a Jira sync for this project.
 * Requires project membership. Respects a 1-minute cooldown.
 */
export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { id: projectId } = await context.params;
    await requireProjectAccess(request.headers, projectId);

    // Check cooldown for this specific project
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { lastJiraSyncAt: true, jiraProjectKey: true },
    });

    if (project === null) {
      return NextResponse.json(
        errorResponse("NOT_FOUND", "Project not found"),
        { status: 404 }
      );
    }

    if (project.jiraProjectKey === null) {
      return NextResponse.json(
        errorResponse("BAD_REQUEST", "Project has no Jira project configured"),
        { status: 400 }
      );
    }

    if (
      project.lastJiraSyncAt !== null &&
      Date.now() - project.lastJiraSyncAt.getTime() < SYNC_COOLDOWN_MS
    ) {
      return NextResponse.json(
        errorResponse(
          "RATE_LIMITED",
          "Sync was run less than 1 minute ago. Please wait before trying again."
        ),
        { status: 429 }
      );
    }

    const result = await syncJiraTickets(projectId);
    return NextResponse.json(successResponse(result), { status: 200 });
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
