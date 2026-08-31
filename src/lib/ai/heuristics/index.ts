import {
  AiAction,
  AiExecutionContext,
  AiPlan,
  AiCreationMode,
  AIProjectPlan,
  MAX_BATCH_ACTIONS,
} from "../types";
import { resolveNaturalDate } from "../dateResolver";
import {
  resolveWorkspaceMember,
  resolveWorkspaceProject,
  resolveWorkspaceTask,
  resolveWorkspacePhase,
} from "../entityResolver";
import {
  resolveContextualProject,
  resolveContextualPhase,
  resolveContextualTask,
  resolveContextualMember,
} from "../contextResolver";
import { extractExplicitRequirements } from "../requirementExtractor";
import { validateStrictProjectPlan } from "../projectPlanValidator";

// Matchers
import { matchContextRules } from "./contextRules";
import { matchReadRules } from "./readRules";

/**
 * Modular Heuristic Natural Language Parser (Offline Fallback Engine)
 * Coordinates specialized sub-parsers across project, task, member, phase, read, and compound operations.
 */
export function parseHeuristicIntent(
  prompt: string,
  context: AiExecutionContext,
  mode: AiCreationMode = "STRICT"
): AiPlan {
  const cleanPrompt = prompt.trim();
  const lower = cleanPrompt.toLowerCase();
  const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // 0. Direct Cancellation Interceptor
  const isCancelCommand = /^(?:batal|cancel|batalkan|jangan|tidak jadi|gak jadi|nggak jadi)(?:\s+deh|\s+ya)?$/i.test(cleanPrompt);
  if (isCancelCommand) {
    return {
      id: planId,
      userPrompt: cleanPrompt,
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

  const heuristicCtx = { prompt, cleanPrompt, lower, context, planId, mode };

  // 1. Context switching & correction rules
  const contextPlan = matchContextRules(heuristicCtx);
  if (contextPlan) return contextPlan;

  // 2. Read queries & reporting
  const readPlan = matchReadRules(heuristicCtx);
  if (readPlan) return readPlan;

  const actions: AiAction[] = [];
  const warnings: string[] = [];
  let assistantMessage = "";

  // 3. Create Project Intent
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
      phases = [
        { name: "Konsep & Perencanaan", order: 1, tasks: [] },
        { name: "Desain & UI/UX", order: 2, tasks: [] },
        { name: "Development", order: 3, tasks: [] },
        { name: "Testing & QA", order: 4, tasks: [] },
        { name: "Deployment & Launch", order: 5, tasks: [] },
      ];
    } else {
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
      initialTasks.push(
        { title: "Scope & Requirements", phaseName: phases[0]?.name || "Planning", priority: "HIGH" },
        { title: "UI Mockups & Design System", phaseName: phases[1]?.name || phases[0]?.name, priority: "MEDIUM" },
        { title: "Frontend Architecture", phaseName: phases[2]?.name || phases[0]?.name, priority: "HIGH" },
        { title: "Backend API Integration", phaseName: phases[2]?.name || phases[0]?.name, priority: "HIGH" },
        { title: "QA Testing & Verification", phaseName: phases[3]?.name || phases[0]?.name, priority: "MEDIUM" },
        { title: "Production Deployment", phaseName: phases[4]?.name || phases[0]?.name, priority: "URGENT" }
      );
    }

    // Check task assignments
    const assignMatch = cleanPrompt.match(/(?:assign\s+task|tugaskan\s+task|kasih\s+task)\s+([^,\.\n]+?)\s+ke\s+([A-Za-z]+)/i);
    if (assignMatch && assignMatch[1] && assignMatch[2]) {
      const matchTitle = assignMatch[1].trim().toLowerCase();
      const matchAssignee = assignMatch[2].trim();
      const foundTask = initialTasks.find((t) => t.title.toLowerCase().includes(matchTitle));
      if (foundTask) {
        foundTask.assigneeName = matchAssignee;
      }
    }

    const canonicalPlan: AIProjectPlan = {
      mode,
      project: {
        name: projectName,
        description: `Project generated by Synplan AI (${mode} mode): "${cleanPrompt}"`,
        deadline,
        status: "ACTIVE",
        color: "#0284C7",
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

    const validationRes = validateStrictProjectPlan(canonicalPlan, constraints);

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

    if (constraints.exactMembers && constraints.exactMembers.length > 0) {
      constraints.exactMembers.forEach((memName, idx) => {
        const found = (context.members || []).find(
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

    const taskMatches = cleanPrompt.matchAll(/(?:task|tugas)\s+([^,\.\n]+?)(?:,|\.|\s+assign|\s+ke|$)/gi);
    for (const tm of taskMatches) {
      const tTitle = tm[1]?.trim();
      if (tTitle && tTitle.length > 2 && !["baru", "ini", "projek", "project", "phase", "fase", "testing"].includes(tTitle.toLowerCase())) {
        const foundAssignee = (context.members || []).find((m) =>
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

  // 4. Batch Operations
  const isBatchIntent =
    lower.includes("semua task") ||
    lower.includes("all task") ||
    lower.includes("all tasks") ||
    lower.includes("seluruh task") ||
    lower.includes("semua tugas");

  if (isBatchIntent) {
    let targetTasks = [...(context.tasks || [])];

    const projMatch = cleanPrompt.match(/(?:di|pada|untuk)\s+(?:project|projek|proyek)\s+([^,\.\n]+)/i);
    if (projMatch && projMatch[1]) {
      const resProj = resolveWorkspaceProject(projMatch[1].trim(), context);
      if (resProj.project) {
        targetTasks = targetTasks.filter((t) => t.projectId === resProj.project?.id);
      }
    } else if (context.currentProjectId) {
      targetTasks = targetTasks.filter((t) => t.projectId === context.currentProjectId);
    }

    const phaseMatch = cleanPrompt.match(/(?:di\s+phase|di\s+fase|phase|fase)\s+([^,\.\n]+?)(?:\s+(?:ke|jadi|menjadi|untuk|dengan|sebagai)|$)/i);
    if (phaseMatch && phaseMatch[1]) {
      const resPhase = resolveWorkspacePhase(phaseMatch[1].trim(), context);
      if (resPhase.selectedEntity) {
        targetTasks = targetTasks.filter((t) => t.phaseId === resPhase.selectedEntity?.id);
      }
    }

    if (lower.includes("belum selesai") || lower.includes("pending") || lower.includes("todo")) {
      targetTasks = targetTasks.filter((t) => t.status !== "DONE");
    }

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

    // 4.1 Bulk Delete Batch
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

    // 4.2 Batch Assignment
    const assignMatch = cleanPrompt.match(/(?:assign|tugaskan|kasih).*?(?:ke|kepada)\s+([A-Za-z]+)/i);
    if (assignMatch && assignMatch[1]) {
      const targetMemberName = assignMatch[1].trim();
      const resMem = resolveWorkspaceMember(targetMemberName, context.members || []);
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

    // 4.3 Batch Priority
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

    // 4.4 Batch Status
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

  // 5. Project Update Intent ("ubah deadline project...", "rename project...")
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

  // 6. Phase Rename Intent
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

  // 7. Move Task Operation
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

  // 8. Task Unassign Operation
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

  // 9. Multi-Field Task Update
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

    const dateMatch = cleanPrompt.match(/(?:deadline|tenggat|due)\s*(?::|\s)?\s*([0-9]{1,2}\s+[A-Za-z]+(?:\s+[0-9]{4})?|[0-9]{4}-[0-9]{2}-[0-9]{2}|besok|lusa|next\s+week|akhir\s+bulan)/i);
    let parsedDeadline: string | undefined = undefined;
    if (dateMatch && dateMatch[1]) {
      const resolved = resolveNaturalDate(dateMatch[1], context.serverTime);
      if (resolved) parsedDeadline = resolved.isoDate;
    }

    let parsedPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT" | undefined = undefined;
    if (lower.includes("urgent") || lower.includes("kritis")) parsedPriority = "URGENT";
    else if (lower.includes("high") || lower.includes("tinggi")) parsedPriority = "HIGH";
    else if (lower.includes("medium") || lower.includes("sedang")) parsedPriority = "MEDIUM";
    else if (lower.includes("low") || lower.includes("rendah")) parsedPriority = "LOW";

    const assignMatch = cleanPrompt.match(/(?:assign|tugaskan|kasih)\s+ke\s+([A-Za-z]+)/i);
    let parsedAssignee: string | undefined = undefined;
    if (assignMatch && assignMatch[1]) {
      parsedAssignee = assignMatch[1].trim();
    }

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

  // 10. Task Assignment Intent
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

  // 11. Task Status Change Intent ("selesaikan task Desain Homepage", "mark Desain Homepage as done")
  const isStatusChange =
    lower.startsWith("selesaikan") ||
    lower.startsWith("mark ") ||
    lower.startsWith("tandai ") ||
    lower.includes("jadi done") ||
    lower.includes("menjadi done") ||
    lower.includes("status in progress") ||
    lower.includes("status in review") ||
    lower.includes("status blocked") ||
    lower.includes("status todo");

  if (isStatusChange) {
    let targetStatus: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "BLOCKED" = "DONE";
    if (lower.includes("in progress") || lower.includes("dikerjakan")) targetStatus = "IN_PROGRESS";
    else if (lower.includes("in review") || lower.includes("review")) targetStatus = "IN_REVIEW";
    else if (lower.includes("blocked") || lower.includes("terblokir")) targetStatus = "BLOCKED";
    else if (lower.includes("todo") || lower.includes("buka kembali")) targetStatus = "TODO";

    let taskName = cleanPrompt
      .replace(/^(?:tolong\s+)?(?:selesaikan|mark|tandai)\s+(?:task\s+)?/i, "")
      .replace(/\s+(?:sebagai|jadi|menjadi|as)?\s+(?:done|selesai|in progress|in review|blocked|todo).*$/i, "")
      .trim();

    const resTask = resolveContextualTask(taskName, context, context.currentProjectId);
    if (resTask.isAmbiguous) {
      return {
        id: planId,
        userPrompt: cleanPrompt,
        assistantMessage: resTask.clarificationPrompt || `Terdapat beberapa task aktif.`,
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
    actions.push({
      id: `act_${Date.now()}_status`,
      type: "UPDATE_TASK",
      summary: `Ubah status task "${targetTask?.title || taskName}" menjadi ${targetStatus}.`,
      riskLevel: "MEDIUM",
      requiredRole: "MEMBER",
      status: "READY",
      payload: {
        taskId: targetTask?.id,
        taskTitle: targetTask?.title || taskName,
        projectId: targetTask?.projectId || context.currentProjectId,
        status: targetStatus,
      },
    });

    return {
      id: planId,
      userPrompt: cleanPrompt,
      assistantMessage: `Mengubah status task **"${targetTask?.title || taskName}"** menjadi **${targetStatus}**.`,
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

  // 12. Task Priority Change Intent ("ubah priority task ... jadi urgent")
  const isPriorityChange =
    (lower.startsWith("ubah prioritas") ||
      lower.startsWith("ganti prioritas") ||
      lower.startsWith("ubah priority") ||
      lower.startsWith("ganti priority") ||
      lower.includes("jadi urgent") ||
      lower.includes("jadi high") ||
      lower.includes("jadi medium") ||
      lower.includes("jadi low") ||
      lower.includes("prioritas tinggi") ||
      lower.includes("prioritas urgent")) &&
    !lower.includes("semua task");

  if (isPriorityChange) {
    let targetPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT" = "HIGH";
    if (lower.includes("urgent") || lower.includes("kritis")) targetPriority = "URGENT";
    else if (lower.includes("high") || lower.includes("tinggi")) targetPriority = "HIGH";
    else if (lower.includes("medium") || lower.includes("sedang")) targetPriority = "MEDIUM";
    else if (lower.includes("low") || lower.includes("rendah")) targetPriority = "LOW";

    let taskName = cleanPrompt
      .replace(/^(?:tolong\s+)?(?:ubah|ganti)\s+(?:prioritas|priority)\s+(?:task\s+)?/i, "")
      .replace(/\s+(?:menjadi|jadi|ke)\s+(?:urgent|high|medium|low|tinggi|sedang|rendah|kritis).*$/i, "")
      .trim();

    const resTask = resolveContextualTask(taskName, context, context.currentProjectId);
    const targetTask = resTask.entity;

    actions.push({
      id: `act_${Date.now()}_prio`,
      type: "UPDATE_TASK",
      summary: `Ubah prioritas task "${targetTask?.title || taskName}" menjadi ${targetPriority}.`,
      riskLevel: "MEDIUM",
      requiredRole: "MEMBER",
      status: "READY",
      payload: {
        taskId: targetTask?.id,
        taskTitle: targetTask?.title || taskName,
        projectId: targetTask?.projectId || context.currentProjectId,
        priority: targetPriority,
      },
    });

    return {
      id: planId,
      userPrompt: cleanPrompt,
      assistantMessage: `Mengubah prioritas task **"${targetTask?.title || taskName}"** menjadi **${targetPriority}**.`,
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

  // 13. Task Deadline Update Intent ("ubah deadline task Desain Homepage jadi 10 September")
  const isDeadlineUpdate =
    (lower.startsWith("ubah deadline") ||
      lower.startsWith("ganti deadline") ||
      lower.startsWith("update deadline") ||
      lower.startsWith("mundurkan deadline") ||
      lower.startsWith("majukan deadline")) &&
    !lower.includes("project") &&
    !lower.includes("projek");

  if (isDeadlineUpdate) {
    const taskNameRaw = cleanPrompt
      .replace(/^(?:tolong\s+)?(?:ubah|ganti|update|mundurkan|majukan)\s+deadline\s+(?:task\s+)?/i, "")
      .replace(/\s+(?:menjadi|jadi|ke|sampai|tanggal)\s+.*$/i, "")
      .trim();

    const dateMatch = cleanPrompt.match(/(?:jadi|ke|menjadi|sampai|tanggal)\s+([0-9]{1,2}\s+[A-Za-z]+(?:\s+[0-9]{4})?|[0-9]{4}-[0-9]{2}-[0-9]{2}|besok|lusa|next\s+week|akhir\s+bulan)/i);
    let resolvedDeadline: string | undefined = undefined;
    if (dateMatch && dateMatch[1]) {
      const resolved = resolveNaturalDate(dateMatch[1], context.serverTime);
      if (resolved) resolvedDeadline = resolved.isoDate;
    }

    const resTask = resolveContextualTask(taskNameRaw, context, context.currentProjectId);
    const targetTask = resTask.entity;

    actions.push({
      id: `act_${Date.now()}_deadline`,
      type: "UPDATE_TASK",
      summary: `Perbarui deadline task "${targetTask?.title || taskNameRaw}" menjadi ${resolvedDeadline || "tanggal baru"}.`,
      riskLevel: "MEDIUM",
      requiredRole: "MEMBER",
      status: "READY",
      payload: {
        taskId: targetTask?.id,
        taskTitle: targetTask?.title || taskNameRaw,
        projectId: targetTask?.projectId || context.currentProjectId,
        dueDate: resolvedDeadline,
      },
    });

    return {
      id: planId,
      userPrompt: cleanPrompt,
      assistantMessage: `Memperbarui deadline task **"${targetTask?.title || taskNameRaw}"** menjadi **${resolvedDeadline || "tanggal baru"}**.`,
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

  // 14. Create Task Intent
  const isCreateTask =
    /(?:buat|buatin|buatkan|bikin|bikinin|create|tambah|tambahkan|add)\s+(?:sebuah\s+)?(?:task|tugas)\s+/i.test(cleanPrompt) ||
    lower.startsWith("task baru ") ||
    lower.startsWith("tugas baru ");

  if (isCreateTask) {
    let taskTitle = cleanPrompt
      .replace(/^(?:tolong\s+)?(?:buat|buatin|buatkan|bikin|bikinin|create|tambah|tambahkan|add)\s+(?:sebuah\s+)?(?:task\s+baru|task|tugas\s+baru|tugas)\s+(?:untuk\s+)?/i, "")
      .trim();

    let assignedMemberName: string | undefined = undefined;
    let assignedMemberId: string | undefined = undefined;
    const assignMatch = taskTitle.match(/(?:dan\s+)?(?:assign|tugaskan|kasih)\s+ke\s+([A-Za-z]+)/i);
    if (assignMatch && assignMatch[1]) {
      assignedMemberName = assignMatch[1].trim();
      taskTitle = taskTitle.replace(/(?:dan\s+)?(?:assign|tugaskan|kasih)\s+ke\s+[A-Za-z]+/i, "").trim();
      const resMem = resolveWorkspaceMember(assignedMemberName, context.members || []);
      if (resMem.member) {
        assignedMemberId = resMem.member.userId;
        assignedMemberName = resMem.member.name;
      }
    }

    let targetProjectId = context.currentProjectId;
    const projMatch = taskTitle.match(/(?:di|pada|untuk)\s+(?:project|projek|proyek)\s+([^,\.\n]+)/i);
    if (projMatch && projMatch[1]) {
      const resProj = resolveWorkspaceProject(projMatch[1].trim(), context);
      if (resProj.project) {
        targetProjectId = resProj.project.id;
        taskTitle = taskTitle.replace(/(?:di|pada|untuk)\s+(?:project|projek|proyek)\s+[^,\.\n]+/i, "").trim();
      }
    }

    let targetPhaseId = context.currentPhaseId;
    const phaseMatch = taskTitle.match(/(?:di|pada|ke)\s+(?:phase|fase)\s+([^,\.\n]+)/i);
    if (phaseMatch && phaseMatch[1]) {
      const resPhase = resolveWorkspacePhase(phaseMatch[1].trim(), context, targetProjectId);
      if (resPhase.selectedEntity) {
        targetPhaseId = resPhase.selectedEntity.id;
        taskTitle = taskTitle.replace(/(?:di|pada|ke)\s+(?:phase|fase)\s+[^,\.\n]+/i, "").trim();
      }
    }

    actions.push({
      id: `act_${Date.now()}_task`,
      type: "CREATE_TASK",
      summary: `Buat task "${taskTitle}"${assignedMemberName ? ` dan tugaskan ke ${assignedMemberName}` : ""}.`,
      riskLevel: "MEDIUM",
      requiredRole: "MEMBER",
      status: "READY",
      payload: {
        title: taskTitle,
        projectId: targetProjectId,
        phaseId: targetPhaseId,
        priority: "MEDIUM",
        assigneeName: assignedMemberName,
        assigneeId: assignedMemberId,
      },
    });

    return {
      id: planId,
      userPrompt: cleanPrompt,
      assistantMessage: `Saya telah menyiapkan pembuatan task **"${taskTitle}"**${assignedMemberName ? ` untuk **${assignedMemberName}**` : ""}.`,
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

  // 15. Add Member Intent ("tambahkan Sarah dan Marchel ke project", "masukkan devon dan x ke dalam team", "tambahkan Devon Lane")
  const isAddMember =
    /(?:tambah|tambahkan|masukkan|libatkan|ikutkan|add)\s+([A-Za-z0-9\s,&]+?)\s+(?:ke|dalam|ke dalam)\s+(?:project|projek|proyek|team|tim)/i.test(cleanPrompt) ||
    /(?:tambah\s+anggota|tambahkan\s+anggota|tambah\s+member|tambahkan\s+member)\s+/i.test(cleanPrompt) ||
    /^[A-Za-z]+\s+sama\s+[A-Za-z]+\s+ikut\s+project/i.test(cleanPrompt) ||
    /(?:tambah|tambahkan|masukkan|libatkan|ikutkan)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)$/i.test(cleanPrompt);

  if (isAddMember) {
    const rawNamesMatch =
      cleanPrompt.match(/(?:tambah|tambahkan|masukkan|libatkan|ikutkan|add)\s+([A-Za-z0-9\s,&]+?)\s+(?:ke|dalam|ke dalam)\s+(?:project|projek|proyek|team|tim)/i) ||
      cleanPrompt.match(/(?:tambah\s+anggota|tambahkan\s+anggota|tambah\s+member|tambahkan\s+member)\s+([A-Za-z0-9\s,&]+)/i) ||
      cleanPrompt.match(/^([A-Za-z\s]+?)\s+ikut\s+project/i) ||
      cleanPrompt.match(/(?:tambah|tambahkan|masukkan|libatkan|ikutkan)\s+([A-Za-z0-9\s,&]+)/i);

    if (rawNamesMatch && rawNamesMatch[1]) {
      const names = rawNamesMatch[1]
        .split(/[,&]|\s+dan\s+|\s+sama\s+/)
        .map((n) => n.trim())
        .filter((n) => n.length > 0 && !["ke", "dalam", "project", "tim", "team", "proyek", "phase", "fase", "task", "tugas"].includes(n.toLowerCase()));

      let targetProjectId = context.currentProjectId;
      let targetProjectName = context.currentProjectName || "Project Aktif";

      names.forEach((name, idx) => {
        const resMem = resolveWorkspaceMember(name, context.members || []);
        const displayName = resMem.member?.name || name;
        actions.push({
          id: `act_${Date.now()}_mem_${idx + 1}`,
          type: "ADD_MEMBER",
          summary: `Tambahkan ${displayName} ke project "${targetProjectName}".`,
          riskLevel: "MEDIUM",
          requiredRole: "MEMBER",
          status: "READY",
          payload: {
            projectId: targetProjectId,
            projectName: targetProjectName,
            userName: displayName,
            userId: resMem.member?.userId,
            role: "MEMBER",
          },
        });
      });

      return {
        id: planId,
        userPrompt: cleanPrompt,
        assistantMessage: `Menambahkan **${names.join(" & ")}** ke dalam tim proyek **${targetProjectName}**.`,
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

  // 16. Delete Intent (Destructive Operations)
  const isDeleteIntent =
    lower.startsWith("hapus") ||
    lower.startsWith("delete") ||
    lower.startsWith("buang") ||
    lower.startsWith("remove") ||
    lower.includes("hapus project") ||
    lower.includes("delete project") ||
    lower.includes("hapus task") ||
    lower.includes("delete task");

  if (isDeleteIntent) {
    if (
      lower === "hapus" ||
      lower === "delete" ||
      lower === "buang" ||
      lower === "hapus ini" ||
      lower === "delete ini" ||
      lower === "buang ini"
    ) {
      return {
        id: planId,
        userPrompt: cleanPrompt,
        assistantMessage: "Apa yang ingin Anda hapus? Mohon sebutkan nama proyek atau tugas secara spesifik.",
        actions: [],
        status: "NEEDS_CLARIFICATION",
        requiresConfirmation: false,
        isDestructive: false,
        warnings: [],
        needsClarification: true,
        clarificationsNeeded: ["Sebutkan nama project atau task yang ingin dihapus."],
        planner: "heuristic",
        provider: "fallback",
        createdAt: new Date().toISOString(),
      };
    }

    // 16.1 Delete Project
    if (lower.includes("project") || lower.includes("projek") || lower.includes("proyek")) {
      const projNameRaw = cleanPrompt.replace(/^(?:tolong\s+)?(?:hapus\s+project|hapus\s+projek|hapus\s+proyek|delete\s+project|buang\s+project)\s+/i, "").trim();
      const resProj = resolveContextualProject(projNameRaw, context);

      if (resProj.isAmbiguous) {
        return {
          id: planId,
          userPrompt: cleanPrompt,
          assistantMessage: resProj.clarificationPrompt || `Ditemukan beberapa project yang cocok.`,
          actions: [],
          status: "NEEDS_CLARIFICATION",
          requiresConfirmation: true,
          isDestructive: true,
          warnings: [],
          needsClarification: true,
          clarificationsNeeded: [resProj.clarificationPrompt || "Pilih salah satu project."],
          planner: "heuristic",
          provider: "fallback",
          createdAt: new Date().toISOString(),
        };
      }

      const targetProj = resProj.entity;

      actions.push({
        id: `act_${Date.now()}_del_proj`,
        type: "DELETE_PROJECT",
        summary: `Hapus project "${targetProj?.name || projNameRaw}" beserta seluruh task di dalamnya.`,
        riskLevel: "HIGH",
        requiredRole: "ADMIN",
        status: "NEEDS_CONFIRMATION",
        isDestructive: true,
        requiresConfirmation: true,
        payload: {
          id: targetProj?.id,
          name: targetProj?.name || projNameRaw,
        },
      });

      return {
        id: planId,
        userPrompt: cleanPrompt,
        assistantMessage: `⚠️ Apakah Anda yakin ingin menghapus proyek **"${targetProj?.name || projNameRaw}"**? Semua data tugas di dalamnya akan dihapus permanen.`,
        actions,
        status: "NEEDS_CONFIRMATION",
        requiresConfirmation: true,
        isDestructive: true,
        warnings: [`Akan menghapus proyek "${targetProj?.name || projNameRaw}" dan seluruh tugasnya secara permanen.`],
        planner: "heuristic",
        provider: "fallback",
        createdAt: new Date().toISOString(),
      };
    }

    // 16.2 Delete Phase
    if (lower.includes("phase") || lower.includes("fase")) {
      const phaseNameRaw = cleanPrompt.replace(/^(?:tolong\s+)?(?:hapus\s+phase|hapus\s+fase|delete\s+phase)\s+/i, "").trim();
      const resPhase = resolveWorkspacePhase(phaseNameRaw, context, context.currentProjectId);
      const targetPhase = resPhase.selectedEntity;

      actions.push({
        id: `act_${Date.now()}_del_phase`,
        type: "DELETE_PHASE",
        summary: `Hapus fase "${targetPhase?.name || phaseNameRaw}".`,
        riskLevel: "HIGH",
        requiredRole: "ADMIN",
        status: "NEEDS_CONFIRMATION",
        isDestructive: true,
        requiresConfirmation: true,
        payload: {
          phaseId: targetPhase?.id,
          name: targetPhase?.name || phaseNameRaw,
          projectId: targetPhase?.projectId || context.currentProjectId,
        },
      });

      return {
        id: planId,
        userPrompt: cleanPrompt,
        assistantMessage: `⚠️ Apakah Anda yakin ingin menghapus fase **"${targetPhase?.name || phaseNameRaw}"**?`,
        actions,
        status: "NEEDS_CONFIRMATION",
        requiresConfirmation: true,
        isDestructive: true,
        warnings: [`Akan menghapus fase "${targetPhase?.name || phaseNameRaw}".`],
        planner: "heuristic",
        provider: "fallback",
        createdAt: new Date().toISOString(),
      };
    }

    // 16.3 Delete Task
    const taskNameRaw = cleanPrompt.replace(/^(?:tolong\s+)?(?:hapus\s+task|hapus\s+tugas|delete\s+task|buang\s+task|hapus|delete)\s+/i, "").trim();
    const resTask = resolveContextualTask(taskNameRaw, context, context.currentProjectId);
    const targetTask = resTask.entity;

    actions.push({
      id: `act_${Date.now()}_del_task`,
      type: "DELETE_TASK",
      summary: `Hapus task "${targetTask?.title || taskNameRaw}".`,
      riskLevel: "HIGH",
      requiredRole: "MEMBER",
      status: "NEEDS_CONFIRMATION",
      isDestructive: true,
      requiresConfirmation: true,
      payload: {
        id: targetTask?.id,
        name: targetTask?.title || taskNameRaw,
        projectId: targetTask?.projectId || context.currentProjectId,
      },
    });

    return {
      id: planId,
      userPrompt: cleanPrompt,
      assistantMessage: `⚠️ Apakah Anda yakin ingin menghapus task **"${targetTask?.title || taskNameRaw}"**?`,
      actions,
      status: "NEEDS_CONFIRMATION",
      requiresConfirmation: true,
      isDestructive: true,
      warnings: [`Akan menghapus task "${targetTask?.title || taskNameRaw}" secara permanen.`],
      planner: "heuristic",
      provider: "fallback",
      createdAt: new Date().toISOString(),
    };
  }

  // 17. Create Phase Intent ("buat phase Planning dan Development", "buat delivery phase Launching")
  const isCreatePhase =
    lower.startsWith("buat phase") ||
    lower.startsWith("bikin phase") ||
    lower.startsWith("tambah phase") ||
    lower.startsWith("buat fase") ||
    lower.startsWith("bikin fase") ||
    lower.startsWith("tambah fase") ||
    lower.startsWith("buat delivery phase");

  if (isCreatePhase) {
    const rawPhaseList = cleanPrompt
      .replace(/^(?:tolong\s+)?(?:buat|bikin|tambah)\s+(?:delivery\s+phase|delivery\s+fase|phase|fase)\s+/i, "")
      .trim();

    const phases = rawPhaseList
      .split(/[,&]|\s+dan\s+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    phases.forEach((pName, idx) => {
      const cleanP = pName.replace(/^(?:phase|fase)\s+/i, "");
      if (cleanP.length > 0) {
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

  // 18. Incomplete Task Update Prompt ("ubah Desain Homepage")
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

  // 19. Fallback Guidance / Clarification
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
