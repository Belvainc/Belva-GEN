import { NextResponse, type NextRequest } from "next/server";
import type { ApiResponse } from "@/types/api-responses";
import { successResponse, errorResponse } from "@/types/api-responses";
import { CreateProjectSchema } from "@/types/project";
import { requireAuth, requireAdmin } from "@/server/auth/guards";
import {
  createProject,
  listProjects,
} from "@/server/services/project.service";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";

/**
 * GET /api/projects — List projects accessible to the current user.
 * Admins see all projects; users see only assigned projects.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = requireAuth(request.headers);
    const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get("limit") ?? "20", 10),
      100
    );

    // Admins see all projects, users see only their assigned ones
    const userId = auth.role === "ADMIN" ? undefined : auth.userId;
    const result = await listProjects({ cursor, limit }, userId);

    return NextResponse.json(successResponse(result), { status: 200 });
  } catch (error) {
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
 * POST /api/projects — Create a new project. Admin-only.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<unknown>>> {
  try {
    requireAdmin(request.headers);

    const body: unknown = await request.json();
    const parsed = CreateProjectSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        errorResponse("VALIDATION_ERROR", "Invalid request body", {
          issues: parsed.error.issues,
        }),
        { status: 400 }
      );
    }

    const project = await createProject(parsed.data);
    return NextResponse.json(successResponse(project), { status: 201 });
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
