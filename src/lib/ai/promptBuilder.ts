import {
  AiAction,
  AiExecutionContext,
  AiCreationMode,
} from "./types";

/**
 * Builds the comprehensive System Prompt for Gemini LLM Planner.
 * Injects complete workspace state, active contextual route/project, squad members, existing projects,
 * conversation history, relative date calculation rules, ambiguity rules, and strict JSON output schema.
 */
export function buildGeminiSystemPrompt(context: AiExecutionContext, mode: AiCreationMode = "STRICT"): string {
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

  // Bound task list serialization to recent 40 items to optimize LLM latency and context size
  const serializedTasks = (context.tasks || []).slice(0, 40).map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    projectId: t.projectId,
    phaseId: t.phaseId,
    dueDate: t.dueDate,
  }));

  const serializedPhases = (context.phases || []).slice(0, 30).map((ph) => ({
    id: ph.id,
    name: ph.name,
    projectId: ph.projectId,
    order: ph.order,
  }));

  const serializedProjects = (context.projects || []).map((p) => ({
    name: p.name,
    id: p.id,
    status: p.status,
    deadline: p.deadline,
  }));

  const serializedMembers = (context.members || []).map((m) => ({
    name: m.name,
    userId: m.userId,
    role: m.role,
    email: m.email,
  }));

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
${JSON.stringify(serializedMembers, null, 2)}
- **Existing Projects**:
${JSON.stringify(serializedProjects, null, 2)}
- **Existing Tasks in Workspace**:
${JSON.stringify(serializedTasks, null, 2)}
- **Existing Delivery Phases**:
${JSON.stringify(serializedPhases, null, 2)}
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
