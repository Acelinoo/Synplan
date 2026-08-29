import {
  AiAction,
  AiExecutionContext,
  AiPlan,
  ActionExecutionStatus,
  ActionRiskLevel,
  ClarificationState,
  ActionPreviewItem,
} from "./types";
import { ACTION_REGISTRY } from "./registry";
import { validateActionPermission } from "./permissions";
import {
  resolveWorkspaceMember,
  resolveWorkspaceProject,
  resolveWorkspaceTask,
  resolveWorkspacePhase,
} from "./entityResolver";
import { resolveNaturalDate } from "./dateResolver";
import { sortAndValidateDependencies } from "./dependencyGraph";
import { createPlanFingerprint, extractTargetEntitySnapshots } from "./confirmationStore";

export { resolveWorkspaceMember, resolveWorkspaceProject, resolveWorkspaceTask, resolveWorkspacePhase };

export interface ValidationResult {
  validatedPlan: AiPlan;
  isValid: boolean;
  errors: string[];
}

/**
 * Normalizes duplicate and conflicting actions across an action list.
 * E.g.:
 * - Duplicate ADD_MEMBER for same userId/userName -> Deduplicated to single action.
 * - Duplicate CREATE_TASK with identical title in same project -> Deduplicated to single action.
 * - Conflicting ADD_MEMBER + REMOVE_MEMBER for same user -> Flagged.
 */
export function normalizeActionConflicts(actions: AiAction[]): {
  normalizedActions: AiAction[];
  conflicts: string[];
} {
  const normalized: AiAction[] = [];
  const conflicts: string[] = [];

  const addedMemberKeys = new Set<string>();
  const removedMemberKeys = new Set<string>();
  const createdTaskKeys = new Set<string>();

  for (const act of actions) {
    // 1. ADD_MEMBER Deduplication & Conflict Check
    if (act.type === "ADD_MEMBER" || act.type === "ADD_PROJECT_MEMBER") {
      const p = act.payload;
      const memKey = (p.userId || p.userName || p.memberName || "").toLowerCase().trim();

      if (memKey) {
        if (removedMemberKeys.has(memKey)) {
          conflicts.push(`Instruksi kontradiktif: Menambahkan sekaligus menghapus anggota "${p.userName || memKey}".`);
        }
        if (addedMemberKeys.has(memKey)) {
          // Duplicate action detected — skip duplicate
          continue;
        }
        addedMemberKeys.add(memKey);
      }
    }

    // 2. REMOVE_MEMBER Conflict Check
    if (act.type === "REMOVE_MEMBER" || act.type === "REMOVE_PROJECT_MEMBER") {
      const p = act.payload;
      const memKey = (p.userId || p.userName || "").toLowerCase().trim();

      if (memKey) {
        if (addedMemberKeys.has(memKey)) {
          conflicts.push(`Instruksi kontradiktif: Menambahkan dan menghapus anggota "${p.userName || memKey}" dalam rencana yang sama.`);
        }
        removedMemberKeys.add(memKey);
      }
    }

    // 3. CREATE_TASK Deduplication
    if (act.type === "CREATE_TASK") {
      const p = act.payload;
      const taskKey = `${(p.projectId || p.projectName || "cur").toLowerCase()}:${(p.title || "").toLowerCase().trim()}`;

      if (taskKey && p.title) {
        if (createdTaskKeys.has(taskKey)) {
          // Duplicate task title in same project — skip duplicate
          continue;
        }
        createdTaskKeys.add(taskKey);
      }
    }

    normalized.push(act);
  }

  return { normalizedActions: normalized, conflicts };
}

/**
 * Generates ground-truth action previews directly from validated actions and current execution context.
 */
export function generateActionPreviews(
  actions: AiAction[],
  context: AiExecutionContext
): ActionPreviewItem[] {
  const previews: ActionPreviewItem[] = [];

  for (const act of actions) {
    const p = act.payload || {};
    let entityType: ActionPreviewItem["entityType"] = "TASK";
    let entityName = "Unknown Entity";
    const changes: ActionPreviewItem["changes"] = [];
    let warning: string | undefined = undefined;

    switch (act.type) {
      case "CREATE_TASK": {
        entityType = "TASK";
        entityName = p.title || "Task Baru";
        changes.push({ field: "Judul Task", from: null, to: p.title || "Task Baru" });
        if (p.priority) changes.push({ field: "Priority", from: null, to: p.priority });
        if (p.status) changes.push({ field: "Status", from: null, to: p.status });
        if (p.dueDate) changes.push({ field: "Deadline", from: null, to: p.dueDate.split("T")[0] });
        if (p.assigneeName) changes.push({ field: "Assignee", from: null, to: p.assigneeName });
        if (p.projectName) changes.push({ field: "Project", from: null, to: p.projectName });
        if (p.phaseName) changes.push({ field: "Fase", from: null, to: p.phaseName });
        break;
      }

      case "UPDATE_TASK": {
        entityType = "TASK";
        const existingTask = context.tasks.find((t) => t.id === p.taskId || t.title.toLowerCase() === (p.taskTitle || "").toLowerCase());
        entityName = existingTask?.title || p.taskTitle || "Task Terkait";

        if (p.title && p.title !== existingTask?.title) {
          changes.push({ field: "Judul", from: existingTask?.title || "Judul Lama", to: p.title });
        }
        if (p.status && p.status !== existingTask?.status) {
          changes.push({ field: "Status", from: existingTask?.status || "TODO", to: p.status });
        }
        if (p.priority && p.priority !== existingTask?.priority) {
          changes.push({ field: "Priority", from: existingTask?.priority || "MEDIUM", to: p.priority });
        }
        if (p.dueDate) {
          const oldDue = existingTask?.dueDate ? existingTask.dueDate.split("T")[0] : "Belum diatur";
          const newDue = p.dueDate.split("T")[0];
          if (oldDue !== newDue) {
            changes.push({ field: "Deadline", from: oldDue, to: newDue });
          }
        }
        if (p.unassign) {
          const prevMem = context.members.find((m) => m.userId === existingTask?.assigneeId);
          changes.push({ field: "Assignee", from: prevMem?.name || "Assigned", to: "Unassigned" });
        } else if (p.assigneeName || p.assigneeId) {
          const prevMem = context.members.find((m) => m.userId === existingTask?.assigneeId);
          const newMem = context.members.find((m) => m.userId === p.assigneeId) || { name: p.assigneeName };
          changes.push({ field: "Assignee", from: prevMem?.name || "Unassigned", to: newMem?.name || p.assigneeName });
        }
        if (p.phaseId || p.phaseName) {
          const fromPhase = context.phases.find((ph) => ph.id === existingTask?.phaseId);
          const toPhase = context.phases.find((ph) => ph.id === p.phaseId) || { name: p.phaseName };
          if (fromPhase?.name !== toPhase?.name) {
            changes.push({ field: "Fase", from: fromPhase?.name || "Belum ada", to: toPhase?.name || p.phaseName });
          }
        }
        break;
      }

      case "ASSIGN_TASK": {
        entityType = "TASK";
        const existingTask = context.tasks.find((t) => t.id === p.taskId || t.title.toLowerCase() === (p.taskTitle || "").toLowerCase());
        entityName = existingTask?.title || p.taskTitle || "Task Terkait";
        const prevMem = context.members.find((m) => m.userId === existingTask?.assigneeId);
        const newMem = context.members.find((m) => m.userId === p.assigneeId) || { name: p.assigneeName };
        changes.push({ field: "Penugasan", from: prevMem?.name || "Unassigned", to: newMem?.name || p.assigneeName || "Squad Member" });
        break;
      }

      case "DELETE_TASK": {
        entityType = "TASK";
        const existingTask = context.tasks.find((t) => t.id === p.id || t.title.toLowerCase() === (p.name || "").toLowerCase());
        entityName = existingTask?.title || p.name || "Task Terkait";
        warning = `Task "${entityName}" akan dihapus permanen beserta seluruh komentar & riwayatnya.`;
        break;
      }

      case "CREATE_PROJECT": {
        entityType = "PROJECT";
        entityName = p.name || "Project Baru";
        changes.push({ field: "Nama Project", from: null, to: p.name });
        if (p.deadline) changes.push({ field: "Deadline Project", from: null, to: p.deadline });
        if (Array.isArray(p.phases)) changes.push({ field: "Jumlah Fase", from: null, to: `${p.phases.length} fase` });
        if (Array.isArray(p.initialTasks)) changes.push({ field: "Jumlah Task", from: null, to: `${p.initialTasks.length} task` });
        break;
      }

      case "UPDATE_PROJECT": {
        entityType = "PROJECT";
        const existingProj = context.projects.find((pr) => pr.id === p.id || pr.name.toLowerCase() === (p.name || "").toLowerCase());
        entityName = existingProj?.name || p.name || "Project Terkait";
        if (p.name && p.name !== existingProj?.name) changes.push({ field: "Nama Project", from: existingProj?.name, to: p.name });
        if (p.deadline) changes.push({ field: "Deadline", from: existingProj?.deadline || "None", to: p.deadline });
        if (p.status && p.status !== existingProj?.status) changes.push({ field: "Status", from: existingProj?.status, to: p.status });
        break;
      }

      case "DELETE_PROJECT": {
        entityType = "PROJECT";
        const existingProj = context.projects.find((pr) => pr.id === p.id || pr.name.toLowerCase() === (p.name || "").toLowerCase());
        entityName = existingProj?.name || p.name || "Project Terkait";
        warning = `⚠️ PERMANEN: Project "${entityName}" beserta seluruh fase dan task di dalamnya akan dihapus total.`;
        break;
      }

      case "CREATE_PHASE": {
        entityType = "PHASE";
        entityName = p.name || "Fase Baru";
        changes.push({ field: "Fase Baru", from: null, to: p.name });
        break;
      }

      case "UPDATE_PHASE": {
        entityType = "PHASE";
        const existingPhase = context.phases.find((ph) => ph.id === p.phaseId || ph.name.toLowerCase() === (p.name || "").toLowerCase());
        entityName = existingPhase?.name || p.name || "Fase Terkait";
        if (p.name && p.name !== existingPhase?.name) changes.push({ field: "Nama Fase", from: existingPhase?.name, to: p.name });
        break;
      }

      case "DELETE_PHASE": {
        entityType = "PHASE";
        const existingPhase = context.phases.find((ph) => ph.id === p.id || ph.name.toLowerCase() === (p.name || "").toLowerCase());
        entityName = existingPhase?.name || p.name || "Fase Terkait";
        warning = `Fase "${entityName}" akan dihapus. Task di dalamnya akan menjadi tidak terikat fase.`;
        break;
      }

      case "ADD_MEMBER":
      case "ADD_PROJECT_MEMBER": {
        entityType = "MEMBER";
        entityName = p.userName || p.memberName || "Anggota Tim";
        changes.push({ field: "Tambahkan Anggota", from: null, to: entityName });
        break;
      }

      case "REMOVE_MEMBER":
      case "REMOVE_PROJECT_MEMBER": {
        entityType = "MEMBER";
        entityName = p.userName || "Anggota Tim";
        warning = `Anggota "${entityName}" akan dilepaskan dari proyek ini.`;
        break;
      }

      default: {
        entityName = act.summary;
        break;
      }
    }

    previews.push({
      actionId: act.id,
      type: act.type,
      entityType,
      entityName,
      riskLevel: act.riskLevel,
      isDestructive: act.isDestructive || false,
      changes: changes.length > 0 ? changes : undefined,
      warning,
      summary: act.summary,
    });
  }

  return previews;
}

/**
 * Deterministic Validation Layer with Dependency Graph & 4-Tier Risk Classification
 */
export function validateAiPlan(plan: AiPlan, context: AiExecutionContext): ValidationResult {
  const globalErrors: string[] = [];
  const globalWarnings: string[] = [...(plan.warnings || [])];
  const globalClarifications: string[] = [...(plan.clarificationsNeeded || [])];

  let hasDestructive = false;
  let hasForbidden = false;
  let hasClarification = false;
  let highestRisk: ActionRiskLevel = "LOW";
  let requiresConfirmation = plan.requiresConfirmation;
  let clarificationState: ClarificationState | undefined = plan.clarificationState;

  // 0. Batch Size Limit (Max 50 actions)
  if (plan.actions.length > 50) {
    globalErrors.push("Jumlah aksi dalam satu operasi batch melebihi batas maksimum 50 aksi.");
  }

  // 1. Conflict & Duplicate Detection
  const { normalizedActions, conflicts } = normalizeActionConflicts(plan.actions);
  if (conflicts.length > 0) {
    globalErrors.push(...conflicts);
  }

  // 2. Dependency Graph & Topological Ordering
  const depResult = sortAndValidateDependencies(normalizedActions);
  if (!depResult.isValid) {
    globalErrors.push(...depResult.errors);
  }

  const actionsToValidate = depResult.sortedActions;

  // Track pending project in compound multi-action plan
  const sessionMap = new Map<string, string>();
  const createProjAct = actionsToValidate.find((a) => a.type === "CREATE_PROJECT");
  if (createProjAct?.payload?.name) {
    sessionMap.set("pending_project", createProjAct.payload.name.toLowerCase().trim());
  }

  const generatedActions: AiAction[] = [];

  for (let idx = 0; idx < actionsToValidate.length; idx++) {
    const action = actionsToValidate[idx];
    const actionErrors: string[] = [];
    const actionWarnings: string[] = [];
    let actionStatus: ActionExecutionStatus = "READY";

    // Assign 4-Tier Risk Classification
    let riskLevel: ActionRiskLevel = "MEDIUM";
    if (action.type === "DELETE_PROJECT") {
      riskLevel = "CRITICAL";
      hasDestructive = true;
      requiresConfirmation = true;
    } else if (
      action.type === "DELETE_TASK" ||
      action.type === "DELETE_PHASE" ||
      action.type === "REMOVE_MEMBER" ||
      action.type === "REMOVE_PROJECT_MEMBER"
    ) {
      riskLevel = "HIGH";
      hasDestructive = true;
      requiresConfirmation = true;
    } else if (action.type === "UPDATE_PROJECT" || action.type === "UPDATE_TASK") {
      riskLevel = "HIGH";
    } else {
      riskLevel = "MEDIUM";
    }

    const riskWeights: Record<ActionRiskLevel, number> = {
      LOW: 1,
      MEDIUM: 2,
      HIGH: 3,
      CRITICAL: 4,
    };

    if (riskWeights[riskLevel] > riskWeights[highestRisk]) {
      highestRisk = riskLevel;
    }

    // Permission Check
    const perm = validateActionPermission(action.type, context.userRole);
    if (!perm.allowed) {
      hasForbidden = true;
      actionStatus = "FORBIDDEN";
      actionErrors.push(perm.reason || "Izin akses ditolak.");
    }

    // Registry Validation
    const regSpec = ACTION_REGISTRY[action.type];
    if (regSpec) {
      action.riskLevel = riskLevel;
      action.requiredRole = regSpec.requiredRole;

      const regValidation = regSpec.validate(action.payload, context, sessionMap);
      if (!regValidation.isValid) {
        actionErrors.push(...regValidation.errors);
      }
      if (regValidation.warnings.length > 0) {
        actionWarnings.push(...regValidation.warnings);
      }
      if (regValidation.needsClarification) {
        hasClarification = true;
        actionStatus = "NEEDS_CLARIFICATION";
        globalClarifications.push(...regValidation.clarifications);
      }
    }

    // Entity & Candidate Normalization per Action Type
    switch (action.type) {
      case "CREATE_PROJECT": {
        const p = action.payload;
        if (p.deadline) {
          const rd = resolveNaturalDate(p.deadline);
          if (rd) p.deadline = rd.isoDate;
        }
        if (Array.isArray(p.initialTasks)) {
          p.initialTasks.forEach((t: any) => {
            if (t.assigneeName) {
              const res = resolveWorkspaceMember(t.assigneeName, context.members, context.pendingClarification);
              if (res.member) {
                t.assigneeId = res.member.userId;
                t.assigneeName = res.member.name;
              } else if (res.isAmbiguous) {
                hasClarification = true;
                actionStatus = "NEEDS_CLARIFICATION";
                const prompt = res.clarificationPrompt || `Ditemukan beberapa anggota cocok dengan "${t.assigneeName}": ${res.candidates.join(", ")}.`;
                globalClarifications.push(prompt);
                if (!clarificationState) {
                  clarificationState = {
                    id: `clar_${Date.now()}_${idx}`,
                    workspaceId: context.workspaceId,
                    userId: context.userId,
                    entityType: "MEMBER",
                    query: t.assigneeName,
                    originalActionType: action.type,
                    candidates: res.candidateDetails?.map((c) => ({ id: c.id, name: c.name, secondaryText: c.secondaryText })) || res.candidates.map((name) => ({ id: name, name })),
                    allowMultiSelect: false,
                    message: prompt,
                    createdAt: new Date().toISOString(),
                  };
                }
              } else if (res.notFound) {
                actionWarnings.push(`Anggota "${t.assigneeName}" tidak terdaftar di workspace squad.`);
              }
            }
          });
        }
        break;
      }

      case "ADD_MEMBER":
      case "ADD_PROJECT_MEMBER": {
        const p = action.payload;
        const rawName = p.userName || p.memberName;
        if (rawName) {
          const res = resolveWorkspaceMember(rawName, context.members, context.pendingClarification);

          if (res.members && res.members.length > 1) {
            p.userId = res.members[0].userId;
            p.userName = res.members[0].name;

            for (let mIdx = 1; mIdx < res.members.length; mIdx++) {
              const nextMem = res.members[mIdx];
              generatedActions.push({
                ...action,
                id: `${action.id}_multi_${mIdx}`,
                summary: `Tambahkan ${nextMem.name} ke tim proyek.`,
                payload: {
                  ...action.payload,
                  userId: nextMem.userId,
                  userName: nextMem.name,
                },
                status: "READY",
              });
            }
          } else if (res.member) {
            p.userId = res.member.userId;
            p.userName = res.member.name;
          } else if (res.isAmbiguous) {
            hasClarification = true;
            actionStatus = "NEEDS_CLARIFICATION";
            const prompt = res.clarificationPrompt || `Saya menemukan beberapa anggota yang cocok dengan "${rawName}": ${res.candidates.join(", ")}. Siapa yang Anda maksud?`;
            globalClarifications.push(prompt);

            if (!clarificationState) {
              clarificationState = {
                id: `clar_${Date.now()}_${idx}`,
                workspaceId: context.workspaceId,
                userId: context.userId,
                entityType: "MEMBER",
                query: rawName,
                originalActionType: action.type,
                candidates: res.candidateDetails?.map((c) => ({ id: c.id, name: c.name, secondaryText: c.secondaryText })) || res.candidates.map((name) => ({ id: name, name })),
                allowMultiSelect: true,
                message: prompt,
                createdAt: new Date().toISOString(),
              };
            }
          } else if (res.notFound) {
            hasClarification = true;
            actionStatus = "NEEDS_CLARIFICATION";
            const prompt = `Saya tidak menemukan anggota bernama "${rawName}" di workspace ini.`;
            globalClarifications.push(prompt);
          }
        }
        break;
      }

      case "CREATE_TASK": {
        const p = action.payload;
        if (p.assigneeName && !p.assigneeId) {
          const res = resolveWorkspaceMember(p.assigneeName, context.members, context.pendingClarification);
          if (res.member) {
            p.assigneeId = res.member.userId;
            p.assigneeName = res.member.name;
          } else if (res.isAmbiguous) {
            hasClarification = true;
            actionStatus = "NEEDS_CLARIFICATION";
            const prompt = res.clarificationPrompt || `Ditemukan beberapa anggota cocok dengan "${p.assigneeName}": ${res.candidates.join(", ")}.`;
            globalClarifications.push(prompt);
            if (!clarificationState) {
              clarificationState = {
                id: `clar_${Date.now()}_${idx}`,
                workspaceId: context.workspaceId,
                userId: context.userId,
                entityType: "MEMBER",
                query: p.assigneeName,
                originalActionType: action.type,
                candidates: res.candidateDetails?.map((c) => ({ id: c.id, name: c.name, secondaryText: c.secondaryText })) || res.candidates.map((name) => ({ id: name, name })),
                allowMultiSelect: false,
                message: prompt,
                createdAt: new Date().toISOString(),
              };
            }
          } else if (res.notFound) {
            actionWarnings.push(`Anggota "${p.assigneeName}" tidak terdaftar di workspace squad.`);
          }
        }
        if (p.dueDate) {
          const rd = resolveNaturalDate(p.dueDate);
          if (rd) p.dueDate = rd.isoDate;
        }
        break;
      }

      case "ASSIGN_TASK": {
        const p = action.payload;
        const resMem = resolveWorkspaceMember(p.assigneeName, context.members, context.pendingClarification);
        if (resMem.member) {
          p.assigneeId = resMem.member.userId;
          p.assigneeName = resMem.member.name;
        } else if (resMem.isAmbiguous) {
          hasClarification = true;
          actionStatus = "NEEDS_CLARIFICATION";
          const prompt = resMem.clarificationPrompt || `Ditemukan beberapa anggota cocok dengan "${p.assigneeName}": ${resMem.candidates.join(", ")}. Anggota mana yang ingin Anda assign?`;
          globalClarifications.push(prompt);
          if (!clarificationState) {
            clarificationState = {
              id: `clar_${Date.now()}_${idx}`,
              workspaceId: context.workspaceId,
              userId: context.userId,
              entityType: "MEMBER",
              query: p.assigneeName,
              originalActionType: action.type,
              candidates: resMem.candidateDetails?.map((c) => ({ id: c.id, name: c.name, secondaryText: c.secondaryText })) || resMem.candidates.map((name) => ({ id: name, name })),
              allowMultiSelect: false,
              message: prompt,
              createdAt: new Date().toISOString(),
            };
          }
        } else if (resMem.notFound) {
          hasClarification = true;
          actionStatus = "NEEDS_CLARIFICATION";
          globalClarifications.push(`Saya tidak menemukan anggota bernama "${p.assigneeName}" di workspace ini.`);
        }
        break;
      }

      case "UPDATE_PROJECT": {
        const p = action.payload;
        let matchedProj = (p.projectId || p.id) ? context.projects.find((proj) => proj.id === (p.projectId || p.id)) : undefined;

        if (!matchedProj) {
          const projQuery = p.projectName || p.name || p.projectId || p.id;
          if (projQuery) {
            const resProj = resolveWorkspaceProject(projQuery, context, context.pendingClarification);
            if (resProj.isAmbiguous) {
              hasClarification = true;
              actionStatus = "NEEDS_CLARIFICATION";
              const prompt = resProj.clarificationPrompt || `Terdapat beberapa project cocok (${resProj.candidates.join(", ")}). Project mana yang ingin diubah?`;
              globalClarifications.push(prompt);
              if (!clarificationState) {
                clarificationState = {
                  id: `clar_${Date.now()}_${idx}`,
                  workspaceId: context.workspaceId,
                  userId: context.userId,
                  entityType: "PROJECT",
                  query: projQuery,
                  originalActionType: action.type,
                  candidates: resProj.candidateDetails?.map((c) => ({ id: c.id, name: c.name, secondaryText: c.secondaryText })) || resProj.candidates.map((name) => ({ id: name, name })),
                  allowMultiSelect: false,
                  message: prompt,
                  createdAt: new Date().toISOString(),
                };
              }
            } else if (resProj.project) {
              matchedProj = resProj.project;
            } else if (resProj.notFound) {
              actionErrors.push(`Project "${projQuery}" tidak ditemukan.`);
            }
          }
        }

        if (matchedProj) {
          p.projectId = matchedProj.id;
          p.id = matchedProj.id;
          p.name = p.name || matchedProj.name;
          p.projectName = matchedProj.name;
        }
        if (p.deadline) {
          const rd = resolveNaturalDate(p.deadline);
          if (rd) p.deadline = rd.isoDate;
        }
        break;
      }

      case "UPDATE_TASK": {
        const p = action.payload;
        let matchedTask = (p.taskId || p.id) ? context.tasks.find((t) => t.id === (p.taskId || p.id)) : undefined;

        if (!matchedTask) {
          const taskQuery = p.taskTitle || p.title || (p.name !== "Task Terkait" ? p.name : undefined) || p.taskId || p.id;
          if (taskQuery) {
            const resTask = resolveWorkspaceTask(taskQuery, context, p.projectId || context.currentProjectId);
            if (resTask.isAmbiguous) {
              hasClarification = true;
              actionStatus = "NEEDS_CLARIFICATION";
              const prompt = resTask.clarificationPrompt || `Terdapat beberapa task bernama "${taskQuery}": ${resTask.candidates.join(", ")}. Task mana yang ingin diubah?`;
              globalClarifications.push(prompt);
              if (!clarificationState) {
                clarificationState = {
                  id: `clar_${Date.now()}_${idx}`,
                  workspaceId: context.workspaceId,
                  userId: context.userId,
                  entityType: "TASK",
                  query: taskQuery,
                  originalActionType: action.type,
                  candidates: resTask.candidateDetails?.map((c) => ({ id: c.id, name: c.name, secondaryText: c.secondaryText })) || resTask.candidates.map((name) => ({ id: name, name })),
                  allowMultiSelect: false,
                  message: prompt,
                  createdAt: new Date().toISOString(),
                };
              }
            } else if (resTask.task) {
              matchedTask = resTask.task;
            } else if (resTask.notFound) {
              actionErrors.push(`Task "${taskQuery}" tidak ditemukan.`);
            }
          }
        }

        if (matchedTask) {
          p.taskId = matchedTask.id;
          p.id = matchedTask.id;
          p.taskTitle = matchedTask.title;
          p.title = matchedTask.title;
          p.projectId = matchedTask.projectId;
        }

        if (p.assigneeName && !p.assigneeId) {
          const resMem = resolveWorkspaceMember(p.assigneeName, context.members, context.pendingClarification);
          if (resMem.member) {
            p.assigneeId = resMem.member.userId;
            p.assigneeName = resMem.member.name;
          } else if (resMem.isAmbiguous) {
            hasClarification = true;
            actionStatus = "NEEDS_CLARIFICATION";
            const prompt = resMem.clarificationPrompt || `Ditemukan beberapa anggota cocok dengan "${p.assigneeName}": ${resMem.candidates.join(", ")}.`;
            globalClarifications.push(prompt);
            if (!clarificationState) {
              clarificationState = {
                id: `clar_${Date.now()}_${idx}`,
                workspaceId: context.workspaceId,
                userId: context.userId,
                entityType: "MEMBER",
                query: p.assigneeName,
                originalActionType: action.type,
                candidates: resMem.candidateDetails?.map((c) => ({ id: c.id, name: c.name, secondaryText: c.secondaryText })) || resMem.candidates.map((name) => ({ id: name, name })),
                allowMultiSelect: false,
                message: prompt,
                createdAt: new Date().toISOString(),
              };
            }
          } else if (resMem.notFound) {
            actionWarnings.push(`Anggota "${p.assigneeName}" tidak terdaftar di workspace squad.`);
          }
        }
        if (p.phaseName && !p.phaseId) {
          const resPhase = resolveWorkspacePhase(p.phaseName, context, p.projectId || context.currentProjectId);
          if (resPhase.isAmbiguous) {
            hasClarification = true;
            actionStatus = "NEEDS_CLARIFICATION";
            const prompt = resPhase.clarificationPrompt || `Terdapat beberapa fase bernama "${p.phaseName}": ${resPhase.candidates.join(", ")}.`;
            globalClarifications.push(prompt);
          } else if (resPhase.selectedEntity) {
            p.phaseId = resPhase.selectedEntity.id;
            p.phaseName = resPhase.selectedEntity.name;
          }
        }
        if (p.dueDate) {
          const rd = resolveNaturalDate(p.dueDate);
          if (rd) p.dueDate = rd.isoDate;
        }
        break;
      }

      case "UPDATE_PHASE": {
        const p = action.payload;
        const resPhase = resolveWorkspacePhase(p.name || p.phaseId, context, p.projectId);
        if (resPhase.isAmbiguous) {
          hasClarification = true;
          actionStatus = "NEEDS_CLARIFICATION";
          globalClarifications.push(resPhase.clarificationPrompt || `Terdapat beberapa fase cocok.`);
        } else if (resPhase.selectedEntity) {
          p.phaseId = resPhase.selectedEntity.id;
          p.name = p.name || resPhase.selectedEntity.name;
        } else if (resPhase.notFound) {
          actionErrors.push(`Fase "${p.name || p.phaseId}" tidak ditemukan.`);
        }
        break;
      }

      case "DELETE_PHASE": {
        const p = action.payload;
        const resPhase = resolveWorkspacePhase(p.name || p.id, context, p.projectId);
        if (resPhase.isAmbiguous) {
          hasClarification = true;
          actionStatus = "NEEDS_CLARIFICATION";
          globalClarifications.push(resPhase.clarificationPrompt || `Terdapat beberapa fase cocok.`);
        } else if (resPhase.selectedEntity) {
          p.id = resPhase.selectedEntity.id;
          p.name = resPhase.selectedEntity.name;
        } else if (resPhase.notFound) {
          actionErrors.push(`Fase "${p.name || p.id}" tidak ditemukan.`);
        }
        break;
      }

      case "DELETE_PROJECT": {
        const p = action.payload;
        let matchedProj = (p.id || p.projectId) ? context.projects.find((proj) => proj.id === (p.id || p.projectId)) : undefined;

        if (!matchedProj) {
          const projQuery = p.projectName || p.name || p.id || p.projectId;
          if (projQuery) {
            const resProj = resolveWorkspaceProject(projQuery, context, context.pendingClarification);
            if (resProj.isAmbiguous) {
              hasClarification = true;
              actionStatus = "NEEDS_CLARIFICATION";
              const prompt = resProj.clarificationPrompt || `Terdapat beberapa project cocok (${resProj.candidates.join(", ")}). Project mana yang ingin dihapus?`;
              globalClarifications.push(prompt);
              if (!clarificationState) {
                clarificationState = {
                  id: `clar_${Date.now()}_${idx}`,
                  workspaceId: context.workspaceId,
                  userId: context.userId,
                  entityType: "PROJECT",
                  query: projQuery,
                  originalActionType: action.type,
                  candidates: resProj.candidateDetails?.map((c) => ({ id: c.id, name: c.name, secondaryText: c.secondaryText })) || resProj.candidates.map((name) => ({ id: name, name })),
                  allowMultiSelect: false,
                  message: prompt,
                  createdAt: new Date().toISOString(),
                };
              }
            } else if (resProj.project) {
              matchedProj = resProj.project;
            } else if (resProj.notFound) {
              actionErrors.push(`Project "${projQuery}" tidak ditemukan di workspace ini.`);
            }
          }
        }

        if (matchedProj) {
          p.id = matchedProj.id;
          p.projectId = matchedProj.id;
          p.name = matchedProj.name;
          p.projectName = matchedProj.name;
        }
        break;
      }

      case "DELETE_TASK": {
        const p = action.payload;
        let matchedTask = (p.id || p.taskId) ? context.tasks.find((t) => t.id === (p.id || p.taskId)) : undefined;

        if (!matchedTask) {
          const taskQuery = p.title || p.taskTitle || (p.name !== "Task Terkait" ? p.name : undefined) || p.id || p.taskId;
          if (taskQuery) {
            const resTask = resolveWorkspaceTask(taskQuery, context, p.projectId || context.currentProjectId);
            if (resTask.isAmbiguous) {
              hasClarification = true;
              actionStatus = "NEEDS_CLARIFICATION";
              const prompt = resTask.clarificationPrompt || `Terdapat beberapa task cocok dengan "${taskQuery}": ${resTask.candidates.join(", ")}. Task mana yang ingin dihapus?`;
              globalClarifications.push(prompt);
              if (!clarificationState) {
                clarificationState = {
                  id: `clar_${Date.now()}_${idx}`,
                  workspaceId: context.workspaceId,
                  userId: context.userId,
                  entityType: "TASK",
                  query: taskQuery,
                  originalActionType: action.type,
                  candidates: resTask.candidateDetails?.map((c) => ({ id: c.id, name: c.name, secondaryText: c.secondaryText })) || resTask.candidates.map((name) => ({ id: name, name })),
                  allowMultiSelect: false,
                  message: prompt,
                  createdAt: new Date().toISOString(),
                };
              }
            } else if (resTask.task) {
              matchedTask = resTask.task;
            } else if (resTask.notFound) {
              actionErrors.push(`Task "${taskQuery}" tidak ditemukan.`);
            }
          } else {
            actionErrors.push("Target task tidak ditentukan untuk dihapus.");
          }
        }

        if (matchedTask) {
          p.id = matchedTask.id;
          p.taskId = matchedTask.id;
          p.name = matchedTask.title;
          p.title = matchedTask.title;
          p.projectId = matchedTask.projectId;
        }
        break;
      }

      default:
        break;
    }

    if (actionErrors.length > 0) {
      globalErrors.push(...actionErrors);
      if (actionStatus === "READY") actionStatus = "INVALID";
    }
    if (actionWarnings.length > 0) {
      globalWarnings.push(...actionWarnings);
    }

    generatedActions.push({
      ...action,
      riskLevel,
      status: actionStatus,
      warnings: actionWarnings,
      errors: actionErrors,
      requiresConfirmation: requiresConfirmation || hasDestructive || riskLevel === "CRITICAL" || riskLevel === "HIGH",
    });
  }

  // Calculate Overall Plan Status
  let planStatus: ActionExecutionStatus = "READY";
  if (hasForbidden) planStatus = "FORBIDDEN";
  else if (hasClarification || globalClarifications.length > 0) planStatus = "NEEDS_CLARIFICATION";
  else if (globalErrors.length > 0) planStatus = "INVALID";
  else if (
    requiresConfirmation ||
    hasDestructive ||
    highestRisk === "CRITICAL" ||
    highestRisk === "HIGH" ||
    generatedActions.length > 1 ||
    generatedActions.some((a) => a.type === "CREATE_PROJECT")
  ) {
    planStatus = "NEEDS_CONFIRMATION";
    requiresConfirmation = true;
    if (generatedActions.length > 1 && highestRisk === "LOW") {
      highestRisk = "HIGH";
    }
  }

  let assistantMessage = plan.assistantMessage;
  if (planStatus === "NEEDS_CLARIFICATION" && globalClarifications.length > 0) {
    assistantMessage = globalClarifications[0];
  }

  const actionPreviews = generateActionPreviews(generatedActions, context);
  const targetSnapshots = extractTargetEntitySnapshots(generatedActions, context);
  const planFingerprint = generatedActions.length > 0
    ? createPlanFingerprint({
        userId: context.userId,
        workspaceId: context.workspaceId,
        planId: plan.id,
        actions: generatedActions,
        targetEntitySnapshots: targetSnapshots,
      })
    : undefined;

  const validatedPlan: AiPlan = {
    ...plan,
    assistantMessage,
    status: planStatus,
    actions: generatedActions,
    requiresConfirmation,
    isDestructive: hasDestructive,
    riskLevel: highestRisk,
    workflowPolicy: plan.workflowPolicy || "PARTIAL_SUCCESS_ALLOWED",
    warnings: globalWarnings,
    errors: globalErrors.length > 0 ? globalErrors : undefined,
    needsClarification: planStatus === "NEEDS_CLARIFICATION",
    clarificationsNeeded: globalClarifications.length > 0 ? globalClarifications : undefined,
    clarificationState,
    actionPreviews,
    planFingerprint,
    confirmationStatus: planStatus === "NEEDS_CONFIRMATION" ? "NEEDS_CONFIRMATION" : "PLAN_READY",
  };

  return {
    validatedPlan,
    isValid: globalErrors.length === 0 && !hasForbidden,
    errors: globalErrors,
  };
}
