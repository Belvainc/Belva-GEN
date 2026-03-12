import { NextResponse, type NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/types/api-responses";
import { requireAdmin } from "@/server/auth/guards";
import {
  getModelConfig,
  listRecords,
  createRecord,
} from "@/server/admin/registry";
import { hashPassword } from "@/server/auth/password";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";

type RouteParams = { params: Promise<{ model: string }> };

/**
 * GET /api/admin/[model] — List records with pagination, sort, and search.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    requireAdmin(request.headers);
    const { model } = await params;

    const config = getModelConfig(model);
    if (config === undefined) {
      return NextResponse.json(
        errorResponse("NOT_FOUND", `Model "${model}" not found`),
        { status: 404 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const result = await listRecords(model, {
      page: Math.max(1, parseInt(searchParams.get("page") ?? "1", 10)),
      limit: Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "25", 10))),
      sort: searchParams.get("sort") ?? undefined,
      direction: (searchParams.get("direction") ?? undefined) as "asc" | "desc" | undefined,
      search: searchParams.get("search") ?? undefined,
    });

    return NextResponse.json(successResponse(result), { status: 200 });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(errorResponse("AUTHENTICATION_ERROR", error.message), { status: 401 });
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json(errorResponse("AUTHORIZATION_ERROR", error.message), { status: 403 });
    }
    return NextResponse.json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred"), { status: 500 });
  }
}

/**
 * POST /api/admin/[model] — Create a new record.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    requireAdmin(request.headers);
    const { model } = await params;

    const config = getModelConfig(model);
    if (config === undefined) {
      return NextResponse.json(
        errorResponse("NOT_FOUND", `Model "${model}" not found`),
        { status: 404 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;

    // Special handling for users: hash password
    if (model === "users" && typeof body.password === "string") {
      body.passwordHash = await hashPassword(body.password);
      delete body.password;
      // Normalize email
      if (typeof body.email === "string") {
        body.email = body.email.toLowerCase();
      }
    }

    const record = await createRecord(model, body);
    return NextResponse.json(successResponse(record), { status: 201 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(errorResponse("AUTHORIZATION_ERROR", error.message), { status: 403 });
    }
    const message = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(errorResponse("INTERNAL_ERROR", message), { status: 500 });
  }
}
