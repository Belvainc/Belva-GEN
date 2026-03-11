import { type ZodSchema, ZodError } from "zod";
import { ValidationError } from "./errors";

/**
 * Parse data with a Zod schema, throwing a ValidationError on failure.
 * Use this instead of bare schema.parse() for consistent error handling.
 */
export function parseOrThrow<T>(schema: ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const details: Record<string, unknown> = {
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
          code: issue.code,
        })),
      };
      throw new ValidationError(
        `Validation failed: ${error.issues.map((i) => i.message).join(", ")}`,
        details
      );
    }
    throw error;
  }
}

/**
 * Safely parse data with a Zod schema, returning a discriminated result.
 * Use this when you want to handle validation failures without exceptions.
 */
export function safeParse<T>(
  schema: ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: ValidationError } {
  try {
    const parsed = parseOrThrow(schema, data);
    return { success: true, data: parsed };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { success: false, error };
    }
    throw error;
  }
}
