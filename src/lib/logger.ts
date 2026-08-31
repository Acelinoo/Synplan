/**
 * Structured Production Logger for Synplan (Phase 4 Reliability Engine)
 * Features:
 * - Structured JSON logging for serverless/cloud observability
 * - Automatic sensitive field masking & credential redaction
 * - Request correlation ID support
 * - Log levels: DEBUG, INFO, WARN, ERROR
 */

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogContext {
  requestId?: string;
  workspaceId?: string;
  userId?: string;
  actorRole?: string;
  ipAddress?: string;
  path?: string;
  method?: string;
  [key: string]: unknown;
}

const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "sessiontoken",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "secret",
  "authorization",
  "cookie",
  "supabase_service_role_key",
  "next_public_supabase_anon_key",
  "apikey",
  "privatekey",
]);

/**
 * Recursively redacts sensitive keys from log objects.
 */
export function sanitizeLogData(data: unknown, depth = 0): unknown {
  if (depth > 5) return "[Max Depth Reached]";
  if (data === null || data === undefined) return data;
  
  if (typeof data === "string") {
    // Redact Bearer tokens and connection strings in plain text
    return data
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
      .replace(/postgres(?:ql)?:\/\/[^@]+@/gi, "postgresql://[REDACTED]@");
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogData(item, depth + 1));
  }

  if (typeof data === "object") {
    if (data instanceof Error) {
      return {
        name: data.name,
        message: data.message,
        stack: process.env.NODE_ENV === "production" ? undefined : data.stack,
      };
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes("password") || lowerKey.includes("secret")) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = sanitizeLogData(value, depth + 1);
      }
    }
    return sanitized;
  }

  return data;
}

class Logger {
  private formatLog(level: LogLevel, message: string, context?: LogContext, data?: unknown): string {
    const timestamp = new Date().toISOString();
    const sanitizedContext = context ? sanitizeLogData(context) : undefined;
    const sanitizedData = data !== undefined ? sanitizeLogData(data) : undefined;

    const logEntry = {
      timestamp,
      level,
      message,
      ...(sanitizedContext ? { context: sanitizedContext } : {}),
      ...(sanitizedData !== undefined ? { data: sanitizedData } : {}),
    };

    return JSON.stringify(logEntry);
  }

  info(message: string, context?: LogContext, data?: unknown): void {
    console.log(this.formatLog("INFO", message, context, data));
  }

  warn(message: string, context?: LogContext, data?: unknown): void {
    console.warn(this.formatLog("WARN", message, context, data));
  }

  error(message: string, context?: LogContext, error?: unknown): void {
    console.error(this.formatLog("ERROR", message, context, error));
  }

  debug(message: string, context?: LogContext, data?: unknown): void {
    if (process.env.NODE_ENV !== "production") {
      console.debug(this.formatLog("DEBUG", message, context, data));
    }
  }
}

export const logger = new Logger();
