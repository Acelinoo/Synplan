import { NextResponse } from "next/server";
import { logger, LogContext } from "./logger";

export interface ApiErrorOptions {
  status?: number;
  message?: string;
  code?: string;
  validationErrors?: Record<string, string[]>;
  headers?: Record<string, string>;
  requestId?: string;
  context?: LogContext;
}

/**
 * Creates a sanitized, production-safe API error response.
 * Prevents leaking internal database schemas, stack traces, or credentials.
 * Includes request correlation ID and structured error logging.
 */
export function createApiErrorResponse(
  error: unknown,
  fallbackMessage: string = "An unexpected error occurred",
  options?: ApiErrorOptions
): NextResponse {
  const status = options?.status || 500;
  const isProduction = process.env.NODE_ENV === "production";
  const requestId = options?.requestId || options?.context?.requestId || `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Log error using structured logger with sensitive information redacted
  const logContext: LogContext = {
    requestId,
    ...options?.context,
  };

  if (status >= 500) {
    logger.error(`[API Server Error ${status}]: ${fallbackMessage}`, logContext, error);
  } else {
    logger.warn(`[API Client Error ${status}]: ${fallbackMessage}`, logContext, error);
  }

  const clientMessage = options?.message || sanitizeErrorMessage(error, fallbackMessage);

  const responseHeaders = {
    "x-request-id": requestId,
    ...(options?.headers || {}),
  };

  return NextResponse.json(
    {
      success: false,
      error: getStandardErrorTitle(status),
      message: clientMessage,
      code: options?.code,
      requestId,
      validationErrors: options?.validationErrors,
    },
    {
      status,
      headers: responseHeaders,
    }
  );
}

export function sanitizeErrorMessage(error: unknown, fallbackMessage: string = "An unexpected error occurred"): string {
  const isProduction = process.env.NODE_ENV === "production";
  let clientMessage = error instanceof Error && !isProduction ? error.message : fallbackMessage;

  if (typeof clientMessage === "string") {
    const isDbInternalLeak =
      clientMessage.toLowerCase().includes("prisma") ||
      clientMessage.toLowerCase().includes("prismaclient") ||
      clientMessage.includes("SELECT") ||
      clientMessage.includes("DATABASE_URL") ||
      clientMessage.includes("postgresql://") ||
      clientMessage.toLowerCase().includes("supersecret") ||
      clientMessage.toLowerCase().includes("relation") ||
      clientMessage.toLowerCase().includes("foreign key") ||
      clientMessage.includes("findMany") ||
      clientMessage.includes("findUnique") ||
      clientMessage.includes("column");

    if (isDbInternalLeak) {
      clientMessage = "A database operation failed. Please try again later.";
    }
  }

  return clientMessage;
}

function getStandardErrorTitle(status: number): string {
  switch (status) {
    case 400:
      return "Bad Request";
    case 401:
      return "Unauthorized";
    case 403:
      return "Forbidden";
    case 404:
      return "Not Found";
    case 409:
      return "Conflict";
    case 422:
      return "Unprocessable Entity";
    case 429:
      return "Too Many Requests";
    case 500:
    default:
      return "Internal Server Error";
  }
}
