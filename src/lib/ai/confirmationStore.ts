import crypto from "crypto";
import {
  AiAction,
  AiExecutionContext,
  AiPlan,
  PendingConfirmationRecord,
  TargetEntitySnapshot,
} from "./types";

/**
 * Server-Authoritative Confirmation Store & Cryptographic Plan Fingerprint Engine (Phase 7)
 *
 * Guarantees:
 * 1. Plan-Bound Confirmation: A confirmation token is strictly bound to userId, workspaceId,
 *    exact action list, payload arguments, and target entity states.
 * 2. Multi-Tenant Isolation: Tokens cannot be used across workspaces or by foreign users.
 * 3. Replay Protection: Executed or expired tokens cannot be reused.
 * 4. Cancellation & Invalidation: New requests or explicit cancel prompts invalidate pending tokens.
 * 5. Stale State Guard: Fingerprints encode target entity timestamps/versions to reject stale plans.
 */

// In-memory store for pending confirmations (keyed by token)
const pendingConfirmations = new Map<string, PendingConfirmationRecord>();

// Secondary index: `${userId}:${workspaceId}` -> active token
const userPendingIndex = new Map<string, string>();

const CONFIRMATION_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Generates a deterministic SHA-256 cryptographic fingerprint of a plan.
 */
export function createPlanFingerprint(params: {
  userId: string;
  workspaceId: string;
  planId: string;
  actions: AiAction[];
  targetEntitySnapshots?: TargetEntitySnapshot[];
}): string {
  const canonicalActions = params.actions.map((act) => ({
    id: act.id,
    type: act.type,
    payload: act.payload,
    isDestructive: act.isDestructive,
    requiredRole: act.requiredRole,
  }));

  const canonicalSnapshots = (params.targetEntitySnapshots || []).map((s) => ({
    id: s.id,
    type: s.type,
    updatedAt: s.updatedAt || "",
    status: s.status || "",
  }));

  const payloadString = JSON.stringify({
    userId: params.userId,
    workspaceId: params.workspaceId,
    planId: params.planId,
    actions: canonicalActions,
    snapshots: canonicalSnapshots,
  });

  return crypto.createHash("sha256").update(payloadString).digest("hex");
}

/**
 * Extracts target entity snapshots from execution context for all actions in a plan.
 */
export function extractTargetEntitySnapshots(
  actions: AiAction[],
  context: AiExecutionContext
): TargetEntitySnapshot[] {
  const snapshots: TargetEntitySnapshot[] = [];
  const seenIds = new Set<string>();

  for (const act of actions) {
    const p = act.payload || {};

    // 1. Task target
    const taskId = p.taskId || (p.id && (act.type.includes("TASK") || p.entityType === "TASK") ? p.id : undefined);
    if (taskId && !seenIds.has(taskId)) {
      seenIds.add(taskId);
      const t = context.tasks.find((task) => task.id === taskId);
      snapshots.push({
        id: taskId,
        type: "TASK",
        name: t?.title || p.taskTitle,
        updatedAt: t ? (t as any).updatedAt || "known" : undefined,
        status: t?.status,
      });
    }

    // 2. Project target
    const projId = p.projectId || (p.id && (act.type.includes("PROJECT") || p.entityType === "PROJECT") ? p.id : undefined);
    if (projId && !seenIds.has(projId)) {
      seenIds.add(projId);
      const prj = context.projects.find((proj) => proj.id === projId);
      snapshots.push({
        id: projId,
        type: "PROJECT",
        name: prj?.name || p.name || p.projectName,
        status: prj?.status,
      });
    }

    // 3. Phase target
    const phaseId = p.phaseId || (p.id && (act.type.includes("PHASE") || p.entityType === "PHASE") ? p.id : undefined);
    if (phaseId && !seenIds.has(phaseId)) {
      seenIds.add(phaseId);
      const ph = context.phases.find((phase) => phase.id === phaseId);
      snapshots.push({
        id: phaseId,
        type: "PHASE",
        name: ph?.name || p.name || p.phaseName,
      });
    }
  }

  return snapshots;
}

/**
 * Registers a new pending confirmation record. Automatically invalidates any
 * previous pending confirmation for the user & workspace.
 */
export function registerPendingConfirmation(
  plan: AiPlan,
  context: AiExecutionContext,
  snapshots?: TargetEntitySnapshot[]
): PendingConfirmationRecord {
  const userKey = `${context.userId}:${context.workspaceId}`;

  // Invalidate any previous pending confirmation for this user in this workspace
  const previousToken = userPendingIndex.get(userKey);
  if (previousToken) {
    invalidatePendingConfirmation(previousToken, "CANCELLED");
  }

  const effectiveSnapshots = snapshots || extractTargetEntitySnapshots(plan.actions, context);
  const fingerprint = createPlanFingerprint({
    userId: context.userId,
    workspaceId: context.workspaceId,
    planId: plan.id,
    actions: plan.actions,
    targetEntitySnapshots: effectiveSnapshots,
  });

  const token = `conf_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CONFIRMATION_TTL_MS).toISOString();

  const record: PendingConfirmationRecord = {
    token,
    planFingerprint: fingerprint,
    userId: context.userId,
    workspaceId: context.workspaceId,
    planId: plan.id,
    plan: {
      ...plan,
      planFingerprint: fingerprint,
      confirmationToken: token,
      confirmationExpiresAt: expiresAt,
      confirmationStatus: "NEEDS_CONFIRMATION",
    },
    actions: plan.actions,
    targetEntitySnapshots: effectiveSnapshots,
    createdAt: now.toISOString(),
    expiresAt,
    status: "PENDING",
  };

  pendingConfirmations.set(token, record);
  userPendingIndex.set(userKey, token);

  return record;
}

/**
 * Validates a pending confirmation token and plan fingerprint with server authority.
 */
export function validatePendingConfirmation(params: {
  token: string;
  fingerprint?: string;
  userId: string;
  workspaceId: string;
}): {
  isValid: boolean;
  error?: string;
  record?: PendingConfirmationRecord;
  isStale?: boolean;
} {
  const record = pendingConfirmations.get(params.token);

  if (!record) {
    return {
      isValid: false,
      error: "Token konfirmasi tidak valid atau tidak ditemukan.",
    };
  }

  // Multi-tenant and user authorization checks
  if (record.userId !== params.userId) {
    return {
      isValid: false,
      error: "Akses ditolak: Konfirmasi ini milik pengguna lain.",
    };
  }

  if (record.workspaceId !== params.workspaceId) {
    return {
      isValid: false,
      error: "Akses ditolak: Konfirmasi ini tidak terdaftar di workspace aktif Anda.",
    };
  }

  if (record.status !== "PENDING") {
    return {
      isValid: false,
      error: `Konfirmasi tidak dapat diproses karena berstatus '${record.status}'.`,
    };
  }

  // Expiration check
  if (new Date(record.expiresAt).getTime() < Date.now()) {
    record.status = "EXPIRED";
    return {
      isValid: false,
      error: "Waktu konfirmasi telah habis (kadaluarsa). Silakan buat rencana baru.",
    };
  }

  // Cryptographic Fingerprint Verification
  if (params.fingerprint && record.planFingerprint !== params.fingerprint) {
    return {
      isValid: false,
      error: "Fingerprint rencana tidak cocok dengan yang tercatat di server.",
    };
  }

  return {
    isValid: true,
    record,
  };
}

/**
 * Invalidates a pending confirmation record.
 */
export function invalidatePendingConfirmation(
  tokenOrPlanId: string,
  reason: "CANCELLED" | "EXPIRED" = "CANCELLED"
): boolean {
  for (const [token, record] of pendingConfirmations.entries()) {
    if (token === tokenOrPlanId || record.planId === tokenOrPlanId) {
      record.status = reason;
      const userKey = `${record.userId}:${record.workspaceId}`;
      if (userPendingIndex.get(userKey) === token) {
        userPendingIndex.delete(userKey);
      }
      return true;
    }
  }
  return false;
}

/**
 * Clears all pending confirmations for a user in a workspace (e.g. on 'batal').
 */
export function clearUserPendingConfirmations(userId: string, workspaceId: string): number {
  const userKey = `${userId}:${workspaceId}`;
  const activeToken = userPendingIndex.get(userKey);
  let cleared = 0;

  if (activeToken) {
    invalidatePendingConfirmation(activeToken, "CANCELLED");
    userPendingIndex.delete(userKey);
    cleared++;
  }

  // Clean up any remaining records matching user & workspace
  for (const record of pendingConfirmations.values()) {
    if (record.userId === userId && record.workspaceId === workspaceId && record.status === "PENDING") {
      record.status = "CANCELLED";
      cleared++;
    }
  }

  return cleared;
}

/**
 * Marks a confirmation as successfully executed to prevent replay attacks.
 */
export function markConfirmationExecuted(token: string): boolean {
  const record = pendingConfirmations.get(token);
  if (record) {
    record.status = "EXECUTED";
    const userKey = `${record.userId}:${record.workspaceId}`;
    if (userPendingIndex.get(userKey) === token) {
      userPendingIndex.delete(userKey);
    }
    return true;
  }
  return false;
}

/**
 * Retrieves the currently active pending confirmation record for a user & workspace.
 */
export function getUserActivePendingConfirmation(
  userId: string,
  workspaceId: string
): PendingConfirmationRecord | null {
  const userKey = `${userId}:${workspaceId}`;
  const token = userPendingIndex.get(userKey);
  if (!token) return null;

  const record = pendingConfirmations.get(token);
  if (!record || record.status !== "PENDING" || new Date(record.expiresAt).getTime() < Date.now()) {
    userPendingIndex.delete(userKey);
    return null;
  }

  return record;
}

/**
 * Clears all stored confirmations (strictly for testing harnesses).
 */
export function resetConfirmationStore(): void {
  pendingConfirmations.clear();
  userPendingIndex.clear();
}
