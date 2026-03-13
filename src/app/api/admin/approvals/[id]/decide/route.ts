import { NextResponse, type NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/types/api-responses";
import { requireAdmin } from "@/server/auth/guards";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import { prisma } from "@/server/db/client";

type RouteParams = { params: Promise<{ id: string }> };

const VALID_DECISIONS = ["approved", "rejected", "revision-requested"] as const;
type DecisionValue = (typeof VALID_DECISIONS)[number];

function isValidDecision(value: unknown): value is DecisionValue {
  return (
    typeof value === "string" &&
    VALID_DECISIONS.includes(value as DecisionValue)
  );
}

/**
 * POST /api/admin/approvals/[id]/decide — Record an admin decision on an approval.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    requireAdmin(request.headers);
    const { id } = await params;

    const body = (await request.json()) as Record<string, unknown>;
    const { decision, reason } = body;

    if (!isValidDecision(decision)) {
      return NextResponse.json(
        errorResponse(
          "VALIDATION_ERROR",
          `Invalid decision. Must be one of: ${VALID_DECISIONS.join(", ")}`
        ),
        { status: 400 }
      );
    }

    const reasonStr =
      typeof reason === "string" && reason.length > 0 ? reason : undefined;

    const existing = await prisma.approval.findUnique({ where: { id } });
    if (existing === null) {
      return NextResponse.json(
        errorResponse("NOT_FOUND", "Approval not found"),
        { status: 404 }
      );
    }

    let approval: unknown;

    if (decision === "approved") {
      approval = await prisma.approval.update({
        where: { id },
        data: {
          status: "APPROVED",
          reason: reasonStr ?? existing.reason,
          decidedAt: new Date(),
        },
      });
    } else if (decision === "rejected") {
      approval = await prisma.approval.update({
        where: { id },
        data: {
          status: "REJECTED",
          reason: reasonStr ?? existing.reason,
          decidedAt: new Date(),
        },
      });
    } else {
      // revision-requested
      approval = await prisma.approval.update({
        where: { id },
        data: {
          reason: reasonStr ?? existing.reason,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        action: `approval.admin_${decision}`,
        entityType: "Approval",
        entityId: id,
        payload: {
          decision,
          reason: reasonStr ?? null,
          previousStatus: existing.status,
        },
      },
    });

    return NextResponse.json(successResponse(approval), { status: 200 });
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
