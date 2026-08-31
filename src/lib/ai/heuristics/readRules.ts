import { HeuristicContext, HeuristicMatcher } from "./types";
import { resolveWorkspaceProject, resolveWorkspaceTask, resolveWorkspacePhase } from "../entityResolver";
import { resolveContextualProject } from "../contextResolver";

export const matchReadRules: HeuristicMatcher = (ctx) => {
  const { cleanPrompt, lower, context, planId } = ctx;

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

  if (!isReadQuery) return null;

  // 2.1 Project List Query
  if (
    lower.includes("semua project") ||
    lower.includes("semua projek") ||
    lower.includes("daftar project") ||
    lower.includes("list project") ||
    (lower.includes("project") && lower.includes("apa saja") && !lower.includes("task"))
  ) {
    const projLines = (context.projects || []).map(
      (p, idx) => `${idx + 1}. **${p.name}** — [Status: ${p.status}] (${p.totalTasks || 0} tasks${p.deadline ? `, Deadline: ${p.deadline.split("T")[0]}` : ""})`
    );
    const msg =
      context.projects && context.projects.length > 0
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
      const matchingTasks = (context.tasks || []).filter((t) => t.phaseId === resPhase.selectedEntity?.id);
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
  let taskPool = context.tasks || [];
  let scopedProjectName: string | undefined = undefined;

  const projMatch = cleanPrompt.match(/(?:di|pada|untuk)?\s*(?:project|projek|proyek)\s+([^,\.\n\?]+)/i);
  if (projMatch && projMatch[1] && !["ini", "ini?"].includes(projMatch[1].trim().toLowerCase())) {
    const resProj = resolveContextualProject(projMatch[1].trim(), context);
    if (resProj.entity) {
      taskPool = taskPool.filter((t) => t.projectId === resProj.entity?.id);
      scopedProjectName = resProj.entity.name;
    }
  } else if (context.currentProjectId) {
    const activeProj = (context.projects || []).find((p) => p.id === context.currentProjectId);
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
    const assignee = (context.members || []).find((m) => m.userId === t.assigneeId);
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
};
