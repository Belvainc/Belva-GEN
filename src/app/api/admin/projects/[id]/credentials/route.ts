import { NextResponse, type NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/types/api-responses";
import { requireAdmin } from "@/server/auth/guards";
import { AuthorizationError } from "@/lib/errors";
import { prisma } from "@/server/db/client";
import { setCredential } from "@/server/services/project.service";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/projects/[id]/credentials — List credential keys (values are never exposed).
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    requireAdmin(request.headers);
    const { id } = await params;

    const credentials = await prisma.projectCredential.findMany({
      where: { projectId: id },
      select: { id: true, key: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json(successResponse(credentials), { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        errorResponse("AUTHORIZATION_ERROR", error.message),
        { status: 403 }
      );
    }
    const message = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(errorResponse("INTERNAL_ERROR", message), { status: 500 });
  }
}

/**
 * POST /api/admin/projects/[id]/credentials — Set (create or update) a credential.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    requireAdmin(request.headers);
    const { id } = await params;

    const body = (await request.json()) as Record<string, unknown>;
    const key = typeof body.key === "string" ? body.key.trim() : "";
    const value = typeof body.value === "string" ? body.value : "";

    if (key === "" || value === "") {
      return NextResponse.json(
        errorResponse("VALIDATION_ERROR", "Both key and value are required"),
        { status: 400 }
      );
    }

    await setCredential(id, key, value);

    return NextResponse.json(
      successResponse({ message: "Credential saved" }),
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        errorResponse("AUTHORIZATION_ERROR", error.message),
        { status: 403 }
      );
    }
    const message = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(errorResponse("INTERNAL_ERROR", message), { status: 500 });
  }
}

/**
 * DELETE /api/admin/projects/[id]/credentials?key=xxx — Remove a credential.
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    requireAdmin(request.headers);
    const { id } = await params;

    const url = new URL(request.url);
    const key = url.searchParams.get("key") ?? "";

    if (key === "") {
      return NextResponse.json(
        errorResponse("VALIDATION_ERROR", "Query parameter 'key' is required"),
        { status: 400 }
      );
    }

    await prisma.projectCredential.delete({
      where: { projectId_key: { projectId: id, key } },
    });

    return NextResponse.json(
      successResponse({ message: "Credential deleted" }),
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        errorResponse("AUTHORIZATION_ERROR", error.message),
        { status: 403 }
      );
    }
    const message = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(errorResponse("INTERNAL_ERROR", message), { status: 500 });
  }
}
