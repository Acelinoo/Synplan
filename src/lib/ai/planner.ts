import { AiAction, AiExecutionContext, AiPlan, ClarificationState } from "./types";
import { callExternalAiProvider } from "./provider";
import { validateAiPlan } from "./validator";
import { resolveNaturalDate } from "./dateResolver";
import { resolveWorkspaceMember, resolveClarificationAnswer } from "./entityResolver";

/**
 * Builds the comprehensive System Prompt for Gemini LLM Planner.
 * Injects complete workspace state, active contextual route/project, squad members, existing projects,
 * conversation history, relative date calculation rules, ambiguity rules, and strict JSON output schema.
 */
function buildGeminiSystemPrompt(context: AiExecutionContext): string {
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

### RULES & BEHAVIOR:
1. **Semantic Understanding**:
   - Understand all natural variations, slang, prefixes, and colloquial Indonesian (e.g. "buatin", "bikin", "susun", "tolong rancang", "projek", "proyek", "saya ingin website...", "saya butuh app...") and English.
   - Do NOT expect rigid keyword templates. Understand intent dynamically.
2. **Context & Conversational Continuity**:
   - If the user refers to "project ini", "di sini", "current project", or continues a previous project creation topic from conversation history, bind to that project context.
   - If user refers to "saya" or "me", use Current User.
3. **Multi-Action Compound Plans**:
   - If a prompt asks to create a project, delivery phases, initial tasks, and assign/add members, generate ALL required actions in sequential order.
4. **Member & Entity Matching (ZERO HALLUCINATIONS & CANDIDATE RESOLUTION)**:
   - Match requested names against the available Workspace Members provided below.
   - If a requested member does not exist in the squad (e.g., "x" or "budi"), DO NOT invent fake user IDs. Output their name in memberName/userName.
   - If multiple members match closely (ambiguous, e.g. "Andi" matching Andi Saputra and Andi Pratama, or "marhel" matching Marchel and Marshel), set "needsClarification": true and ask who they meant.
5. **Relative Dates**:
   - Today's Server Date is: ${context.serverTime || new Date().toISOString()}.
   - Convert natural dates (e.g., "1 september", "minggu depan", "akhir bulan", "besok") into exact ISO date format (YYYY-MM-DD).
6. **Ambiguity Handling**:
   - If an instruction is genuinely ambiguous, set "needsClarification": true, list matching candidates, and ask the user to clarify.

### CURRENT WORKSPACE CONTEXT:
- **Workspace**: "${context.workspaceName}" (ID: "${context.workspaceId}")
- **Active User**: "${context.userName}" (Role: "${context.userRole || "MEMBER"}", ID: "${context.userId}")
- **Active Page / Route**: "${context.activePath || "/"}"
- **Active Project Context**: ${
    context.currentProjectId
      ? `"${context.currentProjectName || "Current Project"}" (ID: "${context.currentProjectId}")`
      : "None (Global Workspace Overview)"
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
      "type": "CREATE_PROJECT" | "CREATE_PHASE" | "CREATE_TASK" | "UPDATE_PROJECT" | "UPDATE_TASK" | "ASSIGN_TASK" | "ADD_MEMBER" | "ADD_PROJECT_MEMBER" | "DELETE_PROJECT" | "DELETE_TASK",
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

import { getLatestExecutionReceipt, generateUndoPlanFromReceipt } from "./receiptStore";

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
  pendingClarification?: ClarificationState
): Promise<AiPlan> {
  const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const cleanPrompt = prompt.trim();
  const lowerPrompt = cleanPrompt.toLowerCase();
  const enrichedContext: AiExecutionContext = {
    ...context,
    conversationHistory: conversationHistory || context.conversationHistory || [],
    pendingClarification: pendingClarification || context.pendingClarification,
  };

  // 1. Direct Cancellation Interceptor
  const isCancelCommand = /^(?:batal|cancel|batalkan|jangan|tidak jadi|gak jadi|nggak jadi)(?:\s+deh|\s+ya)?$/i.test(cleanPrompt);
  if (isCancelCommand) {
    return {
      id: planId,
      userPrompt: prompt,
      assistantMessage: "Aksi dibatalkan. Tidak ada perubahan yang dilakukan ke database.",
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

  // 2. Direct Scoped Undo / Recovery Interceptor
  const isUndoCommand = /^(?:undo|undo that|batalkan yang tadi|batalkan aksi tadi|kembalikan|revert)(?:\s+ya|\s+dong)?$/i.test(cleanPrompt);
  if (isUndoCommand) {
    const latestReceipt = getLatestExecutionReceipt(enrichedContext.workspaceId, enrichedContext.userId);
    if (!latestReceipt) {
      return {
        id: planId,
        userPrompt: prompt,
        assistantMessage: "Tidak ada riwayat eksekusi sebelumnya yang dapat di-undo pada sesi ini.",
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

    const { plan: undoPlan, error } = generateUndoPlanFromReceipt(latestReceipt, enrichedContext);
    if (error || !undoPlan) {
      return {
        id: planId,
        userPrompt: prompt,
        assistantMessage: error || "Aksi sebelumnya tidak dapat dibatalkan secara otomatis.",
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

    return undoPlan;
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
      return {
        id: planId,
        userPrompt: prompt,
        assistantMessage: "Aksi dibatalkan. Tidak ada perubahan yang dilakukan.",
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
      return validatedPlan;
    }
  }

  const systemPrompt = buildGeminiSystemPrompt(enrichedContext);

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

        // Validate and enrich with server-side entity resolution
        const { validatedPlan } = validateAiPlan(rawPlan, enrichedContext);
        return validatedPlan;
      }
    }
  } catch (err: any) {
    console.warn("[AI Planner] Gemini LLM execution failed, falling back to heuristic planner:", err?.message || err);
  }

  // 3. FALLBACK PATH: Robust Heuristic NLP Engine (Offline / Degraded Mode)
  const heuristicPlan = parseHeuristicIntent(prompt, enrichedContext);
  const { validatedPlan } = validateAiPlan(heuristicPlan, enrichedContext);
  return {
    ...validatedPlan,
    planner: "heuristic",
    provider: "fallback",
  };
}

/**
 * Heuristic Natural Language Parser (Offline Fallback Engine)
 */
export function parseHeuristicIntent(prompt: string, context: AiExecutionContext): AiPlan {
  const cleanPrompt = prompt.trim();
  const lower = cleanPrompt.toLowerCase();
  const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const actions: AiAction[] = [];
  const warnings: string[] = [];
  let assistantMessage = "";

  // 1. Create Project Intent
  const isCreateProject =
    /(?:buat|buatin|buatkan|bikin|bikinin|create|setup|generate|susun|rancang|mulai|menyiapkan|ingin|mau|ayo)\s+(?:sebuah\s+)?(?:projek|project|proyek|web|website|aplikasi|app|situs|ruang kerja)/i.test(cleanPrompt) ||
    lower.includes("projek baru") ||
    lower.includes("project baru") ||
    lower.includes("proyek baru") ||
    lower.startsWith("projek ") ||
    lower.startsWith("project ");

  if (isCreateProject) {
    let projectName = "New Project";
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

    let deadline: string | undefined = undefined;
    const deadlineMatch = cleanPrompt.match(
      /(?:deadline|tenggat|target|due|selesai(?: tanggal)?)\s*(?::|\s)?\s*([0-9]{1,2}\s+[A-Za-z]+(?:\s+[0-9]{4})?|[0-9]{4}-[0-9]{2}-[0-9]{2}|satu\s+[A-Za-z]+|next\s+week|minggu\s+depan|next\s+month|bulan\s+depan|akhir\s+bulan)/i
    );
    if (deadlineMatch && deadlineMatch[1]) {
      const resolved = resolveNaturalDate(deadlineMatch[1]);
      if (resolved) deadline = resolved.isoDate;
    }

    const phases: Array<{ name: string; order: number }> = [
      { name: "Konsep & Perencanaan", order: 1 },
      { name: "Desain & UI/UX", order: 2 },
      { name: "Development", order: 3 },
      { name: "Testing & QA", order: 4 },
      { name: "Deployment & Launch", order: 5 },
    ];

    const initialTasks: Array<{
      title: string;
      description?: string;
      priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
      status?: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
      phaseName?: string;
      assigneeName?: string;
    }> = [
      { title: "Scope & Requirements", phaseName: "Konsep & Perencanaan", priority: "HIGH" },
      { title: "UI Mockups & Design System", phaseName: "Desain & UI/UX", priority: "MEDIUM" },
      { title: "Frontend Architecture", phaseName: "Development", priority: "HIGH" },
      { title: "Backend API Integration", phaseName: "Development", priority: "HIGH" },
      { title: "QA Testing & Verification", phaseName: "Testing & QA", priority: "MEDIUM" },
      { title: "Production Deployment", phaseName: "Deployment & Launch", priority: "URGENT" },
    ];

    actions.push({
      id: `act_${Date.now()}_1`,
      type: "CREATE_PROJECT",
      summary: `Buat project "${projectName}" dengan ${phases.length} tahapan dan ${initialTasks.length} tugas.`,
      riskLevel: "MEDIUM",
      requiredRole: "MEMBER",
      status: "READY",
      requiresConfirmation: true,
      payload: {
        name: projectName,
        description: `Project generated by Synplan AI: "${cleanPrompt}"`,
        deadline,
        status: "ACTIVE",
        phases,
        initialTasks,
        memberNames: [],
      },
    });

    // Check if prompt also requested custom phases
    if (lower.includes("phase") || lower.includes("fase")) {
      const phaseNames = ["Planning", "Design", "Development", "Testing", "Deployment"];
      let pOrder = 1;
      phaseNames.forEach((pn) => {
        if (lower.includes(pn.toLowerCase())) {
          actions.push({
            id: `act_${Date.now()}_phase_${pOrder}`,
            type: "CREATE_PHASE",
            summary: `Buat phase "${pn}" untuk proyek "${projectName}".`,
            riskLevel: "MEDIUM",
            requiredRole: "MEMBER",
            status: "READY",
            payload: {
              projectName,
              name: pn,
              order: pOrder++,
            },
          });
        }
      });
    }

    // Check if prompt also requested members in compound prompt
    const memberMatches = cleanPrompt.matchAll(/(?:tambahkan|libatkan|dan|serta|anggota|member|sama)\s+([A-Za-z]+)/gi);
    for (const m of memberMatches) {
      if (m[1] && !["project", "projek", "proyek", "website", "web", "phase", "fase", "tugas", "task", "sebagai", "ikut", "ke", "tim"].includes(m[1].toLowerCase())) {
        const found = context.members.find(
          (mem) => mem.name.toLowerCase().includes(m[1].toLowerCase())
        );
        if (found) {
          actions.push({
            id: `act_${Date.now()}_mem_${actions.length + 1}`,
            type: "ADD_MEMBER",
            summary: `Tambahkan ${found.name} ke tim project "${projectName}".`,
            riskLevel: "MEDIUM",
            requiredRole: "MEMBER",
            status: "READY",
            payload: {
              projectName,
              userId: found.userId,
              userName: found.name,
              role: "MEMBER",
            },
          });
        }
      }
    }

    assistantMessage = `Saya telah menyiapkan rencana proyek **"${projectName}"** lengkap dengan **${phases.length} tahapan** dan ${actions.length > 1 ? `**${actions.length - 1} aksi terkait**` : "**tugas terstruktur**"}.`;

    return {
      id: planId,
      userPrompt: cleanPrompt,
      assistantMessage,
      actions,
      status: "NEEDS_CONFIRMATION",
      requiresConfirmation: true,
      isDestructive: false,
      warnings,
      planner: "heuristic",
      provider: "fallback",
      createdAt: new Date().toISOString(),
    };
  }

  // 2. Update Project / Deadline Modification Intent
  const isUpdateProjectIntent =
    lower.includes("ubah deadline") ||
    lower.includes("ganti deadline") ||
    lower.includes("update deadline") ||
    lower.includes("perpanjang deadline") ||
    lower.includes("ubah nama project") ||
    lower.includes("ganti nama project");

  if (isUpdateProjectIntent) {
    let targetProjectId = context.currentProjectId || (context.projects[0] ? context.projects[0].id : undefined);
    let targetProjectName = context.currentProjectName || (context.projects[0] ? context.projects[0].name : "Project");

    let newDeadlineStr: string | undefined = undefined;
    const dateMatch =
      cleanPrompt.match(/(?:deadline\s+(?:jadi|ke)?|jadi|ke|menjadi|sampai|tanggal)\s+([0-9]{1,2}\s+[A-Za-z]+(?:\s+[0-9]{4})?|[A-Za-z]+\s+[0-9]{1,2}(?:st|nd|rd|th)?(?:\s+[0-9]{4})?|besok|lusa|next\s+week|akhir\s+bulan)/i) ||
      cleanPrompt.match(/([0-9]{1,2}\s+(?:januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(?:\s+[0-9]{4})?)/i);
    if (dateMatch && dateMatch[1]) {
      const resolvedDate = resolveNaturalDate(dateMatch[1], context.serverTime);
      if (resolvedDate) {
        newDeadlineStr = resolvedDate.isoDate;
      }
    }

    const action: AiAction = {
      id: `act_${Date.now()}_upd_proj`,
      type: "UPDATE_PROJECT",
      summary: `Perbarui project "${targetProjectName}"${newDeadlineStr ? ` dengan deadline ${newDeadlineStr}` : ""}.`,
      riskLevel: "HIGH",
      requiredRole: "MEMBER",
      status: "READY",
      payload: {
        id: targetProjectId,
        projectId: targetProjectId,
        name: targetProjectName,
        deadline: newDeadlineStr,
      },
    };

    return {
      id: planId,
      userPrompt: prompt,
      assistantMessage: `Saya telah memperbarui rencana proyek **"${targetProjectName}"**${newDeadlineStr ? ` dengan deadline baru **${newDeadlineStr}**` : ""}.`,
      actions: [action],
      status: "READY",
      requiresConfirmation: false,
      isDestructive: false,
      warnings: [],
      planner: "heuristic",
      provider: "fallback",
      createdAt: new Date().toISOString(),
    };
  }

  // 3. Add Member Intent
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
      const resolvedProj = context.projects.find(
        (p) =>
          p.name.toLowerCase() === pName.toLowerCase() ||
          p.name.toLowerCase().includes(pName.toLowerCase())
      );
      if (resolvedProj) {
        targetProjectId = resolvedProj.id;
        targetProjectName = resolvedProj.name;
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

  // 3. Create Task Intent
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

    let assigneeName: string | undefined = undefined;
    const assignMatch = cleanPrompt.match(/(?:assign|kasih|tugas)\s+ke\s+([A-Za-z]+)/i);
    if (assignMatch && assignMatch[1]) {
      assigneeName = assignMatch[1].trim();
    }

    actions.push({
      id: `act_${Date.now()}_tsk`,
      type: "CREATE_TASK",
      summary: `Buat task "${taskTitle}"${assigneeName ? ` dan assign ke ${assigneeName}` : ""}.`,
      riskLevel: "MEDIUM",
      requiredRole: "MEMBER",
      status: "READY",
      payload: {
        title: taskTitle,
        assigneeName,
        projectId: context.currentProjectId,
      },
    });

    return {
      id: planId,
      userPrompt: cleanPrompt,
      assistantMessage: `Saya telah menyiapkan pembuatan task **"${taskTitle}"**${assigneeName ? ` untuk **${assigneeName}**` : ""}.`,
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

  // 4. Create Phase Intent
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

  // 5. Delete Project Intent (Destructive)
  const isDeleteProject =
    (lower.includes("hapus") || lower.includes("delete") || lower.includes("buang")) &&
    (lower.includes("project") || lower.includes("projek") || lower.includes("proyek"));

  if (isDeleteProject) {
    const rawTarget = cleanPrompt.replace(/^(?:tolong\s+)?(?:hapus|delete|buang)\s+(?:project|projek|proyek)\s*/i, "").trim();
    const matched = context.projects.filter(
      (p) =>
        p.name.toLowerCase() === rawTarget.toLowerCase() ||
        p.name.toLowerCase().includes(rawTarget.toLowerCase())
    );

    if (matched.length > 1) {
      return {
        id: planId,
        userPrompt: cleanPrompt,
        assistantMessage: `Terdapat beberapa project yang cocok dengan "${rawTarget}": ${matched.map((m) => m.name).join(", ")}. Project mana yang ingin dihapus?`,
        actions: [],
        status: "NEEDS_CLARIFICATION",
        requiresConfirmation: true,
        isDestructive: true,
        warnings: [],
        needsClarification: true,
        clarificationsNeeded: [
          `Terdapat beberapa project yang cocok (${matched.map((m) => m.name).join(", ")}). Project mana yang ingin Anda hapus?`,
        ],
        planner: "heuristic",
        provider: "fallback",
        createdAt: new Date().toISOString(),
      };
    }

    const targetProject = matched[0] || context.projects.find((p) => p.id === context.currentProjectId);
    if (targetProject) {
      actions.push({
        id: `act_${Date.now()}_del`,
        type: "DELETE_PROJECT",
        summary: `Hapus project "${targetProject.name}" secara permanen.`,
        riskLevel: "HIGH",
        requiredRole: "ADMIN",
        status: "NEEDS_CONFIRMATION",
        isDestructive: true,
        requiresConfirmation: true,
        payload: {
          id: targetProject.id,
          name: targetProject.name,
          entityType: "PROJECT",
        },
      });

      return {
        id: planId,
        userPrompt: cleanPrompt,
        assistantMessage: `⚠️ Anda akan menghapus project **"${targetProject.name}"** secara permanen. Tindakan ini memerlukan konfirmasi.`,
        actions,
        status: "NEEDS_CONFIRMATION",
        requiresConfirmation: true,
        isDestructive: true,
        warnings: ["Tindakan ini akan menghapus project beserta seluruh task di dalamnya."],
        planner: "heuristic",
        provider: "fallback",
        createdAt: new Date().toISOString(),
      };
    }
  }

  // 6. Fallback Guidance
  return {
    id: planId,
    userPrompt: cleanPrompt,
    assistantMessage:
      "Saya belum memahami instruksi secara spesifik.\n\nContoh yang bisa saya bantu:\n• *'Buatkan project website bakery, deadline 1 September'*\n• *'Tambahkan Sarah dan Marchelino ke project ini'*\n• *'Tambahkan task UI Design dan assign ke Marchelino'*\n• *'Hapus project Toko Roti'*",
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
