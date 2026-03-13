import { NextResponse, type NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/types/api-responses";
import { requireAdmin } from "@/server/auth/guards";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import { prisma } from "@/server/db/client";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/agents/[id]/reset — Force agent status to IDLE.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    requireAdmin(request.headers);
    const { id } = await params;

    const existing = await prisma.agent.findUnique({ where: { id } });
    if (existing === null) {
      return NextResponse.json(
        errorResponse("NOT_FOUND", "Agent not found"),
        { status: 404 }
      );
    }

    const previousStatus = existing.status;

    const agent = await prisma.agent.update({
      where: { id },
      data: { status: "IDLE", currentTask: null },
    });

    await prisma.auditLog.create({
      data: {
        action: "agent.admin_reset",
        entityType: "Agent",
        entityId: id,
        payload: { previousStatus },
      },
    });

    return NextResponse.json(successResponse(agent), { status: 200 });
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
