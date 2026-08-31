import { prisma } from "./prisma";
import { logger } from "./logger";
import { sanitizeLogData } from "./logger";

export type ActorType = "USER" | "AI" | "SYSTEM";

export interface CreateAuditEntryOptions {
  workspaceId: string;
  actorId?: string | null;
  actorType?: ActorType;
  action: string;
  target?: string;
  entityType?: "task" | "project" | "phase" | "member" | "comment" | "workspace" | string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
  source?: string | null; // e.g. TASK_FORM, AI_ASSISTANT, SYSTEM_JOB, API, WEB
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Projects and sanitizes a snapshot of an entity before or after a mutation.
 * Guarantees that credentials/tokens are redacted and payload size is strictly bounded.
 */
export function sanitizeSnapshot(entityType: string | undefined, data: unknown): unknown {
  if (data === null || data === undefined) return null;
  if (typeof data !== "object") return data;

  // First step: recursive sensitive key redaction
  const sanitized = sanitizeLogData(data) as Record<string, any>;

  // Second step: entity projection
  let projected: Record<string, any> = {};

  const type = entityType?.toLowerCase();
  if (type === "task") {
    const fields = ["id", "title", "description", "status", "priority", "dueDate", "assigneeId", "projectId", "phaseId", "order", "tags"];
    for (const f of fields) {
      if (sanitized[f] !== undefined) projected[f] = sanitized[f];
    }
  } else if (type === "project") {
    const fields = ["id", "name", "description", "progress", "status", "deadline", "color", "totalTasks", "completedTasks"];
    for (const f of fields) {
      if (sanitized[f] !== undefined) projected[f] = sanitized[f];
    }
  } else if (type === "phase") {
    const fields = ["id", "projectId", "name", "description", "order"];
    for (const f of fields) {
      if (sanitized[f] !== undefined) projected[f] = sanitized[f];
    }
  } else if (type === "member") {
    const fields = ["id", "workspaceId", "userId", "role", "workloadScore", "email", "name"];
    for (const f of fields) {
      if (sanitized[f] !== undefined) projected[f] = sanitized[f];
    }
  } else if (type === "comment") {
    const fields = ["id", "taskId", "content", "authorId", "authorName"];
    for (const f of fields) {
      if (sanitized[f] !== undefined) projected[f] = sanitized[f];
    }
  } else {
    // Generic bounded projection
    projected = { ...sanitized };
  }

  // Bound string sizes (max 500 chars per text property)
  for (const [key, val] of Object.entries(projected)) {
    if (typeof val === "string" && val.length > 500) {
      projected[key] = val.substring(0, 500) + "… [truncated]";
    }
  }

  // Ensure overall JSON size does not exceed 4KB
  const str = JSON.stringify(projected);
  if (str.length > 4096) {
    return {
      _summary: "Snapshot truncated due to size limit",
      id: projected.id,
      name: projected.name || projected.title,
    };
  }

  return projected;
}

/**
 * Creates an immutable Audit Log record for data modifications and compliance.
 * Non-blocking: audit failure will NOT cause the parent mutation to rollback.
 */
export async function createAuditEntry(options: CreateAuditEntryOptions) {
  try {
    const {
      workspaceId,
      actorId,
      actorType = "USER",
      action,
      target = "",
      entityType,
      entityId,
      before,
      after,
      requestId,
      source = "API",
      metadata,
      ipAddress,
    } = options;

    if (!workspaceId) {
      logger.warn("[AuditEngine] Skipped audit entry: Missing workspaceId", { action, entityType, entityId });
      return null;
    }

    const sanitizedBefore = before !== undefined ? sanitizeSnapshot(entityType, before) : null;
    const sanitizedAfter = after !== undefined ? sanitizeSnapshot(entityType, after) : null;

    const logEntry = await prisma.auditLog.create({
      data: {
        workspaceId,
        actorId: actorId || null,
        actorType,
        action,
        target: target || `${action} ${entityType || "entity"}`,
        entityType: entityType || null,
        entityId: entityId || null,
        before: sanitizedBefore as any,
        after: sanitizedAfter as any,
        requestId: requestId || null,
        source: source || "API",
        metadata: metadata ? (sanitizeLogData(metadata) as any) : undefined,
        ipAddress: ipAddress || null,
      },
    });

    return logEntry;
  } catch (err: any) {
    // Non-blocking failure: Log error with context, but NEVER throw
    logger.error(`[AuditEngine] Failed to create audit log for [${options.action}]:`, {
      requestId: options.requestId || undefined,
      workspaceId: options.workspaceId,
      action: options.action,
    }, err);
    return null;
  }
}
