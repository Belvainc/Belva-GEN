import { NextResponse, type NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/types/api-responses";
import { AssignUserSchema } from "@/types/project";
import { requireAdmin } from "@/server/auth/guards";
import {
  assignUser,
  removeUser,
  listProjectUsers,
} from "@/server/services/project.service";
import { AuthorizationError } from "@/lib/errors";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/users — List users assigned to a project.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    requireAdmin(request.headers);
    const { id } = await params;
    const users = await listProjectUsers(id);
    return NextResponse.json(successResponse(users), { status: 200 });
  } catch (error) {
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
 * POST /api/projects/[id]/users — Assign a user to a project. Admin-only.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    requireAdmin(request.headers);
    const { id } = await params;

    const body: unknown = await request.json();
    const parsed = AssignUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        errorResponse("VALIDATION_ERROR", "Invalid request body", {
          issues: parsed.error.issues,
        }),
        { status: 400 }
      );
    }

    await assignUser(id, parsed.data.userId);
    return NextResponse.json(
      successResponse({ message: "User assigned to project" }),
      { status: 201 }
    );
  } catch (error) {
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
 * DELETE /api/projects/[id]/users — Remove a user from a project. Admin-only.
 * Pass userId as query param: ?userId=xxx
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    requireAdmin(request.headers);
    const { id } = await params;
    const userId = request.nextUrl.searchParams.get("userId");

    if (userId === null) {
      return NextResponse.json(
        errorResponse("VALIDATION_ERROR", "userId query parameter is required"),
        { status: 400 }
      );
    }

    await removeUser(id, userId);
    return NextResponse.json(
      successResponse({ message: "User removed from project" }),
      { status: 200 }
    );
  } catch (error) {
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
