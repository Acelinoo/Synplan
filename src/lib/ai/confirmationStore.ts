import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { ConfirmationStatus } from "@prisma/client";
import {
  AiAction,
  AiExecutionContext,
  AiPlan,
  PendingConfirmationRecord,
  TargetEntitySnapshot,
} from "./types";

/**
 * Server-Authoritative PostgreSQL Confirmation Store (Synplan 2.0)
 *
 * Replaces ephemeral in-memory Map with persistent PostgreSQL table (AiConfirmationSession).
 * Guarantees serverless safety, multi-container resilience, and replay attack protection.
 */

const CONFIRMATION_TTL_MS = 10 * 60 * 1000; // 10 minutes

// In-memory store strictly for mock / synthetic unit test contexts (when isMock is true)
const mockConfirmationStore = new Map<string, PendingConfirmationRecord>();

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
      const t = (context.tasks || []).find((task) => task.id === taskId);
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
      const prj = (context.projects || []).find((proj) => proj.id === projId);
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
      const ph = (context.phases || []).find((phase) => phase.id === phaseId);
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
 * Registers a new pending confirmation record in PostgreSQL. Automatically invalidates any
 * previous pending confirmation for the user & workspace.
 */
export async function registerPendingConfirmation(
  plan: AiPlan,
  context: AiExecutionContext,
  snapshots?: TargetEntitySnapshot[]
): Promise<PendingConfirmationRecord> {
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
  const expiresAt = new Date(now.getTime() + CONFIRMATION_TTL_MS);

  if (context.isMock) {
    for (const [t, r] of mockConfirmationStore.entries()) {
      if (r.userId === context.userId && r.workspaceId === context.workspaceId && r.status === "PENDING") {
        r.status = "CANCELLED";
      }
    }
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
        confirmationExpiresAt: expiresAt.toISOString(),
        confirmationStatus: "NEEDS_CONFIRMATION",
      },
      actions: plan.actions,
      targetEntitySnapshots: effectiveSnapshots,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: "PENDING",
    };
    mockConfirmationStore.set(token, record);
    return record;
  }

  // Invalidate any existing pending confirmations for this user in this workspace
  await prisma.aiConfirmationSession.updateMany({
    where: {
      userId: context.userId,
      workspaceId: context.workspaceId,
      status: ConfirmationStatus.PENDING,
    },
    data: {
      status: ConfirmationStatus.REJECTED,
    },
  }).catch(() => {});

  const effectivePlanId = plan.id || (plan as any).planId || `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Persist session to PostgreSQL
  const dbSession = await prisma.aiConfirmationSession.create({
    data: {
      token,
      workspaceId: context.workspaceId,
      userId: context.userId,
      planId: effectivePlanId,
      planFingerprint: fingerprint,
      plan: plan as any,
      actions: plan.actions as any,
      status: ConfirmationStatus.PENDING,
      expiresAt,
    },
  });

  const record: PendingConfirmationRecord = {
    token,
    planFingerprint: fingerprint,
    userId: context.userId,
    workspaceId: context.workspaceId,
    planId: effectivePlanId,
    plan: {
      ...plan,
      planFingerprint: fingerprint,
      confirmationToken: token,
      confirmationExpiresAt: expiresAt.toISOString(),
      confirmationStatus: "NEEDS_CONFIRMATION",
    },
    actions: plan.actions,
    targetEntitySnapshots: effectiveSnapshots,
    createdAt: dbSession.createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    status: "PENDING",
  };

  return record;
}

/**
 * Validates a pending confirmation token and plan fingerprint with server authority from PostgreSQL.
 */
export async function validatePendingConfirmation(params: {
  token: string;
  fingerprint?: string;
  userId: string;
  workspaceId: string;
}): Promise<{
  isValid: boolean;
  error?: string;
  record?: PendingConfirmationRecord;
  isStale?: boolean;
}> {
  if (!params.token) {
    return {
      isValid: false,
      error: "Token konfirmasi tidak diberikan.",
    };
  }

  // Check mock store for synthetic / mock test harnesses
  if (mockConfirmationStore.has(params.token)) {
    const mockRecord = mockConfirmationStore.get(params.token)!;
    if (mockRecord.userId !== params.userId) {
      return {
        isValid: false,
        error: "Akses ditolak: Konfirmasi ini milik pengguna lain.",
      };
    }
    if (mockRecord.workspaceId !== params.workspaceId) {
      return {
        isValid: false,
        error: "Akses ditolak: Konfirmasi ini tidak terdaftar di workspace aktif Anda.",
      };
    }
    if (mockRecord.status !== "PENDING") {
      const statusLabel = mockRecord.status === "CONFIRMED" ? "EXECUTED" : mockRecord.status;
      return {
        isValid: false,
        error: `Konfirmasi tidak dapat diproses karena berstatus '${statusLabel}'.`,
      };
    }
    if (new Date(mockRecord.expiresAt).getTime() < Date.now()) {
      mockRecord.status = "EXPIRED";
      return {
        isValid: false,
        error: "Waktu konfirmasi telah habis (kadaluarsa). Silakan buat rencana baru.",
      };
    }
    if (params.fingerprint && mockRecord.planFingerprint !== params.fingerprint) {
      return {
        isValid: false,
        error: "Fingerprint rencana tidak cocok dengan yang tercatat di server.",
      };
    }
    return {
      isValid: true,
      record: mockRecord,
    };
  }

  const session = await prisma.aiConfirmationSession.findUnique({
    where: { token: params.token },
  });

  if (!session) {
    return {
      isValid: false,
      error: "Token konfirmasi tidak valid atau tidak ditemukan.",
    };
  }

  // Multi-tenant and user authorization checks
  if (session.userId !== params.userId) {
    return {
      isValid: false,
      error: "Akses ditolak: Konfirmasi ini milik pengguna lain.",
    };
  }

  if (session.workspaceId !== params.workspaceId) {
    return {
      isValid: false,
      error: "Akses ditolak: Konfirmasi ini tidak terdaftar di workspace aktif Anda.",
    };
  }

  if (session.status !== ConfirmationStatus.PENDING) {
    const statusLabel = session.status === ConfirmationStatus.CONFIRMED ? "EXECUTED" : (session.status === ConfirmationStatus.REJECTED ? "CANCELLED" : session.status);
    return {
      isValid: false,
      error: `Konfirmasi tidak dapat diproses karena berstatus '${statusLabel}'.`,
    };
  }

  // Expiration check
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.aiConfirmationSession.update({
      where: { id: session.id },
      data: { status: ConfirmationStatus.EXPIRED },
    }).catch(() => {});

    return {
      isValid: false,
      error: "Waktu konfirmasi telah habis (kadaluarsa). Silakan buat rencana baru.",
    };
  }

  // Cryptographic Fingerprint Verification
  if (params.fingerprint && session.planFingerprint !== params.fingerprint) {
    return {
      isValid: false,
      error: "Fingerprint rencana tidak cocok dengan yang tercatat di server.",
    };
  }

  const record: PendingConfirmationRecord = {
    token: session.token,
    planFingerprint: session.planFingerprint,
    userId: session.userId,
    workspaceId: session.workspaceId,
    planId: session.planId,
    plan: session.plan as any,
    actions: session.actions as any,
    targetEntitySnapshots: [],
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    status: "PENDING",
  };

  return {
    isValid: true,
    record,
  };
}

/**
 * Invalidates a pending confirmation record in PostgreSQL.
 */
export async function invalidatePendingConfirmation(
  tokenOrPlanId: string,
  reason: "CANCELLED" | "EXPIRED" = "CANCELLED"
): Promise<boolean> {
  for (const [t, r] of mockConfirmationStore.entries()) {
    if ((t === tokenOrPlanId || r.planId === tokenOrPlanId) && r.status === "PENDING") {
      r.status = reason === "EXPIRED" ? "EXPIRED" : "CANCELLED";
      return true;
    }
  }

  const status = reason === "EXPIRED" ? ConfirmationStatus.EXPIRED : ConfirmationStatus.REJECTED;
  const result = await prisma.aiConfirmationSession.updateMany({
    where: {
      OR: [{ token: tokenOrPlanId }, { planId: tokenOrPlanId }],
      status: ConfirmationStatus.PENDING,
    },
    data: { status },
  });
  return result.count > 0;
}

/**
 * Clears all pending confirmations for a user in a workspace (e.g. on 'batal').
 */
export async function clearUserPendingConfirmations(userId: string, workspaceId: string): Promise<number> {
  let mockCount = 0;
  for (const r of mockConfirmationStore.values()) {
    if (r.userId === userId && r.workspaceId === workspaceId && r.status === "PENDING") {
      r.status = "CANCELLED";
      mockCount++;
    }
  }
  if (mockCount > 0) return mockCount;

  const result = await prisma.aiConfirmationSession.updateMany({
    where: {
      userId,
      workspaceId,
      status: ConfirmationStatus.PENDING,
    },
    data: {
      status: ConfirmationStatus.REJECTED,
    },
  });
  return result.count;
}

/**
 * Marks a confirmation as successfully executed to prevent replay attacks.
 */
export async function markConfirmationExecuted(token: string): Promise<boolean> {
  if (mockConfirmationStore.has(token)) {
    const r = mockConfirmationStore.get(token)!;
    r.status = "CONFIRMED";
    return true;
  }

  try {
    await prisma.aiConfirmationSession.update({
      where: { token },
      data: { status: ConfirmationStatus.CONFIRMED },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Retrieves the currently active pending confirmation record for a user & workspace from PostgreSQL.
 */
export async function getUserActivePendingConfirmation(
  userId: string,
  workspaceId: string
): Promise<PendingConfirmationRecord | null> {
  for (const r of Array.from(mockConfirmationStore.values()).reverse()) {
    if (r.userId === userId && r.workspaceId === workspaceId && r.status === "PENDING") {
      if (new Date(r.expiresAt).getTime() > Date.now()) {
        return r;
      }
    }
  }

  const session = await prisma.aiConfirmationSession.findFirst({
    where: {
      userId,
      workspaceId,
      status: ConfirmationStatus.PENDING,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!session) return null;

  return {
    token: session.token,
    planFingerprint: session.planFingerprint,
    userId: session.userId,
    workspaceId: session.workspaceId,
    planId: session.planId,
    plan: session.plan as any,
    actions: session.actions as any,
    targetEntitySnapshots: [],
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    status: "PENDING",
  };
}

export const MAX_PENDING_CONFIRMATIONS = 100;

/**
 * Prunes expired confirmation sessions from the database.
 */
export async function prunePendingConfirmations(workspaceId?: string): Promise<number> {
  const result = await prisma.aiConfirmationSession.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
      ...(workspaceId ? { workspaceId } : {}),
    },
  }).catch(() => ({ count: 0 }));
  return result.count;
}

/**
 * Clears all stored confirmations (strictly for testing harnesses).
 */
export async function resetConfirmationStore(): Promise<void> {
  mockConfirmationStore.clear();
  await prisma.aiConfirmationSession.deleteMany({}).catch(() => {});
}
