import {
  AiAction,
  AiExecutionContext,
  AiPlan,
  ClarificationState,
  AiCreationMode,
  AIProjectPlan,
  MAX_BATCH_ACTIONS,
} from "./types";
import { callExternalAiProvider } from "./provider";
import { validateAiPlan } from "./validator";
import { resolveNaturalDate } from "./dateResolver";
import {
  resolveWorkspaceMember,
  resolveWorkspaceProject,
  resolveWorkspaceTask,
  resolveWorkspacePhase,
  resolveClarificationAnswer,
} from "./entityResolver";
import {
  resolveContextualProject,
  resolveContextualPhase,
  resolveContextualTask,
  resolveContextualMember,
} from "./contextResolver";
import { extractExplicitRequirements } from "./requirementExtractor";
import { validateStrictProjectPlan } from "./projectPlanValidator";
import {
  getLatestExecutionReceipt,
  generateUndoPlanFromReceipt,
} from "./receiptStore";
import {
  getOrCreateConversationState,
  recordConversationTurn,
} from "./conversationStore";

/**
 * Builds the comprehensive System Prompt for Gemini LLM Planner.
 * Injects complete workspace state, active contextual route/project, squad members, existing projects,
 * conversation history, relative date calculation rules, ambiguity rules, and strict JSON output schema.
 */
function buildGeminiSystemPrompt(context: AiExecutionContext, mode: AiCreationMode = "STRICT"): string {
  const historyText =
    context.conversationHistory && context.conversationHistory.length > 0
      ? `\n### PREVIOUS CONVERSATION TURNS (CONTEXT CONTINUITY):\n${context.conversationHistory
          .map((h) => `${h.role === "user" ? "User" : "Assistant"}: "${h.content}"`)
          .join("\n")}\n`
      : "";

  const pendingClarificationText = context.pendingClarification
    ? `\n### ACTIVE PENDING CLARIFICATION:
Entity Type: ${context.pendingClarification.entityType}
Query: "${context.pendingClarification.query}"
Original Action: ${context.pendingClarification.originalActionType}
Candidates: ${JSON.stringify(context.pendingClarification.candidates)}
If the user's message is answering this clarification (e.g. selecting a candidate name, "keduanya", "yang pertama", "yang kedua"), resolve the pending action with the selected candidates!\n`
    : "";

  return `You are Synplan AI Assistant, a world-class project management and execution planner.
Your role is to understand the user's natural language instructions (in Indonesian or English), resolve intent and context semantically, and generate a structured JSON action plan.

### CREATION MODE: ${mode}
${
  mode === "STRICT"
    ? "- **STRICT MODE INVARIANTS**: Follow the user's explicitly specified structural requirements (exact phase count, exact phase names, exact task count, exact task titles) EXACTLY. DO NOT invent extra phases, extra tasks, or alter explicit requirements unless requested."
    : "- **SMART MODE**: If the user's prompt is unconstrained, you may propose standard delivery phases and structured initial tasks, while always respecting explicit user constraints."
}

### RULES & BEHAVIOR:
1. **Semantic Understanding**:
   - Understand all natural variations, slang, prefixes, and colloquial Indonesian and English.
   - Do NOT expect rigid keyword templates. Understand intent dynamically.
2. **READ Operations**:
   - If the user asks informational questions (e.g. "apa saja task project Cafe?", "task apa yang belum selesai?", "siapa yang mengerjakan Homepage?", "berapa task di Development?", "tampilkan task yang deadline-nya minggu ini", "tampilkan semua project"), answer in \`assistantMessage\` with rich markdown grounded in the provided workspace context.
   - Set \`"actions": []\` for pure READ queries. READ operations MUST NEVER mutate resources!
3. **UPDATE Operations**:
   - Support partial updates: modify ONLY the requested fields (title, deadline, priority, status, phase, assignee) and NEVER overwrite unrelated fields.
   - Support multi-field updates (e.g. "ubah Homepage: deadline 5 September, priority high, assign ke Marchelino").
   - Support task moving to another phase in the same project.
   - Support unassigning members when requested (e.g. "hapus assignee Homepage", "unassign Homepage").
4. **DELETE Operations**:
   - Deletion of projects, phases, and tasks is destructive. Mark \`"isDestructive": true\` and \`"requiresConfirmation": true\`.
5. **BATCH Operations**:
   - If user requests batch updates/assignments/deletions (e.g. "ubah semua task backend jadi high priority", "assign semua task Development ke Marchelino", "hapus semua task project Cafe"), resolve all matching targets deterministically.
   - Output individual action items for each matching task up to MAX_BATCH_ACTIONS (50).
   - If matching targets exceed 50, STOP and ask the user to narrow their filter.
6. **Ambiguity Handling**:
   - If an entity name is ambiguous (multiple matching tasks/members) or missing essential details (e.g. "ubah homepage" without specifying what to change), set \`"needsClarification": true\`, ask the user clearly, and DO NOT guess!
7. **Relative Dates**:
   - Today's Server Date is: ${context.serverTime || new Date().toISOString()}.
   - Convert natural dates (e.g., "1 september", "minggu depan", "akhir bulan", "besok") into exact ISO date format (YYYY-MM-DD).

### CURRENT WORKSPACE CONTEXT:
- **Workspace**: "${context.workspaceName}" (ID: "${context.workspaceId}")
- **Active User**: "${context.userName}" (Role: "${context.userRole || "MEMBER"}", ID: "${context.userId}")
- **Active Page / Route**: "${context.activePath || "/"}"
- **Active View Mode**: "${context.currentView || "standard"}"
- **Active Project Context**: ${
    context.currentProjectId
      ? `"${context.currentProjectName || "Current Project"}" (ID: "${context.currentProjectId}")`
      : "None (Global Workspace Overview)"
  }
- **Active Delivery Phase**: ${
    context.currentPhaseId
      ? `"${context.currentPhaseName || "Active Phase"}" (ID: "${context.currentPhaseId}")`
      : "None"
  }
- **Active Task In View**: ${
    context.currentTaskId
      ? `"${context.currentTaskTitle || "Active Task"}" (ID: "${context.currentTaskId}")`
      : "None"
  }
- **Selected Team Member**: ${
    context.currentMemberId
      ? `"${context.currentMemberName || "Active Member"}" (ID: "${context.currentMemberId}")`
      : "None"
  }
- **Available Squad Members**:
${JSON.stringify(
  context.members.map((m) => ({ name: m.name, userId: m.userId, role: m.role, email: m.email })),
  null,
  2
)}
- **Existing Projects**:
${JSON.stringify(
  context.projects.map((p) => ({ name: p.name, id: p.id, status: p.status, deadline: p.deadline })),
  null,
  2
)}
- **Existing Tasks in Workspace**:
${JSON.stringify(
  context.tasks.slice(0, 40).map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, projectId: t.projectId, phaseId: t.phaseId, dueDate: t.dueDate })),
  null,
  2
)}
- **Existing Delivery Phases**:
${JSON.stringify(
  context.phases.slice(0, 30).map((ph) => ({ id: ph.id, name: ph.name, projectId: ph.projectId, order: ph.order })),
  null,
  2
)}
${historyText}
${pendingClarificationText}

### OUTPUT FORMAT:
Return ONLY valid JSON matching this schema:
{
  "understood": true,
  "needsClarification": false,
  "assistantMessage": "Clear, friendly, and practical explanation in Indonesian",
  "clarificationsNeeded": [],
  "actions": [
    {
      "id": "act_1",
      "type": "CREATE_PROJECT" | "CREATE_PHASE" | "CREATE_TASK" | "UPDATE_PROJECT" | "UPDATE_TASK" | "UPDATE_PHASE" | "ASSIGN_TASK" | "ADD_MEMBER" | "ADD_PROJECT_MEMBER" | "DELETE_PROJECT" | "DELETE_TASK" | "DELETE_PHASE",
      "summary": "Human readable action summary in Indonesian or English",
      "isDestructive": boolean,
      "requiresConfirmation": boolean,
      "payload": {
        // Relevant payload fields for the action type
      }
    }
  ]
}
`;
}

/**
 * Formats a clean, structured consolidated preview for compound multi-action plans.
 */
export function formatCompoundPlanPreview(actions: AiAction[]): string {
  const projectAct = actions.find((a) => a.type === "CREATE_PROJECT");
  const memberActs = actions.filter((a) => a.type === "ADD_MEMBER" || a.type === "ADD_PROJECT_MEMBER");
  const phaseActs = actions.filter((a) => a.type === "CREATE_PHASE");
  const taskActs = actions.filter((a) => a.type === "CREATE_TASK");
  const assignActs = actions.filter((a) => a.type === "ASSIGN_TASK");

  const lines: string[] = ["Saya telah menyiapkan rencana eksekusi terstruktur:"];
  if (projectAct) {
    lines.push(`• **Proyek**: ${projectAct.payload?.name || "Project Baru"}`);
    if (projectAct.payload?.deadline) lines.push(`  *Deadline*: ${projectAct.payload.deadline}`);
  }
  if (memberActs.length > 0) {
    lines.push(`• **Tim**: ${memberActs.map((m) => `✓ ${m.payload?.userName || m.payload?.memberName}`).join(", ")}`);
  }
  if (phaseActs.length > 0) {
    lines.push(`• **Tahapan**: ${phaseActs.map((p) => `✓ ${p.payload?.name}`).join(", ")}`);
  }
  if (taskActs.length > 0) {
    lines.push(`• **Tugas**: ${taskActs.map((t) => `✓ ${t.payload?.title}`).join(", ")}`);
  }
  if (assignActs.length > 0) {
    lines.push(`• **Penugasan**: ${assignActs.map((a) => `✓ ${a.payload?.taskTitle || "Task"} -> ${a.payload?.assigneeName}`).join(", ")}`);
  }
  lines.push(`\nTotal **${actions.length} aksi** akan dijalankan.`);
  return lines.join("\n");
}

/**
 * Main AI Planner function.
 * Gemini LLM is the PRIMARY planner.
 * Transparently falls back to heuristic engine if offline or rate-limited.
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
        const found = enrichedContext.members.find((m) => m.userId === c.id || m.id === c.id);
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

  // 2. PRIMARY PATH: Call Gemini LLM
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

        // Validate and enrich with server-side entity resolution & strict validation
        const { validatedPlan } = validateAiPlan(rawPlan, enrichedContext);
        return recordAndReturn(validatedPlan);
      }
    }
  } catch (err: any) {
    console.warn("[AI Planner] Gemini LLM execution failed, falling back to heuristic planner:", err?.message || err);
  }

  // 3. FALLBACK PATH: Robust Heuristic NLP Engine (Offline / Degraded Mode)
  const heuristicPlan = parseHeuristicIntent(prompt, enrichedContext, mode);
  const { validatedPlan } = validateAiPlan(heuristicPlan, enrichedContext);
  return recordAndReturn({
    ...validatedPlan,
    planner: "heuristic",
    provider: "fallback",
  });
}

/**
 * Heuristic Natural Language Parser (Offline Fallback Engine with Strict & Smart modes)
 */
export function parseHeuristicIntent(
  prompt: string,
  context: AiExecutionContext,
  mode: AiCreationMode = "STRICT"
): AiPlan {
  const cleanPrompt = prompt.trim();
  const lower = cleanPrompt.toLowerCase();
  const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const actions: AiAction[] = [];
  const warnings: string[] = [];
  let assistantMessage = "";

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
    // 0.1.1 Member Correction (e.g. "eh bukan Sarah, ke Andi", "bukan Sarah tapi Andi", "ganti ke Andi")
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
        actions.push({
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
        });

        return {
          id: planId,
          userPrompt: cleanPrompt,
          assistantMessage: `Meralat penugasan task **"${targetTask.title}"** dialihkan kepada **${targetMember.name}**.`,
          actions,
          status: "READY",
          requiresConfirmation: false,
          isDestructive: false,
          warnings,
          planner: "heuristic",
          provider: "fallback",
          createdAt: new Date().toISOString(),
        };
      }
    }
  }

  // 1. Create Project Intent
  const isCreateProject =
    /(?:buat|buatin|buatkan|bikin|bikinin|create|setup|generate|susun|rancang|mulai|menyiapkan|ingin|mau|ayo)\s+(?:sebuah\s+)?(?:projek|project|proyek|web|website|aplikasi|app|situs|ruang kerja)/i.test(cleanPrompt) ||
    lower.includes("projek baru") ||
    lower.includes("project baru") ||
    lower.includes("proyek baru") ||
    lower.startsWith("projek ") ||
    lower.startsWith("project ");

  if (isCreateProject) {
    const constraints = extractExplicitRequirements(cleanPrompt, context.serverTime);
    let projectName = constraints.exactProjectName || "New Project";
    if (!constraints.exactProjectName) {
      const nameMatch =
        cleanPrompt.match(/(?:buat|buatin|buatkan|bikin|bikinin|create|setup|generate|susun|rancang|mulai|ingin|mau|ayo|punya project baru)\s+(?:sebuah\s+)?(?:projek|project|proyek|website|web|situs|aplikasi|app)?\s*([^,\.\n]+)/i) ||
        cleanPrompt.match(/(?:untuk|usaha|tentang|buat|namanya)\s+([A-Za-z0-9\s\-]+?)(?:,|\.|\s+deadline|\s+target|$)/i);

      if (nameMatch && nameMatch[1]) {
        let rawName = nameMatch[1].trim();
        rawName = rawName
          .replace(/^(?:sebuah\s+)?(?:baru\s+)?(?:namanya\s+)?(?:untuk\s+)?(?:kita\s+akan\s+)?(?:bikin\s+)?(?:buat\s+)?(?:project\s+)?(?:projek\s+)?(?:proyek\s+)?(?:baru\s+)?(?:buat\s+)?/i, "")
          .replace(/\s+(?:deadline|tenggat|target|dengan|buat|dan|phases|tasks|selesai|tambahkan|ya).*$/i, "")
          .trim();
        if (rawName.length > 2) {
          projectName = rawName
            .split(" ")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
        }
      }
    }

    let deadline: string | undefined = constraints.exactDeadline;
    if (!deadline) {
      const deadlineMatch = cleanPrompt.match(
        /(?:deadline|tenggat|target|due|selesai(?: tanggal)?)\s*(?::|\s)?\s*([0-9]{1,2}\s+[A-Za-z]+(?:\s+[0-9]{4})?|[0-9]{4}-[0-9]{2}-[0-9]{2}|satu\s+[A-Za-z]+|besok|lusa|next\s+week|minggu\s+depan|next\s+month|bulan\s+depan|akhir\s+bulan)/i
      );
      if (deadlineMatch && deadlineMatch[1]) {
        const resolved = resolveNaturalDate(deadlineMatch[1], context.serverTime);
        if (resolved) deadline = resolved.isoDate;
      }
    }

    // Determine Phases
    let phases: Array<{ name: string; order: number; tasks: Array<{ title: string; priority?: any; status?: any; assigneeName?: string; dueDate?: string }> }> = [];

    if (constraints.exactPhaseNames && constraints.exactPhaseNames.length > 0) {
      // Exact user-specified phase names
      phases = constraints.exactPhaseNames.map((pName, idx) => ({
        name: pName,
        order: idx + 1,
        tasks: [],
      }));
    } else if (constraints.exactPhaseCount !== undefined && constraints.exactPhaseCount > 0) {
      const defaultNames = ["Planning", "Design", "Development", "Testing", "Deployment", "Maintenance"];
      phases = defaultNames.slice(0, constraints.exactPhaseCount).map((pName, idx) => ({
        name: pName,
        order: idx + 1,
        tasks: [],
      }));
    } else if (mode === "SMART" || !constraints.hasExplicitStructure) {
      // Smart Mode Default Phases
      phases = [
        { name: "Konsep & Perencanaan", order: 1, tasks: [] },
        { name: "Desain & UI/UX", order: 2, tasks: [] },
        { name: "Development", order: 3, tasks: [] },
        { name: "Testing & QA", order: 4, tasks: [] },
        { name: "Deployment & Launch", order: 5, tasks: [] },
      ];
    } else {
      // Strict mode with no phases specified
      phases = [
        { name: "General Delivery", order: 1, tasks: [] },
      ];
    }

    // Determine Tasks
    const initialTasks: Array<{
      title: string;
      description?: string;
      priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
      status?: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
      phaseName?: string;
      assigneeName?: string;
      dueDate?: string;
    }> = [];

    if (constraints.structuredTasks && constraints.structuredTasks.length > 0) {
      constraints.structuredTasks.forEach((st) => {
        initialTasks.push({
          title: st.title,
          phaseName: st.phaseName || phases[0]?.name || "Planning",
          assigneeName: st.assigneeName,
          priority: st.priority || "HIGH",
          status: "TODO",
          dueDate: deadline,
        });
      });
    } else if (constraints.exactTaskTitles && constraints.exactTaskTitles.length > 0) {
      // Exact user-specified tasks
      constraints.exactTaskTitles.forEach((tTitle, idx) => {
        const assignedPhase = phases[idx % phases.length]?.name;
        initialTasks.push({
          title: tTitle,
          priority: "HIGH",
          status: "TODO",
          phaseName: assignedPhase,
          dueDate: deadline,
        });
      });
    } else if (mode === "SMART" || !constraints.hasExplicitStructure) {
      // Smart Mode default starter tasks
      initialTasks.push(
        { title: "Scope & Requirements", phaseName: phases[0]?.name || "Planning", priority: "HIGH" },
        { title: "UI Mockups & Design System", phaseName: phases[1]?.name || phases[0]?.name, priority: "MEDIUM" },
        { title: "Frontend Architecture", phaseName: phases[2]?.name || phases[0]?.name, priority: "HIGH" },
        { title: "Backend API Integration", phaseName: phases[2]?.name || phases[0]?.name, priority: "HIGH" },
        { title: "QA Testing & Verification", phaseName: phases[3]?.name || phases[0]?.name, priority: "MEDIUM" },
        { title: "Production Deployment", phaseName: phases[4]?.name || phases[0]?.name, priority: "URGENT" }
      );
    }

    // Check task assignments (e.g. "Assign task frontend ke Marchelino")
    const assignMatch = cleanPrompt.match(/(?:assign\s+task|tugaskan\s+task|kasih\s+task)\s+([^,\.\n]+?)\s+ke\s+([A-Za-z]+)/i);
    if (assignMatch && assignMatch[1] && assignMatch[2]) {
      const matchTitle = assignMatch[1].trim().toLowerCase();
      const matchAssignee = assignMatch[2].trim();
      const foundTask = initialTasks.find((t) => t.title.toLowerCase().includes(matchTitle));
      if (foundTask) {
        foundTask.assigneeName = matchAssignee;
      }
    }

    // Build Canonical AIProjectPlan
    const canonicalPlan: AIProjectPlan = {
      mode,
      project: {
        name: projectName,
        description: `Project generated by Synplan AI (${mode} mode): "${cleanPrompt}"`,
        deadline,
        status: "ACTIVE",
        color: "#6366F1",
      },
      phases: phases.map((ph) => ({
        name: ph.name,
        order: ph.order,
        tasks: initialTasks.filter((t) => t.phaseName === ph.name),
      })),
      teamMembers: (constraints.exactMembers || []).map((mName) => ({
        userName: mName,
        role: "MEMBER",
      })),
      explicitConstraints: constraints,
    };

    // Validate with Strict Project Plan Validator
    const validationRes = validateStrictProjectPlan(canonicalPlan, constraints);

    // Root CREATE_PROJECT action
    actions.push({
      id: `act_${Date.now()}_1`,
      type: "CREATE_PROJECT",
      summary: `Buat project "${projectName}" dengan ${canonicalPlan.phases.length} tahapan dan ${initialTasks.length} tugas.`,
      riskLevel: "MEDIUM",
      requiredRole: "MEMBER",
      status: "READY",
      requiresConfirmation: true,
      payload: {
        name: projectName,
        description: canonicalPlan.project.description,
        deadline,
        status: "ACTIVE",
        phases: canonicalPlan.phases.map((ph, idx) => ({ name: ph.name, order: ph.order || idx + 1 })),
        initialTasks,
        memberNames: constraints.exactMembers || [],
      },
    });

    // Add Member actions
    if (constraints.exactMembers && constraints.exactMembers.length > 0) {
      constraints.exactMembers.forEach((memName, idx) => {
        const found = context.members.find(
          (m) => m.name.toLowerCase().includes(memName.toLowerCase())
        );
        actions.push({
          id: `act_${Date.now()}_mem_${idx + 1}`,
          type: "ADD_MEMBER",
          summary: `Tambahkan ${found?.name || memName} ke tim project "${projectName}".`,
          riskLevel: "MEDIUM",
          requiredRole: "MEMBER",
          status: "READY",
          payload: {
            projectName,
            userId: found?.userId,
            userName: found?.name || memName,
            role: "MEMBER",
          },
        });
      });
    }

    // Discrete Task actions in compound prompt (e.g. "task Desain Homepage, assign ke Marchel")
    const taskMatches = cleanPrompt.matchAll(/(?:task|tugas)\s+([^,\.\n]+?)(?:,|\.|\s+assign|\s+ke|$)/gi);
    for (const tm of taskMatches) {
      const tTitle = tm[1]?.trim();
      if (tTitle && tTitle.length > 2 && !["baru", "ini", "projek", "project", "phase", "fase", "testing"].includes(tTitle.toLowerCase())) {
        const foundAssignee = context.members.find((m) =>
          cleanPrompt.toLowerCase().includes(m.name.toLowerCase().split(" ")[0])
        );
        actions.push({
          id: `act_${Date.now()}_task_${actions.length + 1}`,
          type: "CREATE_TASK",
          summary: `Buat task "${tTitle}" untuk proyek "${projectName}".`,
          riskLevel: "MEDIUM",
          requiredRole: "MEMBER",
          status: "READY",
          dependsOn: [`act_${Date.now()}_1`],
          payload: {
            projectName,
            title: tTitle,
            priority: "HIGH",
            assigneeName: foundAssignee?.name,
            assigneeId: foundAssignee?.userId,
          },
        });
      }
    }

    assistantMessage = `Saya telah menyiapkan rencana proyek **"${projectName}"** (${mode} mode) lengkap dengan **${canonicalPlan.phases.length} tahapan** dan **${initialTasks.length} tugas**.`;

    return {
      id: planId,
      userPrompt: cleanPrompt,
      assistantMessage,
      mode,
      actions,
      projectPlan: canonicalPlan,
      explicitConstraints: constraints,
      status: "NEEDS_CONFIRMATION",
      requiresConfirmation: true,
      isDestructive: false,
      warnings: validationRes.warnings,
      planner: "heuristic",
      provider: "fallback",
      createdAt: new Date().toISOString(),
    };
  }

  // 2. READ Operations (Ground Truth Retrieval without Mutation)
  const isReadQuery =
    (lower.startsWith("apa saja") ||
      lower.startsWith("apa ") ||
      lower.startsWith("list ") ||
      lower.startsWith("daftar ") ||
      lower.startsWith("tampilkan ") ||
      lower.startsWith("lihat ") ||
      lower.startsWith("show ") ||
      lower.startsWith("siapa ") ||
      lower.startsWith("berapa ") ||
      lower.includes("task apa") ||
      lower.includes("projek apa") ||
      lower.includes("project apa") ||
      lower.includes("yang belum selesai") ||
      lower.includes("yang pending") ||
      lower.includes("belum ada assignee") ||
      lower.includes("tanpa assignee") ||
      lower.includes("unassigned") ||
      lower.includes("deadline minggu ini") ||
      lower.includes("deadline-nya minggu ini") ||
      lower.includes("siapa yang mengerjakan")) &&
    !lower.includes("buat") &&
    !lower.includes("bikin") &&
    !lower.includes("hapus") &&
    !lower.includes("ubah") &&
    !lower.includes("ganti") &&
    !lower.includes("pindahkan") &&
    !lower.includes("rename") &&
    !lower.startsWith("assign ") &&
    !lower.includes("assign ke ") &&
    !lower.includes("selesaikan");

  if (isReadQuery) {
    // 2.1 Project List Query
    if (
      lower.includes("semua project") ||
      lower.includes("semua projek") ||
      lower.includes("daftar project") ||
      lower.includes("list project") ||
      (lower.includes("project") && lower.includes("apa saja") && !lower.includes("task"))
    ) {
      const projLines = context.projects.map(
        (p, idx) => `${idx + 1}. **${p.name}** — [Status: ${p.status}] (${p.totalTasks} tasks${p.deadline ? `, Deadline: ${p.deadline.split("T")[0]}` : ""})`
      );
      const msg =
        context.projects.length > 0
          ? `### Daftar Proyek di Workspace "${context.workspaceName || "Active"}":\n\n${projLines.join("\n")}\n\nTotal: **${context.projects.length} proyek**.`
          : `Belum ada proyek yang terdaftar di workspace ini.`;
      return {
        id: planId,
        userPrompt: cleanPrompt,
        assistantMessage: msg,
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

    // 2.2 Task Assignee Query ("siapa yang mengerjakan Homepage?")
    const assigneeMatch = cleanPrompt.match(/(?:siapa\s+(?:yang\s+)?mengerjakan|siapa\s+assignee|siapa\s+pic)\s+(?:task\s+)?([^,\.\n\?]+)/i);
    if (assigneeMatch && assigneeMatch[1]) {
      const targetQuery = assigneeMatch[1].trim();
      const resTask = resolveWorkspaceTask(targetQuery, context, context.currentProjectId);
      if (resTask.task) {
        const assignee = context.members.find((m) => m.userId === resTask.task?.assigneeId);
        const assigneeText = assignee ? `**${assignee.name}** (${assignee.email})` : "*Belum ditugaskan (Unassigned)*";
        return {
          id: planId,
          userPrompt: cleanPrompt,
          assistantMessage: `Task **"${resTask.task.title}"** ditugaskan kepada: ${assigneeText}.`,
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

    // 2.3 Phase Task Count Query ("berapa task di Development?")
    const phaseCountMatch = cleanPrompt.match(/(?:berapa\s+task|jumlah\s+task)\s+(?:di|pada|fase|phase)\s+([^,\.\n\?]+)/i);
    if (phaseCountMatch && phaseCountMatch[1]) {
      const targetPhaseName = phaseCountMatch[1].trim();
      const resPhase = resolveWorkspacePhase(targetPhaseName, context, context.currentProjectId);
      if (resPhase.selectedEntity) {
        const matchingTasks = context.tasks.filter((t) => t.phaseId === resPhase.selectedEntity?.id);
        return {
          id: planId,
          userPrompt: cleanPrompt,
          assistantMessage: `Fase **"${resPhase.selectedEntity.name}"** memiliki **${matchingTasks.length} task** (${matchingTasks.filter((t) => t.status === "DONE").length} selesai).`,
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

    // 2.4 Task Filter Queries (Unfinished, Weekly Deadlines, Unassigned, Project Tasks)
    let taskPool = context.tasks;
    let scopedProjectName: string | undefined = undefined;

    // Project filter if specified or contextual
    const projMatch = cleanPrompt.match(/(?:di|pada|untuk)?\s*(?:project|projek|proyek)\s+([^,\.\n\?]+)/i);
    if (projMatch && projMatch[1] && !["ini", "ini?"].includes(projMatch[1].trim().toLowerCase())) {
      const resProj = resolveContextualProject(projMatch[1].trim(), context);
      if (resProj.entity) {
        taskPool = taskPool.filter((t) => t.projectId === resProj.entity?.id);
        scopedProjectName = resProj.entity.name;
      }
    } else if (context.currentProjectId) {
      const activeProj = context.projects.find((p) => p.id === context.currentProjectId);
      taskPool = taskPool.filter((t) => t.projectId === context.currentProjectId);
      scopedProjectName = activeProj?.name || context.currentProjectName;
    }

    if (lower.includes("belum selesai") || lower.includes("pending") || lower.includes("todo")) {
      taskPool = taskPool.filter((t) => t.status !== "DONE");
    }

    if (lower.includes("belum ada assignee") || lower.includes("tanpa assignee") || lower.includes("unassigned")) {
      taskPool = taskPool.filter((t) => !t.assigneeId);
    }

    if (lower.includes("minggu ini") || lower.includes("this week")) {
      const now = new Date();
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      taskPool = taskPool.filter((t) => {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate);
        return d >= now && d <= nextWeek;
      });
    }

    const taskLines = taskPool.map((t, idx) => {
      const assignee = context.members.find((m) => m.userId === t.assigneeId);
      const assignText = assignee ? `Assignee: ${assignee.name}` : "Unassigned";
      const dueText = t.dueDate ? `Due: ${t.dueDate.split("T")[0]}` : "No due date";
      return `${idx + 1}. **${t.title}** — [${t.status} | ${t.priority}] — ${assignText} — ${dueText}`;
    });

    const headerTitle = scopedProjectName
      ? `### Hasil Pencarian Task (${scopedProjectName}):`
      : `### Hasil Pencarian Task:`;

    const msg =
      taskPool.length > 0
        ? `${headerTitle}\n\n${taskLines.join("\n")}\n\nTotal: **${taskPool.length} task** ditemukan.`
        : `Tidak ditemukan task yang sesuai dengan kriteria pencarian Anda.`;

    return {
      id: planId,
      userPrompt: cleanPrompt,
      assistantMessage: msg,
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

  // 3. BATCH Operations ("semua task ...", "all tasks ...")
  const isBatchIntent =
    lower.includes("semua task") ||
    lower.includes("all task") ||
    lower.includes("all tasks") ||
    lower.includes("seluruh task") ||
    lower.includes("semua tugas");

  if (isBatchIntent) {
    let targetTasks = [...context.tasks];

    // Project filter in batch
    const projMatch = cleanPrompt.match(/(?:di|pada|untuk)\s+(?:project|projek|proyek)\s+([^,\.\n]+)/i);
    if (projMatch && projMatch[1]) {
      const resProj = resolveWorkspaceProject(projMatch[1].trim(), context);
      if (resProj.project) {
        targetTasks = targetTasks.filter((t) => t.projectId === resProj.project?.id);
      }
    } else if (context.currentProjectId) {
      targetTasks = targetTasks.filter((t) => t.projectId === context.currentProjectId);
    }

    // Phase filter in batch
    const phaseMatch = cleanPrompt.match(/(?:di\s+phase|di\s+fase|phase|fase)\s+([^,\.\n]+?)(?:\s+(?:ke|jadi|menjadi|untuk|dengan|sebagai)|$)/i);
    if (phaseMatch && phaseMatch[1]) {
      const resPhase = resolveWorkspacePhase(phaseMatch[1].trim(), context);
      if (resPhase.selectedEntity) {
        targetTasks = targetTasks.filter((t) => t.phaseId === resPhase.selectedEntity?.id);
      }
    }

    // Status filter in batch (e.g. "yang belum selesai")
    if (lower.includes("belum selesai") || lower.includes("pending") || lower.includes("todo")) {
      targetTasks = targetTasks.filter((t) => t.status !== "DONE");
    }

    // Keyword in task title (e.g. "semua task backend")
    const kwMatch = cleanPrompt.match(/(?:semua\s+task|all\s+tasks|seluruh\s+task)\s+([A-Za-z0-9]+)/i);
    if (
      kwMatch &&
      kwMatch[1] &&
      !["di", "yang", "pada", "untuk", "jadi", "ke", "menjadi", "project", "phase"].includes(kwMatch[1].toLowerCase())
    ) {
      const kw = kwMatch[1].toLowerCase();
      const kwFiltered = targetTasks.filter((t) => t.title.toLowerCase().includes(kw) || (t.description || "").toLowerCase().includes(kw));
      if (kwFiltered.length > 0) {
        targetTasks = kwFiltered;
      }
    }

    // Check MAX_BATCH_ACTIONS Safety Limit
    if (targetTasks.length > MAX_BATCH_ACTIONS) {
      return {
        id: planId,
        userPrompt: cleanPrompt,
        assistantMessage: `⚠️ Operasi batch melebihi batas aman (maksimum 50 task). Ditemukan ${targetTasks.length} task. Mohon persempit filter atau kriteria Anda.`,
        actions: [],
        status: "INVALID",
        requiresConfirmation: false,
        isDestructive: false,
        warnings: [`Target batch (${targetTasks.length}) melebihi batas ${MAX_BATCH_ACTIONS}.`],
        planner: "heuristic",
        provider: "fallback",
        createdAt: new Date().toISOString(),
      };
    }

    if (targetTasks.length === 0) {
      return {
        id: planId,
        userPrompt: cleanPrompt,
        assistantMessage: `Tidak ditemukan task yang sesuai dengan kriteria batch Anda.`,
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

    // 3.1 Bulk Delete Batch
    if (lower.includes("hapus") || lower.includes("delete") || lower.includes("buang")) {
      const batchActions: AiAction[] = targetTasks.map((t, idx) => ({
        id: `act_${Date.now()}_del_${idx + 1}`,
        type: "DELETE_TASK",
        summary: `Hapus task "${t.title}".`,
        riskLevel: "HIGH",
        requiredRole: "MEMBER",
        status: "NEEDS_CONFIRMATION",
        isDestructive: true,
        requiresConfirmation: true,
        payload: { id: t.id, name: t.title, projectId: t.projectId },
      }));

      const previewLines = targetTasks.map((t, idx) => `${idx + 1}. ${t.title}`);
      return {
        id: planId,
        userPrompt: cleanPrompt,
        assistantMessage: `⚠️ Anda akan menghapus **${targetTasks.length} task** secara massal:\n\n${previewLines.join("\n")}\n\nTindakan ini bersifat destruktif dan memerlukan konfirmasi.`,
        actions: batchActions,
        status: "NEEDS_CONFIRMATION",
        requiresConfirmation: true,
        isDestructive: true,
        warnings: [`Akan menghapus ${targetTasks.length} task secara permanen.`],
        planner: "heuristic",
        provider: "fallback",
        createdAt: new Date().toISOString(),
      };
    }

    // 3.2 Batch Assignment ("assign semua task Development ke Marchelino", "assign semua task di phase Development Phase ke Marchelino")
    const assignMatch = cleanPrompt.match(/(?:assign|tugaskan|kasih).*?(?:ke|kepada)\s+([A-Za-z]+)/i);
    if (assignMatch && assignMatch[1]) {
      const targetMemberName = assignMatch[1].trim();
      const resMem = resolveWorkspaceMember(targetMemberName, context.members);
      if (resMem.isAmbiguous) {
        return {
          id: planId,
          userPrompt: cleanPrompt,
          assistantMessage: resMem.clarificationPrompt || `Ditemukan beberapa anggota bernama "${targetMemberName}".`,
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

      const batchActions: AiAction[] = targetTasks.map((t, idx) => ({
        id: `act_${Date.now()}_asgn_${idx + 1}`,
        type: "ASSIGN_TASK",
        summary: `Tugaskan task "${t.title}" ke ${resMem.member?.name || targetMemberName}.`,
        riskLevel: "MEDIUM",
        requiredRole: "MEMBER",
        status: "READY",
        requiresConfirmation: targetTasks.length > 3,
        payload: {
          taskId: t.id,
          taskTitle: t.title,
          projectId: t.projectId,
          assigneeName: resMem.member?.name || targetMemberName,
          assigneeId: resMem.member?.userId,
        },
      }));

      const previewLines = targetTasks.map((t, idx) => `${idx + 1}. ${t.title}`);
      return {
        id: planId,
        userPrompt: cleanPrompt,
        assistantMessage: `Saya menemukan **${targetTasks.length} task**:\n\n${previewLines.join("\n")}\n\nAksi: Tugaskan ke **${resMem.member?.name || targetMemberName}**.`,
        actions: batchActions,
        status: targetTasks.length > 3 ? "NEEDS_CONFIRMATION" : "READY",
        requiresConfirmation: targetTasks.length > 3,
        isDestructive: false,
        warnings: [],
        planner: "heuristic",
        provider: "fallback",
        createdAt: new Date().toISOString(),
      };
    }

    // 3.3 Batch Priority Update ("ubah semua task backend jadi high priority")
    let targetPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT" | undefined = undefined;
    if (lower.includes("urgent") || lower.includes("kritis") || lower.includes("penting")) targetPriority = "URGENT";
    else if (lower.includes("high") || lower.includes("tinggi")) targetPriority = "HIGH";
    else if (lower.includes("medium") || lower.includes("sedang")) targetPriority = "MEDIUM";
    else if (lower.includes("low") || lower.includes("rendah")) targetPriority = "LOW";

    if (targetPriority) {
      const batchActions: AiAction[] = targetTasks.map((t, idx) => ({
        id: `act_${Date.now()}_prio_${idx + 1}`,
        type: "UPDATE_TASK",
        summary: `Ubah prioritas task "${t.title}" menjadi ${targetPriority}.`,
        riskLevel: "MEDIUM",
        requiredRole: "MEMBER",
        status: "READY",
        requiresConfirmation: targetTasks.length > 3,
        payload: {
          taskId: t.id,
          taskTitle: t.title,
          projectId: t.projectId,
          priority: targetPriority,
        },
      }));

      const previewLines = targetTasks.map((t, idx) => `${idx + 1}. ${t.title}`);
      return {
        id: planId,
        userPrompt: cleanPrompt,
        assistantMessage: `Saya menemukan **${targetTasks.length} task**:\n\n${previewLines.join("\n")}\n\nAksi: Ubah prioritas → **${targetPriority}**.`,
        actions: batchActions,
        status: targetTasks.length > 3 ? "NEEDS_CONFIRMATION" : "READY",
        requiresConfirmation: targetTasks.length > 3,
        isDestructive: false,
        warnings: [],
        planner: "heuristic",
        provider: "fallback",
        createdAt: new Date().toISOString(),
      };
    }

    // 3.4 Batch Status Update ("selesaikan semua task...", "ubah status semua task ke done")
    let targetStatus: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "BLOCKED" | undefined = undefined;
    if (lower.includes("selesaikan") || lower.includes("done") || lower.includes("selesai")) targetStatus = "DONE";
    else if (lower.includes("in progress") || lower.includes("dikerjakan")) targetStatus = "IN_PROGRESS";
    else if (lower.includes("in review") || lower.includes("review")) targetStatus = "IN_REVIEW";
    else if (lower.includes("todo") || lower.includes("buka kembali")) targetStatus = "TODO";
    else if (lower.includes("blocked") || lower.includes("terblokir")) targetStatus = "BLOCKED";

    if (targetStatus) {
      const batchActions: AiAction[] = targetTasks.map((t, idx) => ({
        id: `act_${Date.now()}_stat_${idx + 1}`,
        type: "UPDATE_TASK",
        summary: `Ubah status task "${t.title}" menjadi ${targetStatus}.`,
        riskLevel: "MEDIUM",
        requiredRole: "MEMBER",
        status: "READY",
        requiresConfirmation: targetTasks.length > 3,
        payload: {
          taskId: t.id,
          taskTitle: t.title,
          projectId: t.projectId,
          status: targetStatus,
        },
      }));

      const previewLines = targetTasks.map((t, idx) => `${idx + 1}. ${t.title}`);
      return {
        id: planId,
        userPrompt: cleanPrompt,
        assistantMessage: `Saya menemukan **${targetTasks.length} task**:\n\n${previewLines.join("\n")}\n\nAksi: Ubah status → **${targetStatus}**.`,
        actions: batchActions,
        status: targetTasks.length > 3 ? "NEEDS_CONFIRMATION" : "READY",
        requiresConfirmation: targetTasks.length > 3,
        isDestructive: false,
        warnings: [],
        planner: "heuristic",
        provider: "fallback",
        createdAt: new Date().toISOString(),
      };
    }
  }

  // 4. Project Update Intent ("ubah deadline project ...", "rename project ...", "ubah status project ...")
  const isProjectUpdateIntent =
    (lower.includes("project") || lower.includes("projek") || lower.includes("proyek")) &&
    (lower.includes("ubah deadline") ||
      lower.includes("ganti deadline") ||
      lower.includes("update deadline") ||
      lower.includes("rename project") ||
      lower.includes("ubah nama project") ||
      lower.includes("ganti nama project") ||
      lower.includes("ubah status project"));

  if (isProjectUpdateIntent) {
    let targetProjectId = context.currentProjectId;
    let targetProjectName = context.currentProjectName || "Project";

    const projMatch =
      cleanPrompt.match(/(?:project|projek|proyek)\s+([^,\.\n]+?)(?:\s+(?:jadi|ke|menjadi|sampai|tanggal|dengan)|$)/i);
    if (projMatch && projMatch[1]) {
      const resProj = resolveWorkspaceProject(projMatch[1].trim(), context);
      if (resProj.project) {
        targetProjectId = resProj.project.id;
        targetProjectName = resProj.project.name;
      }
    }

    let newDeadlineStr: string | undefined = undefined;
    const dateMatch = cleanPrompt.match(/(?:jadi|ke|menjadi|sampai|tanggal|deadline)\s+([0-9]{1,2}\s+[A-Za-z]+(?:\s+[0-9]{4})?|[0-9]{4}-[0-9]{2}-[0-9]{2}|besok|lusa|next\s+week|akhir\s+bulan)/i);
    if (dateMatch && dateMatch[1]) {
      const resolvedDate = resolveNaturalDate(dateMatch[1], context.serverTime);
      if (resolvedDate) {
        newDeadlineStr = resolvedDate.isoDate;
      }
    }

    let newProjectName: string | undefined = undefined;
    const renameMatch = cleanPrompt.match(/(?:rename\s+project|ubah\s+nama\s+project|ganti\s+nama\s+project)\s+([^,\.\n]+?)\s+(?:menjadi|jadi|ke)\s+([^,\.\n]+)/i);
    if (renameMatch && renameMatch[2]) {
      newProjectName = renameMatch[2].trim();
    }

    actions.push({
      id: `act_${Date.now()}_upd_proj`,
      type: "UPDATE_PROJECT",
      summary: `Perbarui project "${newProjectName || targetProjectName}"${newDeadlineStr ? ` dengan deadline ${newDeadlineStr}` : ""}.`,
      riskLevel: "HIGH",
      requiredRole: "MEMBER",
      status: "READY",
      payload: {
        id: targetProjectId,
        projectId: targetProjectId,
        projectName: targetProjectName,
        name: newProjectName || targetProjectName,
        deadline: newDeadlineStr,
      },
    });

    return {
      id: planId,
      userPrompt: cleanPrompt,
      assistantMessage: `Saya telah memperbarui rencana proyek **"${newProjectName || targetProjectName}"**${newDeadlineStr ? ` dengan deadline baru **${newDeadlineStr}**` : ""}.`,
      actions,
      status: "READY",
      requiresConfirmation: false,
      isDestructive: false,
      warnings,
      planner: "heuristic",
      provider: "fallback",
      createdAt: new Date().toISOString(),
    };
  }

  // 5. Phase Update / Rename Intent ("rename phase ...")
  const isRenamePhase =
    (lower.startsWith("rename phase") || lower.startsWith("rename fase") || lower.startsWith("ubah nama phase") || lower.startsWith("ganti nama phase")) &&
    (lower.includes("menjadi") || lower.includes("jadi") || lower.includes("ke"));

  if (isRenamePhase) {
    const renameMatch = cleanPrompt.match(/(?:rename\s+phase|rename\s+fase|ubah\s+nama\s+phase|ganti\s+nama\s+phase)\s+([^,\.\n]+?)\s+(?:menjadi|jadi|ke)\s+([^,\.\n]+)/i);
    if (renameMatch && renameMatch[1] && renameMatch[2]) {
      const oldName = renameMatch[1].trim();
      const newName = renameMatch[2].trim();
      const resPhase = resolveWorkspacePhase(oldName, context, context.currentProjectId);

      actions.push({
        id: `act_${Date.now()}_renph`,
        type: "UPDATE_PHASE",
        summary: `Ubah nama fase "${resPhase.selectedEntity?.name || oldName}" menjadi "${newName}".`,
        riskLevel: "MEDIUM",
        requiredRole: "MEMBER",
        status: "READY",
        payload: {
          phaseId: resPhase.selectedEntity?.id,
          name: newName,
          projectId: resPhase.selectedEntity?.projectId || context.currentProjectId,
        },
      });

      return {
        id: planId,
        userPrompt: cleanPrompt,
        assistantMessage: `Mengubah nama fase **"${resPhase.selectedEntity?.name || oldName}"** menjadi **"${newName}"**.`,
        actions,
        status: "READY",
        requiresConfirmation: false,
        isDestructive: false,
        warnings,
        planner: "heuristic",
        provider: "fallback",
        createdAt: new Date().toISOString(),
      };
    }
  }

  // 6. Task Move Operation ("pindahkan task homepage ke phase development", "pindahkan ke phase development")
  const isMoveTask =
    lower.startsWith("pindahkan") || lower.startsWith("move") || lower.includes("pindahkan task") || lower.includes("move task");

  if (isMoveTask) {
    if (lower.includes(" ke ") || lower.includes(" ke phase ") || lower.includes(" ke fase ")) {
      let targetTaskQuery: string | undefined = undefined;
      let targetPhaseQuery: string | undefined = undefined;

      const directPhaseMatch = cleanPrompt.match(/^(?:tolong\s+)?(?:pindahkan|move)\s+(?:ke\s+phase|ke\s+fase|ke)\s+([^,\.\n]+)/i);
      const moveMatch = cleanPrompt.match(/(?:pindahkan|move)\s+(?:task\s+)?([^,\.\n]+?)\s+(?:ke\s+phase|ke\s+fase|ke)\s+([^,\.\n]+)/i);

      if (directPhaseMatch && directPhaseMatch[1]) {
        targetPhaseQuery = directPhaseMatch[1].trim();
      } else if (moveMatch && moveMatch[1] && moveMatch[2]) {
        targetTaskQuery = moveMatch[1].trim();
        targetPhaseQuery = moveMatch[2].trim();
      }

      if (targetPhaseQuery) {
        const resTask = resolveContextualTask(targetTaskQuery, context, context.currentProjectId);
        if (resTask.isAmbiguous) {
          return {
            id: planId,
            userPrompt: cleanPrompt,
            assistantMessage: resTask.clarificationPrompt || `Terdapat beberapa task aktif yang dapat dipindahkan.`,
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

        const resolvedTask = resTask.entity;
        const projId = resolvedTask?.projectId || context.currentProjectId;
        const resPhase = resolveWorkspacePhase(targetPhaseQuery, context, projId);

        actions.push({
          id: `act_${Date.now()}_move`,
          type: "UPDATE_TASK",
          summary: `Pindahkan task "${resolvedTask?.title || targetTaskQuery}" ke fase "${resPhase.selectedEntity?.name || targetPhaseQuery}".`,
          riskLevel: "MEDIUM",
          requiredRole: "MEMBER",
          status: "READY",
          payload: {
            taskId: resolvedTask?.id,
            taskTitle: resolvedTask?.title || targetTaskQuery,
            projectId: projId,
            phaseId: resPhase.selectedEntity?.id,
            phaseName: resPhase.selectedEntity?.name || targetPhaseQuery,
          },
        });

        return {
          id: planId,
          userPrompt: cleanPrompt,
          assistantMessage: `Memindahkan task **"${resolvedTask?.title || targetTaskQuery}"** ke fase **"${resPhase.selectedEntity?.name || targetPhaseQuery}"**.`,
          actions,
          status: "READY",
          requiresConfirmation: false,
          isDestructive: false,
          warnings,
          planner: "heuristic",
          provider: "fallback",
          createdAt: new Date().toISOString(),
        };
      }
    } else {
      const taskName = cleanPrompt.replace(/^(?:tolong\s+)?(?:pindahkan|move)\s+(?:task\s+)?/i, "").trim();
      return {
        id: planId,
        userPrompt: cleanPrompt,
        assistantMessage: `Ke fase mana task **"${taskName}"** ingin dipindahkan?`,
        actions: [],
        status: "NEEDS_CLARIFICATION",
        requiresConfirmation: false,
        isDestructive: false,
        warnings: [],
        needsClarification: true,
        clarificationsNeeded: [`Ke fase mana task "${taskName}" ingin dipindahkan?`],
        planner: "heuristic",
        provider: "fallback",
        createdAt: new Date().toISOString(),
      };
    }
  }

  // 7. Task Unassign Operation ("hapus assignee Homepage", "unassign Homepage", "lepas Marchelino dari Homepage")
  const isUnassignTask =
    lower.includes("hapus assignee") ||
    lower.includes("unassign") ||
    lower.includes("lepas assignee") ||
    (lower.startsWith("lepas ") && lower.includes("dari"));

  if (isUnassignTask) {
    let taskName = cleanPrompt
      .replace(/^(?:tolong\s+)?(?:hapus\s+assignee|unassign|lepas\s+assignee)\s+(?:task\s+)?/i, "")
      .replace(/^(?:lepas\s+[A-Za-z]+\s+dari\s+(?:task\s+)?)/i, "")
      .trim();

    const resTask = resolveContextualTask(taskName, context, context.currentProjectId);
    const targetTask = resTask.entity;
    actions.push({
      id: `act_${Date.now()}_unasgn`,
      type: "UPDATE_TASK",
      summary: `Hapus penugasan anggota dari task "${targetTask?.title || taskName}".`,
      riskLevel: "MEDIUM",
      requiredRole: "MEMBER",
      status: "READY",
      payload: {
        taskId: targetTask?.id,
        taskTitle: targetTask?.title || taskName,
        projectId: targetTask?.projectId || context.currentProjectId,
        unassign: true,
        assigneeId: null,
      },
    });

    return {
      id: planId,
      userPrompt: cleanPrompt,
      assistantMessage: `Menghapus penugasan dari task **"${targetTask?.title || taskName}"**.`,
      actions,
      status: "READY",
      requiresConfirmation: false,
      isDestructive: false,
      warnings,
      planner: "heuristic",
      provider: "fallback",
      createdAt: new Date().toISOString(),
    };
  }

  // 8. Multi-Field Task Update ("ubah Homepage: deadline 12 September, priority urgent, assign ke Sarah")
  const isMultiFieldTaskUpdate =
    cleanPrompt.includes(":") ||
    (lower.startsWith("ubah ") &&
      (lower.includes("deadline") || lower.includes("priority") || lower.includes("prioritas") || lower.includes("assign")) &&
      (lower.includes(",") || lower.includes(" dan ")));

  if (isMultiFieldTaskUpdate) {
    const taskNameRaw = cleanPrompt
      .replace(/^(?:tolong\s+)?(?:ubah\s+task|ubah|update\s+task|update)\s+/i, "")
      .split(/[:,\n]/)[0]
      .trim();

    const resTask = resolveWorkspaceTask(taskNameRaw, context, context.currentProjectId);

    // Extract deadline
    const dateMatch = cleanPrompt.match(/(?:deadline|tenggat|due)\s*(?::|\s)?\s*([0-9]{1,2}\s+[A-Za-z]+(?:\s+[0-9]{4})?|[0-9]{4}-[0-9]{2}-[0-9]{2}|besok|lusa|next\s+week|akhir\s+bulan)/i);
    let parsedDeadline: string | undefined = undefined;
    if (dateMatch && dateMatch[1]) {
      const resolved = resolveNaturalDate(dateMatch[1], context.serverTime);
      if (resolved) parsedDeadline = resolved.isoDate;
    }

    // Extract priority
    let parsedPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT" | undefined = undefined;
    if (lower.includes("urgent") || lower.includes("kritis")) parsedPriority = "URGENT";
    else if (lower.includes("high") || lower.includes("tinggi")) parsedPriority = "HIGH";
    else if (lower.includes("medium") || lower.includes("sedang")) parsedPriority = "MEDIUM";
    else if (lower.includes("low") || lower.includes("rendah")) parsedPriority = "LOW";

    // Extract assignee
    const assignMatch = cleanPrompt.match(/(?:assign|tugaskan|kasih)\s+ke\s+([A-Za-z]+)/i);
    let parsedAssignee: string | undefined = undefined;
    if (assignMatch && assignMatch[1]) {
      parsedAssignee = assignMatch[1].trim();
    }

    // Extract status
    let parsedStatus: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "BLOCKED" | undefined = undefined;
    if (lower.includes("status done") || lower.includes("status selesai")) parsedStatus = "DONE";
    else if (lower.includes("status in progress")) parsedStatus = "IN_PROGRESS";
    else if (lower.includes("status in review")) parsedStatus = "IN_REVIEW";
    else if (lower.includes("status todo")) parsedStatus = "TODO";
    else if (lower.includes("status blocked")) parsedStatus = "BLOCKED";

    if (parsedDeadline || parsedPriority || parsedAssignee || parsedStatus) {
      actions.push({
        id: `act_${Date.now()}_multifield`,
        type: "UPDATE_TASK",
        summary: `Perbarui task "${resTask.task?.title || taskNameRaw}".`,
        riskLevel: "MEDIUM",
        requiredRole: "MEMBER",
        status: "READY",
        payload: {
          taskId: resTask.task?.id,
          taskTitle: resTask.task?.title || taskNameRaw,
          projectId: resTask.task?.projectId || context.currentProjectId,
          dueDate: parsedDeadline,
          priority: parsedPriority,
          assigneeName: parsedAssignee,
          status: parsedStatus,
        },
      });

      return {
        id: planId,
        userPrompt: cleanPrompt,
        assistantMessage: `Memperbarui task **"${resTask.task?.title || taskNameRaw}"**.`,
        actions,
        status: "READY",
        requiresConfirmation: false,
        isDestructive: false,
        warnings,
        planner: "heuristic",
        provider: "fallback",
        createdAt: new Date().toISOString(),
      };
    }
  }

  // 9. Task Assignment Intent ("assign API Payment Gateway ke Sarah", "assign task ini ke Bob")
  // 9. Task Assignment Intent ("assign API Payment Gateway ke Sarah", "assign task ini ke Bob", "assign ke Sarah")
  const isAssignTask =
    (lower.startsWith("assign ") || lower.startsWith("tugaskan ") || lower.startsWith("kasih ")) &&
    lower.includes(" ke ");

  if (isAssignTask) {
    let taskQuery: string | undefined = undefined;
    let memberQuery: string | undefined = undefined;

    const directAssignMatch = cleanPrompt.match(/^(?:tolong\s+)?(?:assign|tugaskan|kasih)\s+ke\s+([A-Za-z]+)/i);
    const fullAssignMatch = cleanPrompt.match(/(?:assign|tugaskan|kasih)\s+(?:task\s+)?([^,\.\n]+?)\s+ke\s+([A-Za-z]+)/i);

    if (directAssignMatch && directAssignMatch[1]) {
      memberQuery = directAssignMatch[1].trim();
    } else if (fullAssignMatch && fullAssignMatch[1] && fullAssignMatch[2]) {
      taskQuery = fullAssignMatch[1].trim();
      memberQuery = fullAssignMatch[2].trim();
    }

    if (memberQuery) {
      const resTask = resolveContextualTask(taskQuery, context, context.currentProjectId);
      const resMem = resolveContextualMember(memberQuery, context);

      if (resMem.isAmbiguous) {
        return {
          id: planId,
          userPrompt: cleanPrompt,
          assistantMessage: resMem.clarificationPrompt || `Ditemukan beberapa anggota bernama "${memberQuery}".`,
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
          assistantMessage: resTask.clarificationPrompt || `Terdapat beberapa task yang cocok.`,
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

      actions.push({
        id: `act_${Date.now()}_asgn`,
        type: "ASSIGN_TASK",
        summary: `Tugaskan task "${targetTask?.title || taskQuery || "Task"}" kepada ${targetMember?.name || memberQuery}.`,
        riskLevel: "MEDIUM",
        requiredRole: "MEMBER",
        status: "READY",
        payload: {
          taskId: targetTask?.id,
          taskTitle: targetTask?.title || taskQuery,
          projectId: targetTask?.projectId || context.currentProjectId,
          assigneeName: targetMember?.name || memberQuery,
          assigneeId: targetMember?.userId,
        },
      });

      return {
        id: planId,
        userPrompt: cleanPrompt,
        assistantMessage: `Menugaskan task **"${targetTask?.title || taskQuery || "Task"}"** kepada **${targetMember?.name || memberQuery}**.`,
        actions,
        status: "READY",
        requiresConfirmation: false,
        isDestructive: false,
        warnings,
        planner: "heuristic",
        provider: "fallback",
        createdAt: new Date().toISOString(),
      };
    }
  }

  // 10. Task Status Change Intent ("selesaikan task Desain Homepage", "mark Desain Homepage as done")
  const isStatusChange =
    lower.startsWith("selesaikan ") ||
    lower.startsWith("mark ") ||
    lower.includes("ubah status") ||
    lower.includes("ganti status") ||
    lower.includes("buka kembali");

  if (isStatusChange) {
    let targetStatus: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "BLOCKED" = "DONE";
    if (lower.includes("in progress") || lower.includes("dikerjakan")) targetStatus = "IN_PROGRESS";
    else if (lower.includes("in review") || lower.includes("review")) targetStatus = "IN_REVIEW";
    else if (lower.includes("todo") || lower.includes("buka kembali")) targetStatus = "TODO";
    else if (lower.includes("blocked") || lower.includes("terblokir")) targetStatus = "BLOCKED";

    let taskQuery = cleanPrompt
      .replace(/^(?:tolong\s+)?(?:selesaikan|mark\s+as\s+done|mark)\s+(?:task\s+)?/i, "")
      .replace(/^(?:tolong\s+)?(?:ubah\s+status|ganti\s+status)\s+(?:task\s+)?/i, "")
      .replace(/^(?:buka\s+kembali)\s+(?:task\s+)?/i, "")
      .replace(/\s+(?:menjadi|jadi|ke|as)\s+(?:done|in\s+progress|in\s+review|todo|blocked|selesai).*$/i, "")
      .replace(/\s+statusnya\s+(?:done|in\s+progress|in\s+review|todo|blocked|selesai).*$/i, "")
      .trim();

    if (taskQuery || context.currentTaskId || context.recentEntities?.tasks?.length === 1) {
      const resTask = resolveContextualTask(taskQuery || undefined, context, context.currentProjectId);
      if (resTask.isAmbiguous) {
        return {
          id: planId,
          userPrompt: cleanPrompt,
          assistantMessage: resTask.clarificationPrompt || `Terdapat beberapa task yang cocok.`,
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
      if (targetTask || taskQuery) {
        actions.push({
          id: `act_${Date.now()}_stat`,
          type: "UPDATE_TASK",
          summary: `Ubah status task "${targetTask?.title || taskQuery}" menjadi ${targetStatus}.`,
          riskLevel: "MEDIUM",
          requiredRole: "MEMBER",
          status: "READY",
          payload: {
            taskId: targetTask?.id,
            taskTitle: targetTask?.title || taskQuery,
            projectId: targetTask?.projectId || context.currentProjectId,
            status: targetStatus,
          },
        });

        return {
          id: planId,
          userPrompt: cleanPrompt,
          assistantMessage: `Mengubah status task **"${targetTask?.title || taskQuery}"** menjadi **${targetStatus}**.`,
          actions,
          status: "READY",
          requiresConfirmation: false,
          isDestructive: false,
          warnings,
          planner: "heuristic",
          provider: "fallback",
          createdAt: new Date().toISOString(),
        };
      }
    }
  }

  // 11. Task Priority Change Intent ("ubah priority Desain Homepage jadi urgent", "ubah priority jadi urgent")
  const isPriorityChange =
    (lower.includes("priority") || lower.includes("prioritas") || lower.includes("urgent") || lower.includes("jadi high")) &&
    (lower.includes("ubah") || lower.includes("ganti") || lower.includes("bikin") || lower.includes("set"));

  if (isPriorityChange) {
    let targetPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT" = "HIGH";
    if (lower.includes("urgent") || lower.includes("kritis") || lower.includes("penting")) targetPriority = "URGENT";
    else if (lower.includes("high") || lower.includes("tinggi")) targetPriority = "HIGH";
    else if (lower.includes("medium") || lower.includes("sedang")) targetPriority = "MEDIUM";
    else if (lower.includes("low") || lower.includes("rendah")) targetPriority = "LOW";

    let taskQuery = cleanPrompt
      .replace(/^(?:tolong\s+)?(?:ubah|ganti|bikin|set)\s+(?:priority|prioritas)?\s+(?:task\s+)?/i, "")
      .replace(/\s+(?:menjadi|jadi|ke)\s+(?:high|low|medium|urgent|tinggi|rendah|sedang|kritis|penting)(?:\s+priority|\s+prioritas)?.*$/i, "")
      .replace(/\s+jadi\s+(?:high|low|medium|urgent|tinggi|rendah|sedang|kritis|penting)\s+priority.*$/i, "")
      .trim();

    if (taskQuery || context.currentTaskId || context.recentEntities?.tasks?.length === 1) {
      const resTask = resolveContextualTask(taskQuery || undefined, context, context.currentProjectId);
      if (resTask.isAmbiguous) {
        return {
          id: planId,
          userPrompt: cleanPrompt,
          assistantMessage: resTask.clarificationPrompt || `Terdapat beberapa task yang cocok.`,
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
      if (targetTask) {
        actions.push({
          id: `act_${Date.now()}_prio`,
          type: "UPDATE_TASK",
          summary: `Ubah prioritas task "${targetTask.title}" menjadi ${targetPriority}.`,
          riskLevel: "MEDIUM",
          requiredRole: "MEMBER",
          status: "READY",
          payload: {
            taskId: targetTask.id,
            taskTitle: targetTask.title,
            projectId: targetTask.projectId || context.currentProjectId,
            priority: targetPriority,
          },
        });

        return {
          id: planId,
          userPrompt: cleanPrompt,
          assistantMessage: `Mengubah prioritas task **"${targetTask.title}"** menjadi **${targetPriority}**.`,
          actions,
          status: "READY",
          requiresConfirmation: false,
          isDestructive: false,
          warnings,
          planner: "heuristic",
          provider: "fallback",
          createdAt: new Date().toISOString(),
        };
      }
    }
  }

  // 12. Task Deadline Change Intent ("ubah deadline task Desain Homepage jadi 10 September", "ubah deadline jadi besok", "deadline Jumat")
  const isDeadlineChange =
    (lower.startsWith("deadline") ||
      lower.startsWith("tenggat") ||
      lower.includes("deadline") ||
      lower.includes("tenggat") ||
      lower.includes("due date")) &&
    !lower.includes("project") &&
    !lower.includes("projek");

  if (isDeadlineChange) {
    let taskQuery = cleanPrompt
      .replace(/^(?:tolong\s+)?(?:ubah|ganti)\s+deadline\s+(?:task\s+)?/i, "")
      .replace(/^(?:deadline\s+(?:task\s+)?)/i, "")
      .replace(/\s+(?:jadi|ke|menjadi|sampai|tanggal)\s+.*$/i, "")
      .trim();

    const dateMatch = cleanPrompt.match(/(?:jadi|ke|menjadi|sampai|tanggal|deadline|tenggat)\s*([0-9]{1,2}\s+[A-Za-z]+(?:\s+[0-9]{4})?|[0-9]{4}-[0-9]{2}-[0-9]{2}|besok|lusa|next\s+week|akhir\s+bulan|kemarin|minggu\s+ini|akhir\s+minggu\s+ini|jumat|senin|selasa|rabu|kamis|sabtu|minggu|friday|monday|tuesday|wednesday|thursday|saturday|sunday)/i);
    let newDeadline: string | undefined = undefined;

    const rawDateText = cleanPrompt
      .replace(/^(?:tolong\s+)?(?:ubah|ganti)?\s*(?:deadline|tenggat|due\s+date)?(?:\s*-nya|\s+nya)?\s*(?:task\s+[^,\.\n]+?)?\s*(?:jadi|ke|menjadi|sampai|tanggal)?\s*/i, "")
      .trim();
    let resolvedDate = resolveNaturalDate(rawDateText, context.serverTime);
    if (!resolvedDate && dateMatch && dateMatch[1]) {
      resolvedDate = resolveNaturalDate(dateMatch[1], context.serverTime);
    }
    if (resolvedDate) {
      newDeadline = resolvedDate.isoDate;
    }

    if (
      taskQuery &&
      (resolveNaturalDate(taskQuery, context.serverTime) ||
        taskQuery.toLowerCase() === rawDateText.toLowerCase() ||
        (dateMatch && taskQuery.toLowerCase().includes(dateMatch[1].toLowerCase())))
    ) {
      taskQuery = "";
    }

    if (newDeadline) {
      const resTask = resolveContextualTask(taskQuery || undefined, context, context.currentProjectId);
      if (resTask.isAmbiguous) {
        return {
          id: planId,
          userPrompt: cleanPrompt,
          assistantMessage: resTask.clarificationPrompt || `Terdapat beberapa task yang cocok.`,
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
      if (targetTask) {
        actions.push({
          id: `act_${Date.now()}_due`,
          type: "UPDATE_TASK",
          summary: `Ubah deadline task "${targetTask.title}" menjadi ${newDeadline}.`,
          riskLevel: "MEDIUM",
          requiredRole: "MEMBER",
          status: "READY",
          payload: {
            taskId: targetTask.id,
            taskTitle: targetTask.title,
            projectId: targetTask.projectId || context.currentProjectId,
            dueDate: newDeadline,
          },
        });

        return {
          id: planId,
          userPrompt: cleanPrompt,
          assistantMessage: `Mengubah deadline task **"${targetTask.title}"** menjadi **${newDeadline}**.`,
          actions,
          status: "READY",
          requiresConfirmation: false,
          isDestructive: false,
          warnings,
          planner: "heuristic",
          provider: "fallback",
          createdAt: new Date().toISOString(),
        };
      }
    } else if (taskQuery || context.currentTaskId) {
      return {
        id: planId,
        userPrompt: cleanPrompt,
        assistantMessage: `Kapan tenggat waktu (deadline) baru yang Anda inginkan untuk task **"${taskQuery || "tersebut"}"**?`,
        actions: [],
        status: "NEEDS_CLARIFICATION",
        requiresConfirmation: false,
        isDestructive: false,
        warnings: [],
        needsClarification: true,
        clarificationsNeeded: [`Kapan deadline baru untuk task "${taskQuery || "tersebut"}"?`],
        planner: "heuristic",
        provider: "fallback",
        createdAt: new Date().toISOString(),
      };
    }
  }

  // 13. Task Rename Intent ("rename task Desain Homepage jadi Landing Page UI", "rename task ini jadi Landing Page V2")
  const isRenameTask =
    (lower.startsWith("rename task") || lower.startsWith("ubah nama task") || lower.startsWith("ganti nama task")) &&
    (lower.includes("menjadi") || lower.includes("jadi") || lower.includes("ke"));

  if (isRenameTask) {
    const renameMatch = cleanPrompt.match(/(?:rename\s+task|ubah\s+nama\s+task|ganti\s+nama\s+task)\s+([^,\.\n]+?)\s+(?:menjadi|jadi|ke)\s+([^,\.\n]+)/i);
    if (renameMatch && renameMatch[1] && renameMatch[2]) {
      const oldName = renameMatch[1].trim();
      const newName = renameMatch[2].trim();
      const resTask = resolveContextualTask(oldName, context, context.currentProjectId);
      const targetTask = resTask.entity;

      actions.push({
        id: `act_${Date.now()}_rentsk`,
        type: "UPDATE_TASK",
        summary: `Ubah judul task "${targetTask?.title || oldName}" menjadi "${newName}".`,
        riskLevel: "MEDIUM",
        requiredRole: "MEMBER",
        status: "READY",
        payload: {
          taskId: targetTask?.id,
          taskTitle: targetTask?.title || oldName,
          projectId: targetTask?.projectId || context.currentProjectId,
          title: newName,
        },
      });

      return {
        id: planId,
        userPrompt: cleanPrompt,
        assistantMessage: `Mengubah judul task **"${targetTask?.title || oldName}"** menjadi **"${newName}"**.`,
        actions,
        status: "READY",
        requiresConfirmation: false,
        isDestructive: false,
        warnings,
        planner: "heuristic",
        provider: "fallback",
        createdAt: new Date().toISOString(),
      };
    }
  }

  // 14. Delete Task Intent ("hapus task QA Regression Testing", "hapus task itu", "hapus itu")
  const isDeleteTask =
    (lower.startsWith("hapus task") ||
      lower.startsWith("delete task") ||
      lower.startsWith("buang task") ||
      lower === "hapus itu" ||
      lower === "delete itu" ||
      (lower.includes("hapus") && lower.includes("task"))) &&
    !lower.includes("semua task");

  if (isDeleteTask) {
    let rawTaskName: string | undefined = cleanPrompt.replace(/^(?:tolong\s+)?(?:hapus|delete|buang)\s+(?:task\s+)?/i, "").trim();
    if (rawTaskName === "itu" || rawTaskName === "tadi" || rawTaskName === "tersebut" || rawTaskName === "") {
      rawTaskName = undefined;
    }
    const resTask = resolveContextualTask(rawTaskName, context, context.currentProjectId);
    if (resTask.isAmbiguous) {
      return {
        id: planId,
        userPrompt: cleanPrompt,
        assistantMessage: resTask.clarificationPrompt || `Terdapat beberapa task yang cocok.`,
        actions: [],
        status: "NEEDS_CLARIFICATION",
        requiresConfirmation: false,
        isDestructive: false,
        warnings: [],
        needsClarification: true,
        clarificationsNeeded: [resTask.clarificationPrompt || ""],
        clarificationState: {
          id: `clar_${Date.now()}`,
          workspaceId: context.workspaceId,
          userId: context.userId,
          entityType: "TASK",
          query: rawTaskName || "Task",
          originalActionType: "DELETE_TASK",
          candidates: resTask.candidateDetails?.map((c) => ({ id: c.id, name: c.name, secondaryText: c.secondaryText })) || resTask.candidates.map((name) => ({ id: name, name })),
          allowMultiSelect: false,
          message: resTask.clarificationPrompt || `Terdapat beberapa task yang cocok.`,
          createdAt: new Date().toISOString(),
        },
        planner: "heuristic",
        provider: "fallback",
        createdAt: new Date().toISOString(),
      };
    }

    const targetTask = resTask.entity;
    actions.push({
      id: `act_${Date.now()}_deltask`,
      type: "DELETE_TASK",
      summary: `Hapus task "${targetTask?.title || rawTaskName || "Task"}" secara permanen.`,
      riskLevel: "HIGH",
      requiredRole: "MEMBER",
      status: "NEEDS_CONFIRMATION",
      isDestructive: true,
      requiresConfirmation: true,
      payload: {
        id: targetTask?.id,
        name: targetTask?.title || rawTaskName || "Task",
        title: targetTask?.title || rawTaskName || "Task",
        projectId: targetTask?.projectId || context.currentProjectId,
      },
    });

    return {
      id: planId,
      userPrompt: cleanPrompt,
      assistantMessage: `⚠️ Anda akan menghapus task **"${targetTask?.title || rawTaskName || "Task"}"** secara permanen. Tindakan ini memerlukan konfirmasi.`,
      actions,
      status: "NEEDS_CONFIRMATION",
      requiresConfirmation: true,
      isDestructive: true,
      warnings: ["Task akan dihapus dari project secara permanen."],
      planner: "heuristic",
      provider: "fallback",
      createdAt: new Date().toISOString(),
    };
  }

  // 15. Delete Phase Intent ("hapus phase Testing Phase")
  const isDeletePhase =
    (lower.startsWith("hapus phase") ||
      lower.startsWith("hapus fase") ||
      lower.startsWith("delete phase") ||
      (lower.includes("hapus") && (lower.includes("phase") || lower.includes("fase")))) &&
    !lower.includes("project") &&
    !lower.includes("task");

  if (isDeletePhase) {
    const rawPhaseName = cleanPrompt.replace(/^(?:tolong\s+)?(?:hapus|delete|buang)\s+(?:delivery\s+)?(?:phase|fase)\s*/i, "").trim();
    const resPhase = resolveWorkspacePhase(rawPhaseName, context, context.currentProjectId);

    actions.push({
      id: `act_${Date.now()}_delphase`,
      type: "DELETE_PHASE",
      summary: `Hapus fase "${resPhase.selectedEntity?.name || rawPhaseName}".`,
      riskLevel: "HIGH",
      requiredRole: "ADMIN",
      status: "NEEDS_CONFIRMATION",
      isDestructive: true,
      requiresConfirmation: true,
      payload: {
        id: resPhase.selectedEntity?.id,
        name: resPhase.selectedEntity?.name || rawPhaseName,
        projectId: resPhase.selectedEntity?.projectId || context.currentProjectId,
      },
    });

    return {
      id: planId,
      userPrompt: cleanPrompt,
      assistantMessage: `⚠️ Anda akan menghapus fase **"${resPhase.selectedEntity?.name || rawPhaseName}"**. Tindakan ini memerlukan konfirmasi.`,
      actions,
      status: "NEEDS_CONFIRMATION",
      requiresConfirmation: true,
      isDestructive: true,
      warnings: ["Fase akan dihapus. Task di dalam fase ini akan menjadi tidak terikat fase."],
      planner: "heuristic",
      provider: "fallback",
      createdAt: new Date().toISOString(),
    };
  }

  // 16. Delete Project Intent ("hapus project Website Cafe & Resto", "hapus project itu")
  const isDeleteProject =
    (lower.includes("hapus") || lower.includes("delete") || lower.includes("buang")) &&
    (lower.includes("project") || lower.includes("projek") || lower.includes("proyek")) &&
    !lower.includes("task") &&
    !lower.includes("phase");

  if (isDeleteProject) {
    const rawTarget = cleanPrompt.replace(/^(?:tolong\s+)?(?:hapus|delete|buang)\s+(?:project|projek|proyek)\s*/i, "").trim();
    const resProj = resolveContextualProject(rawTarget || undefined, context);

    if (resProj.isAmbiguous) {
      return {
        id: planId,
        userPrompt: cleanPrompt,
        assistantMessage: resProj.clarificationPrompt || `Terdapat beberapa project yang cocok dengan "${rawTarget}".`,
        actions: [],
        status: "NEEDS_CLARIFICATION",
        requiresConfirmation: true,
        isDestructive: true,
        warnings: [],
        needsClarification: true,
        clarificationsNeeded: [resProj.clarificationPrompt || ""],
        clarificationState: {
          id: `clar_${Date.now()}`,
          workspaceId: context.workspaceId,
          userId: context.userId,
          entityType: "PROJECT",
          query: rawTarget || "Project",
          originalActionType: "DELETE_PROJECT",
          candidates: resProj.candidates.map((name) => ({ id: name, name })),
          allowMultiSelect: false,
          message: resProj.clarificationPrompt || `Terdapat beberapa project yang cocok dengan "${rawTarget}".`,
          createdAt: new Date().toISOString(),
        },
        planner: "heuristic",
        provider: "fallback",
        createdAt: new Date().toISOString(),
      };
    }

    const targetProj = resProj.entity;
    actions.push({
      id: `act_${Date.now()}_delproj`,
      type: "DELETE_PROJECT",
      summary: `Hapus seluruh project "${targetProj?.name || rawTarget}" beserta seluruh fase dan task di dalamnya secara permanen.`,
      riskLevel: "CRITICAL",
      requiredRole: "ADMIN",
      status: "NEEDS_CONFIRMATION",
      isDestructive: true,
      requiresConfirmation: true,
      payload: {
        id: targetProj?.id,
        name: targetProj?.name || rawTarget,
      },
    });

    return {
      id: planId,
      userPrompt: cleanPrompt,
      assistantMessage: `⚠️ Anda akan menghapus project **"${targetProj?.name || rawTarget}"** secara permanen beserta seluruh fase dan tugasnya. Tindakan ini memerlukan konfirmasi eksplisit.`,
      actions,
      status: "NEEDS_CONFIRMATION",
      requiresConfirmation: true,
      isDestructive: true,
      warnings: ["Seluruh fase, task, dan riwayat project akan dihapus secara permanen."],
      planner: "heuristic",
      provider: "fallback",
      createdAt: new Date().toISOString(),
    };
  }

  // 17. Add Member Intent ("tambahkan Sarah dan Marchelino ke project ini")
  const isAddProjectMember =
    lower.includes("tambahkan") ||
    lower.includes("tambah") ||
    lower.includes("masukkan") ||
    lower.includes("add") ||
    lower.includes("libatkan") ||
    (lower.includes("ikut") && (lower.includes("project") || lower.includes("projek")));

  if (isAddProjectMember && !lower.includes("task") && !lower.includes("tugas")) {
    let targetProjectName = context.currentProjectName;
    let targetProjectId = context.currentProjectId;

    const projMatch =
      cleanPrompt.match(/(?:di|pada|ke)\s+(?:projek|project|proyek)\s+([^,\.\n]+?)(?:\s+tambahkan|\s+tambah|\s+masukkan|$)/i) ||
      cleanPrompt.match(/(?:ke|pada)\s+(?:projek|project|proyek)\s+([^,\.\n]+)/i);

    if (projMatch && projMatch[1]) {
      const pName = projMatch[1].trim();
      const resProj = resolveWorkspaceProject(pName, context);
      if (resProj.project) {
        targetProjectId = resProj.project.id;
        targetProjectName = resProj.project.name;
      }
    }

    const namesToProcess: string[] = [];
    const memberRegex = /(?:tambahkan|tambah|masukkan|add|libatkan|sama)\s+([A-Za-z\s,dan&]+?)(?:\s+ke|\s+pada|\s+sebagai|\s+ikut|$)/i;
    const match = cleanPrompt.match(memberRegex);
    if (match && match[1]) {
      const parts = match[1].split(/,|\s+dan\s+|\s+and\s+|\s+&\s+/i);
      parts.forEach((p) => {
        const cleanName = p.trim().replace(/^(?:team|member|anggota)\s+/i, "");
        if (cleanName && !["project", "projek", "proyek", "team", "member", "anggota", "ini"].includes(cleanName.toLowerCase())) {
          namesToProcess.push(cleanName);
        }
      });
    }

    for (const name of namesToProcess) {
      actions.push({
        id: `act_${Date.now()}_${actions.length + 1}`,
        type: "ADD_MEMBER",
        summary: `Tambahkan ${name} ke tim proyek "${targetProjectName || "aktif"}".`,
        riskLevel: "MEDIUM",
        requiredRole: "MEMBER",
        status: "READY",
        requiresConfirmation: false,
        payload: {
          projectId: targetProjectId || "",
          projectName: targetProjectName,
          userName: name,
          role: "MEMBER",
        },
      });
    }

    if (actions.length > 0) {
      assistantMessage = `Saya telah menyiapkan penambahan **${actions.length} anggota tim** ke proyek **"${targetProjectName || "terkait"}"**.`;
      return {
        id: planId,
        userPrompt: cleanPrompt,
        assistantMessage,
        actions,
        status: "READY",
        requiresConfirmation: false,
        isDestructive: false,
        warnings,
        planner: "heuristic",
        provider: "fallback",
        createdAt: new Date().toISOString(),
      };
    }
  }

  // 18. Create Task Intent ("buat task UI Design")
  const isCreateTask =
    lower.includes("buat task") ||
    lower.includes("buatkan task") ||
    lower.includes("bikin task") ||
    lower.includes("tambah task") ||
    lower.includes("tambahkan task");

  if (isCreateTask) {
    let taskTitle = cleanPrompt
      .replace(/^(?:tolong\s+)?(?:buat|buatkan|bikin|tambah|tambahkan)\s+task\s+(?:untuk\s+)?/i, "")
      .replace(/\s+(?:dan\s+assign|assign|dan\s+kasih|kasih|ke).*$/i, "")
      .trim();

    // Check if project was specified inline (e.g. "buat task Login Page di Website Cafe" or "untuk project Cafe")
    let explicitProject: string | undefined = undefined;
    const projMatch = taskTitle.match(/(?:di|pada|untuk)\s+(?:project|projek|proyek)\s+([^,\.\n]+)/i);
    if (projMatch && projMatch[1]) {
      explicitProject = projMatch[1].trim();
      taskTitle = taskTitle.replace(/(?:di|pada|untuk)\s+(?:project|projek|proyek)\s+[^,\.\n]+/i, "").trim();
    }

    // Check if phase was specified inline (e.g. "di phase Development")
    let explicitPhase: string | undefined = undefined;
    const phaseMatch = taskTitle.match(/(?:di|pada)\s+(?:phase|fase)\s+([^,\.\n]+)/i);
    if (phaseMatch && phaseMatch[1]) {
      explicitPhase = phaseMatch[1].trim();
      taskTitle = taskTitle.replace(/(?:di|pada)\s+(?:phase|fase)\s+[^,\.\n]+/i, "").trim();
    }

    // Resolve Contextual Project
    const resProj = resolveContextualProject(explicitProject, context);
    const targetProjId = resProj.entity?.id || context.currentProjectId;
    const targetProjName = resProj.entity?.name || context.currentProjectName;

    // Resolve Contextual Phase
    const resPhase = resolveContextualPhase(explicitPhase, context, targetProjId);

    // Extract explicit priority
    let taskPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT" = "MEDIUM";
    if (lower.includes("urgent") || lower.includes("kritis")) taskPriority = "URGENT";
    else if (lower.includes("high priority") || lower.includes("prioritas tinggi")) taskPriority = "HIGH";
    else if (lower.includes("low priority") || lower.includes("prioritas rendah")) taskPriority = "LOW";

    // Extract explicit deadline
    const dateMatch = cleanPrompt.match(/(?:deadline|tenggat|due)\s*(?::|\s)?\s*([0-9]{1,2}\s+[A-Za-z]+(?:\s+[0-9]{4})?|[0-9]{4}-[0-9]{2}-[0-9]{2}|besok|lusa|next\s+week|akhir\s+bulan|kemarin|minggu\s+ini)/i);
    let taskDeadline: string | undefined = undefined;
    if (dateMatch && dateMatch[1]) {
      const resolved = resolveNaturalDate(dateMatch[1], context.serverTime);
      if (resolved) taskDeadline = resolved.isoDate;
    }

    let assigneeName: string | undefined = undefined;
    let assigneeId: string | undefined = undefined;
    const assignMatch = cleanPrompt.match(/(?:assign|kasih|tugas)\s+ke\s+([A-Za-z]+)/i);
    if (assignMatch && assignMatch[1]) {
      assigneeName = assignMatch[1].trim();
      const resMem = resolveContextualMember(assigneeName, context);
      if (resMem.entity) {
        assigneeId = resMem.entity.userId;
        assigneeName = resMem.entity.name;
      }
    }

    actions.push({
      id: `act_${Date.now()}_tsk`,
      type: "CREATE_TASK",
      summary: `Buat task "${taskTitle}"${targetProjName ? ` di project "${targetProjName}"` : ""}${resPhase.entity?.name ? ` (${resPhase.entity.name})` : ""}${assigneeName ? ` dan assign ke ${assigneeName}` : ""}.`,
      riskLevel: "MEDIUM",
      requiredRole: "MEMBER",
      status: "READY",
      payload: {
        title: taskTitle,
        projectId: targetProjId,
        projectName: targetProjName,
        phaseId: resPhase.entity?.id,
        phaseName: resPhase.entity?.name,
        priority: taskPriority,
        status: "TODO",
        dueDate: taskDeadline,
        assigneeName,
        assigneeId,
      },
    });

    const projectContextNotice = targetProjName ? ` di project **"${targetProjName}"**` : "";
    const phaseContextNotice = resPhase.entity?.name ? ` (Fase: **${resPhase.entity.name}**)` : "";
    return {
      id: planId,
      userPrompt: cleanPrompt,
      assistantMessage: `Saya telah menyiapkan pembuatan task **"${taskTitle}"**${projectContextNotice}${phaseContextNotice}${assigneeName ? ` untuk **${assigneeName}**` : ""}.`,
      actions,
      status: "READY",
      requiresConfirmation: false,
      isDestructive: false,
      warnings,
      planner: "heuristic",
      provider: "fallback",
      createdAt: new Date().toISOString(),
    };
  }

  // 19. Create Phase Intent ("buat phase Launching")
  const isCreatePhase =
    (lower.includes("buat phase") ||
      lower.includes("buat delivery phase") ||
      lower.includes("buat fase") ||
      lower.includes("bikin phase") ||
      lower.includes("tambah phase")) &&
    !lower.includes("buat project") &&
    !lower.includes("buat task");

  if (isCreatePhase) {
    const rawNames = cleanPrompt.replace(/^(?:tolong\s+)?(?:buat|bikin|tambah)\s+(?:delivery\s+)?(?:phase|fase)\s+/i, "").trim();
    const parts = rawNames.split(/,|\s+dan\s+|\s+and\s+/i);

    parts.forEach((p, idx) => {
      const cleanP = p.trim();
      if (cleanP) {
        actions.push({
          id: `act_${Date.now()}_ph_${idx + 1}`,
          type: "CREATE_PHASE",
          summary: `Buat fase "${cleanP}".`,
          riskLevel: "MEDIUM",
          requiredRole: "MEMBER",
          status: "READY",
          payload: {
            name: cleanP,
            order: idx + 1,
            projectId: context.currentProjectId,
          },
        });
      }
    });

    return {
      id: planId,
      userPrompt: cleanPrompt,
      assistantMessage: `Saya telah menyiapkan pembuatan **${actions.length} fase delivery**.`,
      actions,
      status: "READY",
      requiresConfirmation: false,
      isDestructive: false,
      warnings,
      planner: "heuristic",
      provider: "fallback",
      createdAt: new Date().toISOString(),
    };
  }

  // 20. Incomplete Task Update Prompt ("ubah Desain Homepage")
  if (lower.startsWith("ubah ") || lower.startsWith("update ")) {
    const taskNameRaw = cleanPrompt.replace(/^(?:tolong\s+)?(?:ubah\s+task|ubah|update\s+task|update)\s+/i, "").trim();
    return {
      id: planId,
      userPrompt: cleanPrompt,
      assistantMessage: `Apa yang ingin Anda ubah dari task **"${taskNameRaw}"**? Anda dapat mengubah deadline, prioritas, status, fase, atau penugasan anggota.`,
      actions: [],
      status: "NEEDS_CLARIFICATION",
      requiresConfirmation: false,
      isDestructive: false,
      warnings: [],
      needsClarification: true,
      clarificationsNeeded: [`Apa yang ingin diubah dari task "${taskNameRaw}"?`],
      planner: "heuristic",
      provider: "fallback",
      createdAt: new Date().toISOString(),
    };
  }

  // 21. Fallback Guidance / Clarification
  return {
    id: planId,
    userPrompt: cleanPrompt,
    assistantMessage:
      "Saya belum memahami instruksi secara spesifik.\n\nContoh yang bisa saya bantu:\n• *'Buatkan project website bakery, deadline 1 September'*\n• *'Ubah deadline task Desain Homepage jadi 10 September'*\n• *'Assign API Payment Gateway ke Sarah'*\n• *'Pindahkan task Desain Homepage ke phase Development Phase'*\n• *'Ubah semua task backend jadi high priority'*\n• *'Hapus task QA Regression Testing'*\n• *'Hapus project Website Cafe & Resto'*",
    actions: [],
    status: "NEEDS_CLARIFICATION",
    requiresConfirmation: false,
    isDestructive: false,
    warnings: [],
    needsClarification: true,
    clarificationsNeeded: [
      "Mohon berikan instruksi yang lebih jelas terkait proyek, tugas, atau anggota tim yang ingin dikelola.",
    ],
    planner: "heuristic",
    provider: "fallback",
    createdAt: new Date().toISOString(),
  };
}
