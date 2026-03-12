import { NextResponse, type NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/types/api-responses";
import { requireAdmin } from "@/server/auth/guards";
import {
  getModelConfig,
  getRecord,
  updateRecord,
  deleteRecord,
} from "@/server/admin/registry";
import { hashPassword } from "@/server/auth/password";
import { AuthorizationError } from "@/lib/errors";

type RouteParams = { params: Promise<{ model: string; id: string }> };

/**
 * GET /api/admin/[model]/[id] — Get a single record.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    requireAdmin(request.headers);
    const { model, id } = await params;

    const config = getModelConfig(model);
    if (config === undefined) {
      return NextResponse.json(
        errorResponse("NOT_FOUND", `Model "${model}" not found`),
        { status: 404 }
      );
    }

    const record = await getRecord(model, id);
    if (record === null) {
      return NextResponse.json(
        errorResponse("NOT_FOUND", `${config.name} not found`),
        { status: 404 }
      );
    }

    return NextResponse.json(successResponse(record), { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(errorResponse("AUTHORIZATION_ERROR", error.message), { status: 403 });
    }
    return NextResponse.json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred"), { status: 500 });
  }
}

/**
 * PATCH /api/admin/[model]/[id] — Update a record.
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    requireAdmin(request.headers);
    const { model, id } = await params;

    const config = getModelConfig(model);
    if (config === undefined) {
      return NextResponse.json(
        errorResponse("NOT_FOUND", `Model "${model}" not found`),
        { status: 404 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;

    // Special handling for users: hash password if provided
    if (model === "users" && typeof body.password === "string") {
      body.passwordHash = await hashPassword(body.password);
      delete body.password;
    }

    // Remove read-only fields
    for (const col of config.columns) {
      if (col.readOnly === true) {
        delete body[col.key];
      }
    }

    const record = await updateRecord(model, id, body);
    return NextResponse.json(successResponse(record), { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(errorResponse("AUTHORIZATION_ERROR", error.message), { status: 403 });
    }
    const message = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(errorResponse("INTERNAL_ERROR", message), { status: 500 });
  }
}

/**
 * DELETE /api/admin/[model]/[id] — Delete a record.
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    requireAdmin(request.headers);
    const { model, id } = await params;

    const config = getModelConfig(model);
    if (config === undefined) {
      return NextResponse.json(
        errorResponse("NOT_FOUND", `Model "${model}" not found`),
        { status: 404 }
      );
    }

    await deleteRecord(model, id);
    return NextResponse.json(
      successResponse({ message: `${config.name} deleted` }),
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(errorResponse("AUTHORIZATION_ERROR", error.message), { status: 403 });
    }
    const message = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(errorResponse("INTERNAL_ERROR", message), { status: 500 });
  }
}
