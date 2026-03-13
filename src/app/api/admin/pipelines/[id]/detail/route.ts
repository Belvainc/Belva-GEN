import { NextResponse, type NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/types/api-responses";
import { requireAdmin } from "@/server/auth/guards";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import { prisma } from "@/server/db/client";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/pipelines/[id]/detail — Fetch full pipeline with relations.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    requireAdmin(request.headers);
    const { id } = await params;

    const pipeline = await prisma.pipeline.findUnique({
      where: { id },
      include: {
        stages: { orderBy: { order: "asc" }, include: { agent: true } },
        approvals: { orderBy: { createdAt: "desc" } },
        decomposition: true,
        project: { select: { name: true, slug: true } },
      },
    });

    if (pipeline === null) {
      return NextResponse.json(
        errorResponse("NOT_FOUND", "Pipeline not found"),
        { status: 404 }
      );
    }

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
