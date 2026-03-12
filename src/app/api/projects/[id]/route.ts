import { NextResponse, type NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/types/api-responses";
import { UpdateProjectSchema } from "@/types/project";
import { requireAuth, requireAdmin } from "@/server/auth/guards";
import {
  getProjectById,
  updateProject,
  deleteProject,
} from "@/server/services/project.service";
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
} from "@/lib/errors";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id] — Get a single project.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    requireAuth(request.headers);
    const { id } = await params;
    const project = await getProjectById(id);
    return NextResponse.json(successResponse(project), { status: 200 });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        errorResponse("NOT_FOUND", error.message),
        { status: 404 }
      );
    }
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        errorResponse("AUTHENTICATION_ERROR", error.message),
        { status: 401 }
      );
    }
    return NextResponse.json(
      errorResponse("INTERNAL_ERROR", "An unexpected error occurred"),
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/projects/[id] — Update a project. Admin-only.
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    requireAdmin(request.headers);
    const { id } = await params;

    const body: unknown = await request.json();
    const parsed = UpdateProjectSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        errorResponse("VALIDATION_ERROR", "Invalid request body", {
          issues: parsed.error.issues,
        }),
        { status: 400 }
      );
    }

    const project = await updateProject(id, parsed.data);
    return NextResponse.json(successResponse(project), { status: 200 });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        errorResponse("NOT_FOUND", error.message),
        { status: 404 }
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

/**
 * DELETE /api/projects/[id] — Delete a project. Admin-only.
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    requireAdmin(request.headers);
    const { id } = await params;
    await deleteProject(id);
    return NextResponse.json(
      successResponse({ message: "Project deleted" }),
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        errorResponse("NOT_FOUND", error.message),
        { status: 404 }
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
