import { AiAction, AiExecutionContext, AiPlan, ExecutionReceipt, ActionReceiptItem } from "./types";
import { Role } from "@prisma/client";

// In-memory Receipt Store keyed by `${workspaceId}:${userId}` (TTL: 2 hours)
const receiptCache = new Map<string, ExecutionReceipt[]>();
const RECEIPT_TTL_MS = 2 * 60 * 60 * 1000;

export function recordExecutionReceipt(receipt: ExecutionReceipt): void {
  const key = `${receipt.workspaceId}:${receipt.userId}`;
  const list = receiptCache.get(key) || [];
  list.unshift(receipt);
  // Keep up to 20 recent receipts per user workspace
  if (list.length > 20) list.pop();
  receiptCache.set(key, list);
}

export function getLatestExecutionReceipt(workspaceId: string, userId: string): ExecutionReceipt | null {
  const key = `${workspaceId}:${userId}`;
  const list = receiptCache.get(key);
  if (!list || list.length === 0) return null;

  const latest = list[0];
  if (Date.now() - new Date(latest.timestamp).getTime() > RECEIPT_TTL_MS) {
    list.shift();
    return null;
  }

  return latest;
}

export function getExecutionHistory(workspaceId: string, userId: string): ExecutionReceipt[] {
  const key = `${workspaceId}:${userId}`;
  const list = receiptCache.get(key) || [];
  const now = Date.now();
  return list.filter((r) => now - new Date(r.timestamp).getTime() <= RECEIPT_TTL_MS);
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
 * Destructive deletion of whole projects is irreversible.
 */
export function isReceiptReversible(receipt: ExecutionReceipt): boolean {
  if (receipt.actions.length === 0) return false;
  // If any action was DELETE_PROJECT, it is irreversible
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

  // Reverse order: undo children before parents (e.g. tasks before project)
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
            riskLevel: "CRITICAL",
            requiredRole: Role.ADMIN,
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

      case "ADD_MEMBER":
      case "ADD_PROJECT_MEMBER": {
        if (item.entityId) {
          undoActions.push({
            id: `undo_act_${Date.now()}_${idx + 1}`,
            type: "REMOVE_MEMBER",
            summary: `Batalkan penambahan ${item.entityName || item.entityId} dari tim.`,
            riskLevel: "HIGH",
            requiredRole: Role.ADMIN,
            isDestructive: true,
            requiresConfirmation: true,
            status: "READY",
            payload: {
              projectId: context.currentProjectId,
              userId: item.entityId,
              userName: item.entityName,
            },
          });
        }
        break;
      }

      case "ASSIGN_TASK": {
        if (item.entityId) {
          undoActions.push({
            id: `undo_act_${Date.now()}_${idx + 1}`,
            type: "UPDATE_TASK",
            summary: `Batalkan penugasan task "${item.entityName || item.entityId}".`,
            riskLevel: "MEDIUM",
            requiredRole: Role.MEMBER,
            status: "READY",
            payload: {
              taskId: item.entityId,
              assigneeId: null,
            },
          });
        }
        break;
      }

      default:
        break;
    }
  }

  if (undoActions.length === 0) {
    return {
      error: "Tidak ada rencana undo yang dapat dibuat.",
    };
  }

  const planId = `plan_undo_${Date.now()}`;
  const undoPlan: AiPlan = {
    id: planId,
    userPrompt: "Undo eksekusi sebelumnya",
    assistantMessage: `Saya telah menyiapkan rencana **Undo** untuk membatalkan **${undoActions.length} aksi** dari eksekusi sebelumnya (Receipt ID: \`${receipt.executionId.slice(0, 12)}\`).`,
    actions: undoActions,
    status: "NEEDS_CONFIRMATION",
    requiresConfirmation: true,
    isDestructive: undoActions.some((a) => a.isDestructive),
    riskLevel: undoActions.some((a) => a.riskLevel === "CRITICAL")
      ? "CRITICAL"
      : undoActions.some((a) => a.riskLevel === "HIGH")
      ? "HIGH"
      : "MEDIUM",
    warnings: ["Aksi ini akan membatalkan perubahan yang dibuat pada eksekusi sebelumnya."],
    planner: "heuristic",
    provider: "fallback",
    createdAt: new Date().toISOString(),
  };

  return { plan: undoPlan };
}
