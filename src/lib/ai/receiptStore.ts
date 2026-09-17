import { prisma } from "@/lib/prisma";
import { AiAction, AiExecutionContext, AiPlan, ExecutionReceipt, ActionReceiptItem } from "./types";
import { Role } from "@prisma/client";

// Fast in-process L1 cache for sub-millisecond immediate access
const receiptCache = new Map<string, ExecutionReceipt[]>();
const RECEIPT_TTL_MS = 2 * 60 * 60 * 1000;
export const MAX_RECEIPT_USERS = 300;

export function pruneReceiptCache(): void {
  const now = Date.now();
  for (const [key, list] of receiptCache.entries()) {
    const valid = list.filter((r) => now - new Date(r.timestamp).getTime() <= RECEIPT_TTL_MS);
    if (valid.length === 0) {
      receiptCache.delete(key);
    } else {
      receiptCache.set(key, valid);
    }
  }

  if (receiptCache.size > MAX_RECEIPT_USERS) {
    const keysToDelete = Array.from(receiptCache.keys()).slice(0, receiptCache.size - MAX_RECEIPT_USERS);
    for (const key of keysToDelete) {
      receiptCache.delete(key);
    }
  }
}

/**
 * Records execution receipt both to in-process cache and persistent PostgreSQL (AiExecutionReceipt).
 */
export async function recordExecutionReceipt(receipt: ExecutionReceipt): Promise<void> {
  pruneReceiptCache();
  const key = `${receipt.workspaceId}:${receipt.userId}`;
  const list = receiptCache.get(key) || [];
  list.unshift(receipt);
  if (list.length > 20) list.pop();
  receiptCache.set(key, list);

  // Persist to PostgreSQL
  try {
    await prisma.aiExecutionReceipt.create({
      data: {
        executionId: receipt.executionId,
        workspaceId: receipt.workspaceId,
        userId: receipt.userId,
        planId: receipt.planId,
        actions: receipt.actions as any,
        isReversible: isReceiptReversible(receipt),
      },
    });
  } catch (err: any) {
    if (!receipt.workspaceId?.startsWith("ws_")) {
      console.warn("[ReceiptStore] Failed to persist receipt to database:", err?.message || err);
    }
  }
}

/**
 * Retrieves latest execution receipt from L1 cache or PostgreSQL fallback.
 */
export async function getLatestExecutionReceipt(
  workspaceId: string,
  userId: string
): Promise<ExecutionReceipt | null> {
  const key = `${workspaceId}:${userId}`;
  const list = receiptCache.get(key);
  if (list && list.length > 0) {
    const latest = list[0];
    if (Date.now() - new Date(latest.timestamp).getTime() <= RECEIPT_TTL_MS) {
      return latest;
    }
  }

  // Fallback to PostgreSQL
  try {
    const dbReceipt = await prisma.aiExecutionReceipt.findFirst({
      where: {
        workspaceId,
        userId,
        rolledBackAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!dbReceipt) return null;

    const receipt: ExecutionReceipt = {
      executionId: dbReceipt.executionId,
      planId: dbReceipt.planId,
      workspaceId: dbReceipt.workspaceId,
      userId: dbReceipt.userId,
      timestamp: dbReceipt.createdAt.toISOString(),
      status: "SUCCESS",
      workflowPolicy: "ATOMIC",
      reversible: dbReceipt.isReversible,
      summary: "Database restored execution receipt",
      successfulCount: Array.isArray(dbReceipt.actions) ? (dbReceipt.actions as any[]).length : 1,
      failedCount: 0,
      blockedCount: 0,
      actions: dbReceipt.actions as any,
    };

    return receipt;
  } catch {
    return null;
  }
}

/**
 * Retrieves execution history for a user in a workspace.
 */
export async function getExecutionHistory(
  workspaceId: string,
  userId: string
): Promise<ExecutionReceipt[]> {
  const key = `${workspaceId}:${userId}`;
  const cached = receiptCache.get(key);
  if (cached && cached.length > 0) {
    return cached;
  }

  try {
    const records = await prisma.aiExecutionReceipt.findMany({
      where: { workspaceId, userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return records.map((r) => ({
      executionId: r.executionId,
      planId: r.planId,
      workspaceId: r.workspaceId,
      userId: r.userId,
      timestamp: r.createdAt.toISOString(),
      status: "SUCCESS",
      workflowPolicy: "ATOMIC",
      reversible: r.isReversible,
      summary: "Restored from database",
      successfulCount: Array.isArray(r.actions) ? (r.actions as any[]).length : 1,
      failedCount: 0,
      blockedCount: 0,
      actions: r.actions as any,
    }));
  } catch {
    return [];
  }
}

export function getExecutionReceiptById(executionId: string): ExecutionReceipt | null {
  for (const list of receiptCache.values()) {
    const found = list.find((r) => r.executionId === executionId);
    if (found) return found;
  }
  return null;
}

/**
 * Determines if a receipt contains reversible actions.
 */
export function isReceiptReversible(receipt: ExecutionReceipt): boolean {
  if (!receipt.actions || receipt.actions.length === 0) return false;
  const hasIrreversible = receipt.actions.some(
    (a) => a.type === "DELETE_PROJECT" || a.type === "DELETE_TASK" || a.type === "DELETE_PHASE"
  );
  if (hasIrreversible) return false;

  return receipt.actions.some((a) => a.status === "SUCCESS" && a.isReversible);
}

/**
 * Builds a safe, deterministic Undo Plan from the latest execution receipt.
 * Executes rollback actions in REVERSE chronological order.
 */
export function generateUndoPlanFromReceipt(
  receipt: ExecutionReceipt,
  context: AiExecutionContext
): { plan?: AiPlan; error?: string } {
  if (!isReceiptReversible(receipt)) {
    return {
      error: "Aksi sebelumnya tidak dapat di-undo secara otomatis karena mengandung operasi permanen (seperti penghapusan).",
    };
  }

  const successfulActions = receipt.actions.filter((a) => a.status === "SUCCESS" && a.isReversible);
  if (successfulActions.length === 0) {
    return {
      error: "Tidak ada aksi yang dapat dibatalkan dari eksekusi sebelumnya.",
    };
  }

  const undoActions: AiAction[] = [];
  const reversed = [...successfulActions].reverse();

  for (let idx = 0; idx < reversed.length; idx++) {
    const item = reversed[idx];

    switch (item.type) {
      case "CREATE_TASK": {
        if (item.entityId) {
          undoActions.push({
            id: `undo_act_${Date.now()}_${idx + 1}`,
            type: "DELETE_TASK",
            summary: `Batalkan & hapus task "${item.entityName || item.entityId}".`,
            riskLevel: "HIGH",
            requiredRole: Role.MEMBER,
            isDestructive: true,
            requiresConfirmation: true,
            status: "READY",
            payload: {
              id: item.entityId,
              name: item.entityName,
              entityType: "TASK",
            },
          });
        }
        break;
      }

      case "CREATE_PHASE": {
        if (item.entityId) {
          undoActions.push({
            id: `undo_act_${Date.now()}_${idx + 1}`,
            type: "DELETE_PHASE",
            summary: `Batalkan & hapus phase "${item.entityName || item.entityId}".`,
            riskLevel: "HIGH",
            requiredRole: Role.MEMBER,
            isDestructive: true,
            requiresConfirmation: true,
            status: "READY",
            payload: {
              id: item.entityId,
              name: item.entityName,
              entityType: "PHASE",
            },
          });
        }
        break;
      }

      case "CREATE_PROJECT": {
        if (item.entityId) {
          undoActions.push({
            id: `undo_act_${Date.now()}_${idx + 1}`,
            type: "DELETE_PROJECT",
            summary: `Batalkan & hapus project "${item.entityName || item.entityId}".`,
            riskLevel: "HIGH",
            requiredRole: Role.MEMBER,
            isDestructive: true,
            requiresConfirmation: true,
            status: "READY",
            payload: {
              id: item.entityId,
              name: item.entityName,
              entityType: "PROJECT",
            },
          });
        }
        break;
      }

      case "UPDATE_TASK": {
        const prevStatus = item.rollbackData?.payload?.status || (item as any).previousState?.status;
        if (item.entityId && prevStatus) {
          undoActions.push({
            id: `undo_act_${Date.now()}_${idx + 1}`,
            type: "UPDATE_TASK",
            summary: `Kembalikan status task "${item.entityName || item.entityId}" ke '${prevStatus}'.`,
            riskLevel: "LOW",
            requiredRole: Role.MEMBER,
            isDestructive: false,
            requiresConfirmation: false,
            status: "READY",
            payload: {
              id: item.entityId,
              taskId: item.entityId,
              status: prevStatus,
            },
          });
        }
        break;
      }
    }
  }

  if (undoActions.length === 0) {
    return {
      error: "Tidak ada aksi spesifik yang dapat dibalikkan dari eksekusi sebelumnya.",
    };
  }

  const undoPlan: AiPlan = {
    id: `undo_plan_${Date.now()}`,
    userPrompt: `Undo operasi ${receipt.executionId}`,
    assistantMessage: `Membatalkan ${undoActions.length} perubahan yang dilakukan pada eksekusi sebelumnya: ${receipt.summary}`,
    isDestructive: true,
    requiresConfirmation: true,
    status: "NEEDS_CONFIRMATION",
    actions: undoActions,
    warnings: [],
    planner: "heuristic",
    provider: "fallback",
    createdAt: new Date().toISOString(),
  };

  return { plan: undoPlan };
}
