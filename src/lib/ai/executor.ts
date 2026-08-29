import { prisma } from "@/lib/prisma";
import {
  AiAction,
  AiExecutionContext,
  AiExecutionResult,
  AiPlan,
  ActionResultItem,
  ExecutionReceipt,
  ActionReceiptItem,
} from "./types";
import { ACTION_REGISTRY } from "./registry";
import { validateActionPermission } from "./permissions";
import { verifyPlanExecution } from "./verifier";
import { getIdempotencyResult, setIdempotencyResult } from "./idempotency";
import { resolvePayloadTemporaryRefs } from "./dependencyGraph";
import { recordExecutionReceipt } from "./receiptStore";

/**
 * Centralized Server-Side AI Execution Layer (Phase 14D.2)
 * Features:
 * - Topological dependency chaining
 * - Dependency failure cascading (Blocks downstream dependent actions)
 * - Temporary entity reference binding
 * - Structured Execution Receipts & Audit Trail
 * - Safe rollback policy & truth-grounded summaries
 */
export async function executeAiPlan(
  plan: AiPlan,
  context: AiExecutionContext,
  idempotencyKey?: string
): Promise<AiExecutionResult> {
  const effectiveIdempotencyKey = idempotencyKey || plan.idempotencyKey || plan.id;

  // 1. Idempotency Check
  const cached = getIdempotencyResult(effectiveIdempotencyKey);
  if (cached) {
    return cached;
  }

  const results: ActionResultItem[] = [];
  const receiptItems: ActionReceiptItem[] = [];
  const createdEntities = {
    projectIds: [] as string[],
    taskIds: [] as string[],
    phaseIds: [] as string[],
  };

  const createdEntityMap = new Map<string, { projectId?: string; taskId?: string; phaseId?: string }>();
  const sessionProjectMap = new Map<string, string>();
  if (context.currentProjectId) {
    sessionProjectMap.set("latest", context.currentProjectId);
  }

  const failedActionIds = new Set<string>();
  const blockedActionIds = new Set<string>();

  for (const action of plan.actions) {
    // 2. Check if this action depends on a failed or blocked parent action
    const dependsOnFailed = action.dependsOn?.find(
      (depId) => failedActionIds.has(depId) || blockedActionIds.has(depId)
    );

    if (dependsOnFailed) {
      blockedActionIds.add(action.id);
      const blockedResult: ActionResultItem = {
        actionId: action.id,
        type: action.type,
        success: false,
        verified: false,
        status: "BLOCKED",
        dependsOn: action.dependsOn,
        blockedReason: `Aksi dibatalkan karena dependensi '${dependsOnFailed}' gagal dieksekusi.`,
        error: `DEPENDENCY_FAILED: ${dependsOnFailed}`,
        summary: `[DIBATALKAN] ${action.summary} (Gagal karena dependensi tidak terpenuhi).`,
      };
      results.push(blockedResult);
      receiptItems.push({
        actionId: action.id,
        type: action.type,
        status: "BLOCKED",
        error: `DEPENDENCY_FAILED: ${dependsOnFailed}`,
        isReversible: false,
        summary: blockedResult.summary,
      });
      continue;
    }

    // 3. Resolve Temporary References in Payload (e.g. newly created project/phase IDs)
    const resolvedPayload = resolvePayloadTemporaryRefs(
      action.payload,
      action.temporaryRefs,
      createdEntityMap
    );

    // 4. Server-side Permission Check
    const perm = validateActionPermission(action.type, context.userRole);
    if (!perm.allowed) {
      failedActionIds.add(action.id);
      const failItem: ActionResultItem = {
        actionId: action.id,
        type: action.type,
        success: false,
        verified: false,
        status: "FAILED",
        error: perm.reason || "Unauthorized",
        summary: `Izin ditolak untuk ${action.type}.`,
      };
      results.push(failItem);
      receiptItems.push({
        actionId: action.id,
        type: action.type,
        status: "FAILED",
        error: perm.reason || "Unauthorized",
        isReversible: false,
        summary: failItem.summary,
      });
      continue;
    }

    // 5. Action Registry Execution
    const spec = ACTION_REGISTRY[action.type];
    if (!spec) {
      failedActionIds.add(action.id);
      const unknownItem: ActionResultItem = {
        actionId: action.id,
        type: action.type,
        success: false,
        verified: false,
        status: "FAILED",
        error: `Unknown action type: ${action.type}`,
        summary: `Aksi tidak dikenali di Action Registry.`,
      };
      results.push(unknownItem);
      receiptItems.push({
        actionId: action.id,
        type: action.type,
        status: "FAILED",
        error: `Unknown action type: ${action.type}`,
        isReversible: false,
        summary: unknownItem.summary,
      });
      continue;
    }

    try {
      let res: { success: boolean; data?: any; error?: string; summary: string };

      if (context.isMock) {
        // Deterministic mock execution for safety & isolation testing
        if (action.type === "CREATE_PROJECT") {
          if (!resolvedPayload.name) {
            res = { success: false, error: "Project name is required", summary: "Failed to create project" };
          } else {
            res = { success: true, data: { projectId: `prj_mock_${Date.now()}` }, summary: `Berhasil membuat project ${resolvedPayload.name}.` };
          }
        } else if (action.type === "CREATE_TASK") {
          if (!resolvedPayload.title) {
            res = { success: false, error: "Task title is required", summary: "Failed to create task" };
          } else {
            res = { success: true, data: { taskId: `tsk_mock_${Date.now()}` }, summary: `Berhasil membuat task ${resolvedPayload.title}.` };
          }
        } else if (action.type === "CREATE_PHASE") {
          if (!resolvedPayload.name) {
            res = { success: false, error: "Phase name is required", summary: "Failed to create phase" };
          } else {
            res = { success: true, data: { phaseId: `ph_mock_${Date.now()}` }, summary: `Berhasil membuat phase ${resolvedPayload.name}.` };
          }
        } else if (action.type === "ADD_MEMBER" || action.type === "ADD_PROJECT_MEMBER") {
          if (!resolvedPayload.userId && !resolvedPayload.userName) {
            res = { success: false, error: "User ID or name is required", summary: "Failed to add member" };
          } else {
            res = { success: true, data: { userId: resolvedPayload.userId || "usr_mock_1" }, summary: `Berhasil menambahkan ${resolvedPayload.userName || resolvedPayload.userId} ke project.` };
          }
        } else if (action.type === "DELETE_PROJECT") {
          res = { success: true, data: { id: resolvedPayload.id }, summary: `Berhasil menghapus project.` };
        } else if (action.type === "DELETE_TASK") {
          res = { success: true, data: { id: resolvedPayload.id }, summary: `Berhasil menghapus task.` };
        } else {
          res = { success: true, data: resolvedPayload, summary: `Aksi ${action.type} berhasil.` };
        }
      } else {
        res = await spec.execute(resolvedPayload, context, sessionProjectMap);
      }

      if (res.success) {
        let entityId: string | undefined = undefined;
        let entityType: any = undefined;
        let entityName: string | undefined = undefined;
        const isReversible = ["CREATE_PROJECT", "CREATE_TASK", "CREATE_PHASE", "ADD_MEMBER", "ADD_PROJECT_MEMBER", "ASSIGN_TASK"].includes(action.type);

        if (action.type === "CREATE_PROJECT" && res.data?.projectId) {
          entityId = res.data.projectId;
          entityType = "PROJECT";
          entityName = resolvedPayload.name;
          createdEntities.projectIds.push(res.data.projectId);
          sessionProjectMap.set("latest", res.data.projectId);
          createdEntityMap.set(action.id, { projectId: res.data.projectId });
        } else if (action.type === "CREATE_TASK" && res.data?.taskId) {
          entityId = res.data.taskId;
          entityType = "TASK";
          entityName = resolvedPayload.title;
          createdEntities.taskIds.push(res.data.taskId);
          createdEntityMap.set(action.id, { taskId: res.data.taskId });
        } else if (action.type === "CREATE_PHASE" && res.data?.phaseId) {
          entityId = res.data.phaseId;
          entityType = "PHASE";
          entityName = resolvedPayload.name;
          createdEntities.phaseIds.push(res.data.phaseId);
          createdEntityMap.set(action.id, { phaseId: res.data.phaseId });
        } else if (action.type === "ADD_MEMBER" || action.type === "ADD_PROJECT_MEMBER") {
          entityId = resolvedPayload.userId;
          entityType = "MEMBER";
          entityName = resolvedPayload.userName;
        }

        const itemResult: ActionResultItem = {
          actionId: action.id,
          type: action.type,
          success: true,
          verified: false,
          status: "SUCCESS",
          data: res.data,
          summary: res.summary,
          isReversible,
        };
        results.push(itemResult);

        receiptItems.push({
          actionId: action.id,
          type: action.type,
          status: "SUCCESS",
          entityId,
          entityType,
          entityName,
          isReversible,
          summary: res.summary,
        });
      } else {
        failedActionIds.add(action.id);
        const itemResult: ActionResultItem = {
          actionId: action.id,
          type: action.type,
          success: false,
          verified: false,
          status: "FAILED",
          error: res.error,
          summary: res.summary || `Gagal menjalankan ${action.type}.`,
        };
        results.push(itemResult);

        receiptItems.push({
          actionId: action.id,
          type: action.type,
          status: "FAILED",
          error: res.error,
          isReversible: false,
          summary: itemResult.summary,
        });
      }
    } catch (err: any) {
      failedActionIds.add(action.id);
      const errItem: ActionResultItem = {
        actionId: action.id,
        type: action.type,
        success: false,
        verified: false,
        status: "FAILED",
        error: err?.message || "Execution exception",
        summary: `Terjadi error saat mengeksekusi ${action.type}: ${err?.message || "Unknown error"}`,
      };
      results.push(errItem);

      receiptItems.push({
        actionId: action.id,
        type: action.type,
        status: "FAILED",
        error: err?.message,
        isReversible: false,
        summary: errItem.summary,
      });
    }
  }

  // 6. Post-Execution Database Verification Layer
  const executedSuccesses = results.filter((r) => r.success);
  if (executedSuccesses.length > 0 && !context.isMock) {
    try {
      const verificationReport = await verifyPlanExecution(
        plan,
        results,
        context
      );
      for (const item of results) {
        if (item.success) {
          const v = verificationReport.details.find((ver) => ver.actionId === item.actionId);
          if (v) {
            item.verified = v.verified;
            if (!v.verified) {
              item.success = false;
              item.status = "FAILED";
              item.error = `Verification failed: ${v.message}`;
            }
          }
        }
      }
    } catch (verErr: any) {
      console.warn("[AI Executor] Verification phase warning:", verErr?.message || verErr);
    }
  }

  // 7. Calculate Truth-Grounded Summary & Status
  const successfulCount = results.filter((r) => r.status === "SUCCESS").length;
  const failedCount = results.filter((r) => r.status === "FAILED").length;
  const blockedCount = results.filter((r) => r.status === "BLOCKED").length;

  let overallStatus: "SUCCESS" | "FAILED" | "PARTIAL_SUCCESS" | "BLOCKED" = "SUCCESS";
  if (successfulCount === 0 && failedCount > 0) {
    overallStatus = "FAILED";
  } else if (successfulCount === 0 && blockedCount > 0) {
    overallStatus = "BLOCKED";
  } else if (failedCount > 0 || blockedCount > 0) {
    overallStatus = "PARTIAL_SUCCESS";
  }

  const summaryParts: string[] = [];
  if (successfulCount > 0) {
    summaryParts.push(`Berhasil menjalankan ${successfulCount} aksi.`);
  }
  if (failedCount > 0) {
    summaryParts.push(`Gagal menjalankan ${failedCount} aksi.`);
  }
  if (blockedCount > 0) {
    summaryParts.push(`${blockedCount} aksi dibatalkan karena dependensi gagal.`);
  }

  const finalSummary = summaryParts.join(" ") || "Tidak ada aksi yang dieksekusi.";

  // 8. Compile Execution Receipt
  const executionReceipt: ExecutionReceipt = {
    executionId: `exec_rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    planId: plan.id,
    workspaceId: context.workspaceId,
    userId: context.userId,
    timestamp: new Date().toISOString(),
    status: overallStatus,
    workflowPolicy: plan.workflowPolicy || "PARTIAL_SUCCESS_ALLOWED",
    actions: receiptItems,
    reversible: receiptItems.some((a) => a.status === "SUCCESS" && a.isReversible),
    summary: finalSummary,
    successfulCount,
    failedCount,
    blockedCount,
  };

  recordExecutionReceipt(executionReceipt);

  const finalResult: AiExecutionResult = {
    planId: plan.id,
    idempotencyKey: effectiveIdempotencyKey,
    success: overallStatus === "SUCCESS" || overallStatus === "PARTIAL_SUCCESS",
    status: overallStatus,
    results,
    createdEntities,
    receipt: executionReceipt,
    summary: finalSummary,
    error: failedCount > 0 ? `${failedCount} aksi gagal dieksekusi.` : undefined,
  };

  // 9. Cache in Idempotency Store
  setIdempotencyResult(effectiveIdempotencyKey, plan.id, finalResult);

  return finalResult;
}
