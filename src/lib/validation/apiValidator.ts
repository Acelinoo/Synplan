import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";

export interface ValidationSuccess<T> {
  data: T;
  errorResponse?: never;
}

export interface ValidationFailure {
  data?: never;
  errorResponse: NextResponse;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

/**
 * Safely parses and validates a JSON request body against a Zod schema.
 * Rejects malformed JSON, invalid schemas, and unexpected structural formats with standardized 400 Bad Request.
 */
export async function validateRequestBody<T>(
  req: NextRequest,
  schema: z.ZodSchema<T>
): Promise<ValidationResult<T>> {
  let body: unknown;

  try {
    const text = await req.text();
    if (!text || text.trim() === "") {
      body = {};
    } else {
      body = JSON.parse(text);
    }
  } catch (parseErr: any) {
    return {
      errorResponse: NextResponse.json(
        {
          success: false,
          error: "Invalid JSON Format",
          message: "Request payload must be valid JSON.",
        },
        { status: 400 }
      ),
    };
  }

  const result = schema.safeParse(body);

  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    const issues = result.error.issues || (result.error as any).errors || [];
    const firstErrorMessage = issues[0]?.message || "Validation failed";

    for (const err of issues) {
      const path = Array.isArray(err.path) ? err.path.join(".") : "root";
      const fieldKey = path || "root";
      if (!fieldErrors[fieldKey]) {
        fieldErrors[fieldKey] = [];
      }
      fieldErrors[fieldKey].push(err.message);
    }

    return {
      errorResponse: NextResponse.json(
        {
          success: false,
          error: "Validation Error",
          message: firstErrorMessage,
          validationErrors: fieldErrors,
        },
        { status: 400 }
      ),
    };
  }

  return { data: result.data };
}

/**
 * Safely parses query parameters from a NextRequest URL against a Zod schema.
 */
export function validateQueryParams<T>(
  req: NextRequest,
  schema: z.ZodSchema<T>
): ValidationResult<T> {
  const { searchParams } = new URL(req.url);
  const queryObj: Record<string, any> = {};

  for (const [key, value] of searchParams.entries()) {
    queryObj[key] = value;
  }

  const result = schema.safeParse(queryObj);

  if (!result.success) {
    const issues = result.error.issues || (result.error as any).errors || [];
    const firstErrorMessage = issues[0]?.message || "Invalid query parameters";
    return {
      errorResponse: NextResponse.json(
        {
          success: false,
          error: "Invalid Query Parameters",
          message: firstErrorMessage,
        },
        { status: 400 }
      ),
    };
  }

  return { data: result.data };
}
