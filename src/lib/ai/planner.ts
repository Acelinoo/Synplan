import {
  AiAction,
  AiExecutionContext,
  AiPlan,
  ClarificationState,
  AiCreationMode,
} from "./types";
import { callExternalAiProvider } from "./provider";
import { validateAiPlan } from "./validator";
import { resolveClarificationAnswer } from "./entityResolver";
import {
  getLatestExecutionReceipt,
  generateUndoPlanFromReceipt,
} from "./receiptStore";
import {
  getOrCreateConversationState,
  recordConversationTurn,
} from "./conversationStore";
import {
  buildGeminiSystemPrompt,
  formatCompoundPlanPreview,
} from "./promptBuilder";
import { parseHeuristicIntent } from "./heuristics";

export { buildGeminiSystemPrompt, formatCompoundPlanPreview, parseHeuristicIntent };

/**
 * Main AI Planner function (Phase 2 Modular Architecture).
 * Gemini LLM is the PRIMARY planner with bounded serialization.
 * Transparently falls back to the modular heuristic engine if offline or rate-limited.
 */
export async function generateAiPlan(
  prompt: string,
  context: AiExecutionContext,
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>,
  pendingClarification?: ClarificationState,
  mode: AiCreationMode = "STRICT"
): Promise<AiPlan> {
  const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const cleanPrompt = prompt.trim();
  const convState =
    context.conversationState ||
    (context.workspaceId && context.userId
      ? getOrCreateConversationState(context.workspaceId, context.userId, context.conversationId)
      : undefined);

  const enrichedContext: AiExecutionContext = {
    ...context,
    conversationState: convState,
    conversationHistory: conversationHistory || context.conversationHistory || [],
    pendingClarification: pendingClarification || context.pendingClarification,
  };

  const recordAndReturn = (plan: AiPlan): AiPlan => {
    if (enrichedContext.workspaceId && enrichedContext.userId) {
      recordConversationTurn(
        enrichedContext.workspaceId,
        enrichedContext.userId,
        enrichedContext.conversationId || "conv_default",
        {
          userPrompt: prompt,
          assistantMessage: plan.assistantMessage,
          plan,
        }
      );
    }
    return plan;
  };

  // 1. Direct Cancellation Interceptor
  const isCancelCommand = /^(?:batal|cancel|batalkan|jangan|tidak jadi|gak jadi|nggak jadi)(?:\s+deh|\s+ya)?$/i.test(cleanPrompt);
  if (isCancelCommand) {
    return recordAndReturn({
      id: planId,
      userPrompt: prompt,
      assistantMessage: "Aksi dibatalkan. Tidak ada perubahan yang dilakukan ke database.",
      mode,
      actions: [],
      status: "READY",
      requiresConfirmation: false,
      isDestructive: false,
      warnings: [],
      planner: "heuristic",
      provider: "fallback",
      createdAt: new Date().toISOString(),
    });
  }

  // 2. Direct Scoped Undo / Recovery Interceptor
  const isUndoCommand = /^(?:undo|undo that|batalkan yang tadi|batalkan aksi tadi|kembalikan|revert)(?:\s+ya|\s+dong)?$/i.test(cleanPrompt);
  if (isUndoCommand) {
    const latestReceipt = getLatestExecutionReceipt(enrichedContext.workspaceId, enrichedContext.userId);
    if (!latestReceipt) {
      return recordAndReturn({
        id: planId,
        userPrompt: prompt,
        assistantMessage: "Tidak ada riwayat eksekusi sebelumnya yang dapat di-undo pada sesi ini.",
        mode,
        actions: [],
        status: "READY",
        requiresConfirmation: false,
        isDestructive: false,
        warnings: [],
        planner: "heuristic",
        provider: "fallback",
        createdAt: new Date().toISOString(),
      });
    }

    const { plan: undoPlan, error } = generateUndoPlanFromReceipt(latestReceipt, enrichedContext);
    if (error || !undoPlan) {
      return recordAndReturn({
        id: planId,
        userPrompt: prompt,
        assistantMessage: error || "Aksi sebelumnya tidak dapat dibatalkan secara otomatis.",
        mode,
        actions: [],
        status: "READY",
        requiresConfirmation: false,
        isDestructive: false,
        warnings: [],
        planner: "heuristic",
        provider: "fallback",
        createdAt: new Date().toISOString(),
      });
    }

    return recordAndReturn(undoPlan);
  }

  // 3. Check if user is directly answering an active Pending Clarification
  if (
    enrichedContext.pendingClarification &&
    enrichedContext.pendingClarification.candidates.length > 0 &&
    (!enrichedContext.pendingClarification.workspaceId || enrichedContext.pendingClarification.workspaceId === enrichedContext.workspaceId)
  ) {
    const pc = enrichedContext.pendingClarification;
    const matchingCandidateObjs = pc.candidates
      .map((c) => {
        const found = (enrichedContext.members || []).find((m) => m.userId === c.id || m.id === c.id);
        return found ? { id: found.userId, name: found.name, score: 1.0, data: found } : null;
      })
      .filter((c): c is any => c !== null);

    const clarRes = resolveClarificationAnswer(prompt, matchingCandidateObjs);

    if (clarRes.isCancelled) {
      return recordAndReturn({
        id: planId,
        userPrompt: prompt,
        assistantMessage: "Aksi dibatalkan. Tidak ada perubahan yang dilakukan.",
        mode,
        actions: [],
        status: "READY",
        requiresConfirmation: false,
        isDestructive: false,
        warnings: [],
        planner: "heuristic",
        provider: "fallback",
        createdAt: new Date().toISOString(),
      });
    }

    if (clarRes.resolved && clarRes.selectedEntities.length > 0) {
      const isAssign = pc.originalActionType === "ASSIGN_TASK";
      const actions: AiAction[] = clarRes.selectedEntities.map((mem: any, idx: number) => ({
        id: `act_${Date.now()}_res_${idx + 1}`,
        type: pc.originalActionType || "ADD_MEMBER",
        summary: isAssign
          ? `Tugaskan task ke ${mem.name}.`
          : `Tambahkan ${mem.name} ke tim proyek.`,
        riskLevel: "MEDIUM",
        requiredRole: "MEMBER",
        status: "READY",
        payload: isAssign
          ? {
              taskId: enrichedContext.currentTaskId,
              assigneeId: mem.userId,
              assigneeName: mem.name,
              projectId: enrichedContext.currentProjectId,
            }
          : {
              projectId: enrichedContext.currentProjectId,
              projectName: enrichedContext.currentProjectName,
              userId: mem.userId,
              userName: mem.name,
              role: "MEMBER",
            },
      }));

      const plan: AiPlan = {
        id: planId,
        userPrompt: prompt,
        assistantMessage: isAssign
          ? `Menugaskan ke **${clarRes.selectedNames.join(" & ")}**.`
          : `Memilih **${clarRes.selectedNames.join(" & ")}** untuk ditambahkan ke proyek.`,
        mode,
        actions,
        status: "READY",
        requiresConfirmation: false,
        isDestructive: false,
        warnings: [],
        planner: "heuristic",
        provider: "fallback",
        createdAt: new Date().toISOString(),
      };

      const { validatedPlan } = validateAiPlan(plan, enrichedContext);
      return recordAndReturn(validatedPlan);
    }
  }

  const systemPrompt = buildGeminiSystemPrompt(enrichedContext, mode);

  // 4. PRIMARY PATH: Call Gemini LLM
  try {
    const externalResponse = await callExternalAiProvider(prompt, systemPrompt);

    if (externalResponse && externalResponse.text) {
      const cleanedText = externalResponse.text
        .replace(/^```json/m, "")
        .replace(/^```/m, "")
        .trim();

      const parsed = JSON.parse(cleanedText);

      if (parsed && typeof parsed === "object") {
        const rawActions: AiAction[] = Array.isArray(parsed.actions) ? parsed.actions : [];

        const rawPlan: AiPlan = {
          id: planId,
          userPrompt: prompt,
          assistantMessage:
            parsed.assistantMessage ||
            (parsed.needsClarification
              ? "Saya membutuhkan beberapa klarifikasi sebelum menjalankan aksi."
              : "Saya telah menyiapkan rencana aksi."),
          mode,
          actions: rawActions.map((a, idx) => ({
            id: a.id || `act_${idx + 1}`,
            type: a.type,
            summary: a.summary || `Aksi ${a.type}`,
            riskLevel: ["DELETE_PROJECT", "DELETE_TASK", "DELETE_PHASE", "REMOVE_MEMBER"].includes(a.type)
              ? "HIGH"
              : "MEDIUM",
            requiredRole: ["DELETE_PROJECT", "DELETE_PHASE", "REMOVE_MEMBER"].includes(a.type) ? "ADMIN" : "MEMBER",
            isDestructive: !!a.isDestructive || ["DELETE_PROJECT", "DELETE_TASK", "DELETE_PHASE"].includes(a.type),
            requiresConfirmation:
              !!a.requiresConfirmation ||
              ["DELETE_PROJECT", "DELETE_TASK", "DELETE_PHASE", "CREATE_PROJECT"].includes(a.type) ||
              rawActions.length > 2,
            status: "READY",
            payload: a.payload || {},
          })),
          status: "READY",
          requiresConfirmation:
            rawActions.some((a) => a.requiresConfirmation || a.isDestructive) ||
            rawActions.length > 2 ||
            rawActions.some((a) => a.type === "CREATE_PROJECT"),
          isDestructive: rawActions.some(
            (a) => a.isDestructive || ["DELETE_PROJECT", "DELETE_TASK", "DELETE_PHASE"].includes(a.type)
          ),
          warnings: [],
          needsClarification: !!parsed.needsClarification,
          clarificationsNeeded: parsed.clarificationsNeeded || [],
          planner: "llm",
          provider: externalResponse.provider || "gemini",
          createdAt: new Date().toISOString(),
        };

        const { validatedPlan } = validateAiPlan(rawPlan, enrichedContext);
        return recordAndReturn(validatedPlan);
      }
    }
  } catch (err: any) {
    console.warn("[AI Planner] Gemini LLM execution failed, falling back to modular heuristic planner:", err?.message || err);
  }

  // 5. FALLBACK PATH: Robust Modular Heuristic Engine
  const heuristicPlan = parseHeuristicIntent(prompt, enrichedContext, mode);
  const { validatedPlan } = validateAiPlan(heuristicPlan, enrichedContext);
  return recordAndReturn({
    ...validatedPlan,
    planner: "heuristic",
    provider: "fallback",
  });
}
