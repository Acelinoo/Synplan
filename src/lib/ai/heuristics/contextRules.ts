import { HeuristicContext, HeuristicMatcher } from "./types";
import { AiAction, AiPlan } from "../types";
import { resolveWorkspaceProject } from "../entityResolver";
import { resolveContextualMember, resolveContextualTask } from "../contextResolver";

export const matchContextRules: HeuristicMatcher = (ctx) => {
  const { cleanPrompt, lower, context, planId } = ctx;

  // 0. Context Switching ("sekarang project Bakery", "pindah ke project Mobile App")
  const isContextSwitch =
    lower.startsWith("sekarang project ") ||
    lower.startsWith("sekarang projek ") ||
    lower.startsWith("pindah ke project ") ||
    lower.startsWith("pindah ke projek ") ||
    lower.startsWith("ganti project ke ") ||
    lower.startsWith("ganti projek ke ");

  if (isContextSwitch) {
    const targetProjName = cleanPrompt.replace(/^(?:sekarang|pindah ke|ganti)\s+(?:project|projek|proyek)\s+(?:ke\s+)?/i, "").trim();
    const resProj = resolveWorkspaceProject(targetProjName, context);
    if (resProj.project) {
      return {
        id: planId,
        userPrompt: cleanPrompt,
        assistantMessage: `Konteks aktif dialihkan ke project **"${resProj.project.name}"**.`,
        actions: [],
        status: "READY",
        requiresConfirmation: false,
        isDestructive: false,
        warnings: [],
        planner: "heuristic",
        provider: "fallback",
        createdAt: new Date().toISOString(),
      };
    }
  }

  // 0.1 Context Correction ("eh bukan Sarah, ke Andi", "bukan Sarah tapi Andi", "ganti ke Andi", "ralat deadline jadi 15 September")
  const isCorrection =
    lower.startsWith("eh bukan ") ||
    lower.startsWith("bukan ") ||
    lower.startsWith("ralat ") ||
    lower.startsWith("ganti ke ") ||
    lower.startsWith("eh salah");

  if (isCorrection) {
    const memberCorrectionMatch = cleanPrompt.match(/(?:eh\s+)?(?:bukan|salah|ganti|ralat).*?(?:ke|tapi|jadikan)\s+([A-Za-z]+)/i);
    if (memberCorrectionMatch && memberCorrectionMatch[1]) {
      const targetMemberQuery = memberCorrectionMatch[1].trim();
      const resMem = resolveContextualMember(targetMemberQuery, context);
      const resTask = resolveContextualTask(undefined, context, context.currentProjectId);

      if (resMem.isAmbiguous) {
        return {
          id: planId,
          userPrompt: cleanPrompt,
          assistantMessage: resMem.clarificationPrompt || `Ditemukan beberapa anggota bernama "${targetMemberQuery}".`,
          actions: [],
          status: "NEEDS_CLARIFICATION",
          requiresConfirmation: false,
          isDestructive: false,
          warnings: [],
          needsClarification: true,
          clarificationsNeeded: [resMem.clarificationPrompt || ""],
          planner: "heuristic",
          provider: "fallback",
          createdAt: new Date().toISOString(),
        };
      }

      if (resTask.isAmbiguous) {
        return {
          id: planId,
          userPrompt: cleanPrompt,
          assistantMessage: resTask.clarificationPrompt || `Terdapat beberapa task aktif yang dapat diperbarui.`,
          actions: [],
          status: "NEEDS_CLARIFICATION",
          requiresConfirmation: false,
          isDestructive: false,
          warnings: [],
          needsClarification: true,
          clarificationsNeeded: [resTask.clarificationPrompt || ""],
          planner: "heuristic",
          provider: "fallback",
          createdAt: new Date().toISOString(),
        };
      }

      const targetTask = resTask.entity;
      const targetMember = resMem.entity;

      if (targetTask && targetMember) {
        const actions: AiAction[] = [
          {
            id: `act_${Date.now()}_corr_asgn`,
            type: "UPDATE_TASK",
            summary: `Ralat penugasan task "${targetTask.title}" menjadi ${targetMember.name}.`,
            riskLevel: "MEDIUM",
            requiredRole: "MEMBER",
            status: "READY",
            payload: {
              taskId: targetTask.id,
              taskTitle: targetTask.title,
              projectId: targetTask.projectId || context.currentProjectId,
              assigneeName: targetMember.name,
              assigneeId: targetMember.userId,
            },
          },
        ];

        return {
          id: planId,
          userPrompt: cleanPrompt,
          assistantMessage: `Meralat penugasan task **"${targetTask.title}"** dialihkan kepada **${targetMember.name}**.`,
          actions,
          status: "READY",
          requiresConfirmation: false,
          isDestructive: false,
          warnings: [],
          planner: "heuristic",
          provider: "fallback",
          createdAt: new Date().toISOString(),
        };
      }
    }
  }

  return null;
};
