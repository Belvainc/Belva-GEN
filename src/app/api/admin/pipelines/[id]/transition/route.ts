import { NextResponse, type NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/types/api-responses";
import { requireAdmin } from "@/server/auth/guards";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import { prisma } from "@/server/db/client";

type RouteParams = { params: Promise<{ id: string }> };

const VALID_STATUSES = [
  "FUNNEL",
  "REFINEMENT",
  "APPROVED",
  "IN_PROGRESS",
  "REVIEW",
  "DONE",
] as const;

type PipelineStatusValue = (typeof VALID_STATUSES)[number];

function isValidStatus(value: unknown): value is PipelineStatusValue {
  return (
    typeof value === "string" &&
    VALID_STATUSES.includes(value as PipelineStatusValue)
  );
}

/**
 * POST /api/admin/pipelines/[id]/transition — Force a pipeline status transition.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    requireAdmin(request.headers);
    const { id } = await params;

    const body = (await request.json()) as Record<string, unknown>;
    const { targetStatus } = body;

    if (!isValidStatus(targetStatus)) {
      return NextResponse.json(
        errorResponse(
          "VALIDATION_ERROR",
          `Invalid targetStatus. Must be one of: ${VALID_STATUSES.join(", ")}`
        ),
        { status: 400 }
      );
    }

    const existing = await prisma.pipeline.findUnique({ where: { id } });
    if (existing === null) {
      return NextResponse.json(
        errorResponse("NOT_FOUND", "Pipeline not found"),
        { status: 404 }
      );
    }

    const oldStatus = existing.status;

    const pipeline = await prisma.pipeline.update({
      where: { id },
      data: { status: targetStatus },
    });

    await prisma.auditLog.create({
      data: {
        action: "pipeline.admin_transition",
        entityType: "Pipeline",
        entityId: id,
        payload: { from: oldStatus, to: targetStatus },
      },
    });

    return NextResponse.json(successResponse(pipeline), { status: 200 });
  } catch (error) {
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
    return NextResponse.json(
      errorResponse("INTERNAL_ERROR", "An unexpected error occurred"),
      { status: 500 }
    );
  }
}
