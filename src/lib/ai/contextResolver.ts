import {
  AiExecutionContext,
  ContextConfidenceLevel,
  ContextResolutionResult,
  ContextResolutionSource,
  RecentEntities,
  EntityType,
  AiConversationState,
} from "./types";
import {
  resolveWorkspaceProject,
  resolveWorkspaceTask,
  resolveWorkspacePhase,
  resolveWorkspaceMember,
} from "./entityResolver";
import {
  isConversationContextFresh,
  sanitizeConversationState,
} from "./conversationStore";

// ============================================================================
// 1. CONTEXT SANITIZATION & STALE CONTEXT VALIDATION
// ============================================================================

/**
 * Validates that all IDs in the execution context belong strictly to the active workspace.
 * Invalidates stale IDs that no longer exist or belong to a different workspace.
 */
export function validateAndSanitizeContext(context: AiExecutionContext): AiExecutionContext {
  const sanitized: AiExecutionContext = { ...context };

  // Sanitize conversationState if present
  if (sanitized.conversationState) {
    sanitized.conversationState = sanitizeConversationState(sanitized.conversationState, sanitized);
  }

  // Validate currentProjectId
  if (sanitized.currentProjectId) {
    const validProject = sanitized.projects.find((p) => p.id === sanitized.currentProjectId);
    if (!validProject) {
      sanitized.currentProjectId = undefined;
      sanitized.currentProjectName = undefined;
    } else if (!sanitized.currentProjectName) {
      sanitized.currentProjectName = validProject.name;
    }
  }

  // Validate currentPhaseId
  if (sanitized.currentPhaseId) {
    const validPhase = sanitized.phases.find(
      (ph) => ph.id === sanitized.currentPhaseId && (!sanitized.currentProjectId || ph.projectId === sanitized.currentProjectId)
    );
    if (!validPhase) {
      sanitized.currentPhaseId = undefined;
      sanitized.currentPhaseName = undefined;
    } else if (!sanitized.currentPhaseName) {
      sanitized.currentPhaseName = validPhase.name;
    }
  }

  // Validate currentTaskId
  if (sanitized.currentTaskId) {
    const validTask = sanitized.tasks.find(
      (t) => t.id === sanitized.currentTaskId && (!sanitized.currentProjectId || t.projectId === sanitized.currentProjectId)
    );
    if (!validTask) {
      sanitized.currentTaskId = undefined;
      sanitized.currentTaskTitle = undefined;
    } else if (!sanitized.currentTaskTitle) {
      sanitized.currentTaskTitle = validTask.title;
    }
  }

  // Validate currentMemberId
  if (sanitized.currentMemberId) {
    const validMember = sanitized.members.find(
      (m) => m.userId === sanitized.currentMemberId || m.id === sanitized.currentMemberId
    );
    if (!validMember) {
      sanitized.currentMemberId = undefined;
      sanitized.currentMemberName = undefined;
    } else if (!sanitized.currentMemberName) {
      sanitized.currentMemberName = validMember.name;
    }
  }

  // Sanitize recentEntities: only retain IDs that exist in workspace
  if (sanitized.recentEntities) {
    const validProjIds = new Set(sanitized.projects.map((p) => p.id));
    const validPhaseIds = new Set(sanitized.phases.map((ph) => ph.id));
    const validTaskIds = new Set(sanitized.tasks.map((t) => t.id));
    const validMemberIds = new Set(sanitized.members.map((m) => m.userId));

    sanitized.recentEntities = {
      projects: sanitized.recentEntities.projects?.filter((id) => validProjIds.has(id)),
      phases: sanitized.recentEntities.phases?.filter((id) => validPhaseIds.has(id)),
      tasks: sanitized.recentEntities.tasks?.filter((id) => validTaskIds.has(id)),
      members: sanitized.recentEntities.members?.filter((id) => validMemberIds.has(id)),
    };
  }

  return sanitized;
}

// ============================================================================
// 2. CONVERSATIONAL ENTITY & REFERENCE HELPERS
// ============================================================================

/**
 * Checks if a string is a pronoun or conversational reference to a recently discussed entity.
 */
export function isPronounOrRelativeReference(text: string): boolean {
  const t = text.toLowerCase().trim();
  return (
    t === "itu" ||
    t === "ini" ||
    t === "tersebut" ||
    t === "tadi" ||
    t === "barusan" ||
    t === "yang tadi" ||
    t === "yang barusan" ||
    t === "yang baru saja" ||
    t === "yang baru dibuat" ||
    t === "yang barusan dibuat" ||
    t === "yang baru diubah" ||
    t === "yang barusan diubah" ||
    t === "task itu" ||
    t === "task tadi" ||
    t === "task tersebut" ||
    t === "tugas itu" ||
    t === "tugas tadi" ||
    t === "tugas tersebut" ||
    t === "project itu" ||
    t === "project tadi" ||
    t === "project tersebut" ||
    t === "projek itu" ||
    t === "projek tadi" ||
    t === "fase itu" ||
    t === "fase tadi" ||
    t === "fase tersebut" ||
    t === "phase itu" ||
    t === "phase tadi" ||
    t === "phase tersebut" ||
    t === "anggota itu" ||
    t === "member itu" ||
    t === "dia"
  );
}

/**
 * Extracts 0-based positional index from natural language (e.g. "task pertama" -> 0, "terakhir" -> "LAST")
 */
export function extractPositionalIndex(text: string): number | "LAST" | null {
  const t = text.toLowerCase().trim();
  if (t.includes("pertama") || t.includes("kesatu") || t.includes("ke-1") || t.includes("1st") || t.includes("first")) return 0;
  if (t.includes("kedua") || t.includes("ke-2") || t.includes("2nd") || t.includes("second")) return 1;
  if (t.includes("ketiga") || t.includes("ke-3") || t.includes("3rd") || t.includes("third")) return 2;
  if (t.includes("keempat") || t.includes("ke-4") || t.includes("4th")) return 3;
  if (t.includes("kelima") || t.includes("ke-5") || t.includes("5th")) return 4;
  if (
    t.includes("terakhir") ||
    t.includes("paling akhir") ||
    t.includes("sebelumnya") ||
    t.includes("yang terakhir") ||
    t.includes("yang sebelumnya") ||
    t.includes("last") ||
    t.includes("previous")
  ) {
    return "LAST";
  }
  return null;
}

/**
 * Scans conversation state and history to identify recently referenced projects, tasks, phases, and members.
 */
export function extractRecentEntitiesFromHistory(
  history: AiExecutionContext["conversationHistory"] | undefined,
  context: AiExecutionContext
): RecentEntities {
  const recent: RecentEntities = {
    projects: [...(context.recentEntities?.projects || [])],
    phases: [...(context.recentEntities?.phases || [])],
    tasks: [...(context.recentEntities?.tasks || [])],
    members: [...(context.recentEntities?.members || [])],
  };

  // Merge from context.conversationState if available
  if (context.conversationState) {
    const cs = context.conversationState;
    if (cs.activeEntity) {
      if (cs.activeEntity.type === "PROJECT" && !recent.projects!.includes(cs.activeEntity.id)) {
        recent.projects!.unshift(cs.activeEntity.id);
      } else if (cs.activeEntity.type === "TASK" && !recent.tasks!.includes(cs.activeEntity.id)) {
        recent.tasks!.unshift(cs.activeEntity.id);
      } else if (cs.activeEntity.type === "PHASE" && !recent.phases!.includes(cs.activeEntity.id)) {
        recent.phases!.unshift(cs.activeEntity.id);
      } else if (cs.activeEntity.type === "MEMBER" && !recent.members!.includes(cs.activeEntity.id)) {
        recent.members!.unshift(cs.activeEntity.id);
      }
    }

    // Merge recentEntities lists
    for (const p of cs.recentEntities?.projects || []) {
      if (!recent.projects!.includes(p.id)) recent.projects!.push(p.id);
    }
    for (const t of cs.recentEntities?.tasks || []) {
      if (!recent.tasks!.includes(t.id)) recent.tasks!.push(t.id);
    }
    for (const ph of cs.recentEntities?.phases || []) {
      if (!recent.phases!.includes(ph.id)) recent.phases!.push(ph.id);
    }
    for (const m of cs.recentEntities?.members || []) {
      if (!recent.members!.includes(m.id)) recent.members!.push(m.id);
    }
  }

  if (!history || history.length === 0) {
    return recent;
  }

  // Inspect recent turns from newest to oldest
  const recentTurns = [...history].reverse().slice(0, 8);

  for (const turn of recentTurns) {
    const content = turn.content.toLowerCase();

    // Check project names
    for (const p of context.projects) {
      if (content.includes(p.name.toLowerCase()) && !recent.projects!.includes(p.id)) {
        recent.projects!.unshift(p.id);
      }
    }

    // Check task titles
    for (const t of context.tasks) {
      if (content.includes(t.title.toLowerCase()) && !recent.tasks!.includes(t.id)) {
        recent.tasks!.unshift(t.id);
      }
    }

    // Check phase names
    for (const ph of context.phases) {
      if (content.includes(ph.name.toLowerCase()) && !recent.phases!.includes(ph.id)) {
        recent.phases!.unshift(ph.id);
      }
    }

    // Check member names
    for (const m of context.members) {
      if (content.includes(m.name.toLowerCase()) && !recent.members!.includes(m.userId)) {
        recent.members!.unshift(m.userId);
      }
    }
  }

  return recent;
}

// ============================================================================
// 3. DETERMINISTIC CONTEXTUAL PROJECT RESOLUTION
// ============================================================================

/**
 * Resolves project using strict precedence:
 * 1. Explicit user input / name / pronoun / positional
 * 2. Active UI context (currentProjectId)
 * 3. Recent conversation state / context
 * 4. Safe default (if workspace has exactly 1 project)
 * 5. Clarification / Missing
 */
export function resolveContextualProject(
  explicitInput: string | undefined,
  rawContext: AiExecutionContext
): ContextResolutionResult<AiExecutionContext["projects"][0]> {
  const context = validateAndSanitizeContext(rawContext);

  // 1. Explicit User Input
  if (explicitInput && explicitInput.trim()) {
    const clean = explicitInput.trim();
    const cleanLower = clean.toLowerCase();

    // 1.1 Contextual UI phrases ("project ini", "projek ini")
    if (
      cleanLower === "project ini" ||
      cleanLower === "projek ini" ||
      cleanLower === "proyek ini" ||
      cleanLower === "di sini" ||
      cleanLower === "current project"
    ) {
      if (context.currentProjectId) {
        const active = context.projects.find((p) => p.id === context.currentProjectId);
        if (active) {
          return {
            entity: active,
            entityType: "PROJECT",
            entityId: active.id,
            entityName: active.name,
            source: "UI_CONTEXT",
            confidence: "CONTEXT_EXACT",
            confidenceScore: 1.0,
            status: "EXACT_MATCH",
            isAmbiguous: false,
            candidates: [active.name],
          };
        }
      }
    }

    // 1.2 Positional or Pronoun reference from Conversation State
    const pos = extractPositionalIndex(clean);
    if (pos !== null) {
      const cs = context.conversationState;
      if (cs) {
        const recentProjs = cs.recentEntities?.projects || [];
        if (recentProjs.length > 0) {
          const targetRef = pos === "LAST" ? recentProjs[recentProjs.length - 1] : recentProjs[pos];
          if (targetRef) {
            const p = context.projects.find((pr) => pr.id === targetRef.id);
            if (p) {
              return {
                entity: p,
                entityType: "PROJECT",
                entityId: p.id,
                entityName: p.name,
                source: "CONVERSATION",
                confidence: "RECENT_EXACT",
                confidenceScore: 0.9,
                status: "EXACT_MATCH",
                isAmbiguous: false,
                candidates: [p.name],
              };
            }
          }
        }
      }
    } else if (isPronounOrRelativeReference(clean)) {
      const cs = context.conversationState;
      if (cs) {
        // Direct active project in conversation
        if (cs.activeEntity?.type === "PROJECT") {
          const activeProj = context.projects.find((p) => p.id === cs.activeEntity!.id);
          if (activeProj) {
            return {
              entity: activeProj,
              entityType: "PROJECT",
              entityId: activeProj.id,
              entityName: activeProj.name,
              source: "CONVERSATION",
              confidence: "RECENT_EXACT",
              confidenceScore: 0.92,
              status: "EXACT_MATCH",
              isAmbiguous: false,
              candidates: [activeProj.name],
            };
          }
        }

        const recentProjs = cs.recentEntities?.projects || [];
        if (recentProjs.length === 1) {
          const p = context.projects.find((pr) => pr.id === recentProjs[0].id);
          if (p) {
            return {
              entity: p,
              entityType: "PROJECT",
              entityId: p.id,
              entityName: p.name,
              source: "CONVERSATION",
              confidence: "RECENT_EXACT",
              confidenceScore: 0.9,
              status: "EXACT_MATCH",
              isAmbiguous: false,
              candidates: [p.name],
            };
          }
        } else if (recentProjs.length > 1) {
          const cNames = recentProjs.map((l) => l.name);
          return {
            entityType: "PROJECT",
            source: "CONVERSATION",
            confidence: "AMBIGUOUS",
            confidenceScore: 0.5,
            status: "AMBIGUOUS",
            isAmbiguous: true,
            candidates: cNames,
            clarificationPrompt: `Project mana yang dimaksud?\n\n${cNames.map((n, i) => `${i + 1}. ${n}`).join("\n")}`,
          };
        }
      }
    }

    const res = resolveWorkspaceProject(clean, context, context.pendingClarification);
    if (res.isAmbiguous) {
      return {
        entityType: "PROJECT",
        source: "EXPLICIT",
        confidence: "AMBIGUOUS",
        confidenceScore: 0.5,
        status: "AMBIGUOUS",
        isAmbiguous: true,
        candidates: res.candidates,
        candidateDetails: res.candidateDetails,
        clarificationPrompt: res.clarificationPrompt,
      };
    }
    if (res.project) {
      return {
        entity: res.project,
        entityType: "PROJECT",
        entityId: res.project.id,
        entityName: res.project.name,
        source: "EXPLICIT",
        confidence: "EXACT",
        confidenceScore: res.confidence,
        status: res.status || "EXACT_MATCH",
        isAmbiguous: false,
        candidates: [res.project.name],
      };
    }
  }

  // 2. Active UI Context
  if (context.currentProjectId) {
    const active = context.projects.find((p) => p.id === context.currentProjectId);
    if (active) {
      return {
        entity: active,
        entityType: "PROJECT",
        entityId: active.id,
        entityName: active.name,
        source: "UI_CONTEXT",
        confidence: "CONTEXT_EXACT",
        confidenceScore: 0.95,
        status: "EXACT_MATCH",
        isAmbiguous: false,
        candidates: [active.name],
      };
    }
  }

  // 3. Conversation Context (Conversation State & Recent Entities)
  if (context.conversationState?.activeEntity?.type === "PROJECT") {
    const activeProj = context.projects.find((p) => p.id === context.conversationState!.activeEntity!.id);
    if (activeProj) {
      return {
        entity: activeProj,
        entityType: "PROJECT",
        entityId: activeProj.id,
        entityName: activeProj.name,
        source: "CONVERSATION",
        confidence: "RECENT_EXACT",
        confidenceScore: 0.9,
        status: "EXACT_MATCH",
        isAmbiguous: false,
        candidates: [activeProj.name],
      };
    }
  }

  const recent = extractRecentEntitiesFromHistory(context.conversationHistory, context);
  if (recent.projects && recent.projects.length === 1) {
    const recentProj = context.projects.find((p) => p.id === recent.projects![0]);
    if (recentProj) {
      return {
        entity: recentProj,
        entityType: "PROJECT",
        entityId: recentProj.id,
        entityName: recentProj.name,
        source: "CONVERSATION",
        confidence: "RECENT_EXACT",
        confidenceScore: 0.9,
        status: "EXACT_MATCH",
        isAmbiguous: false,
        candidates: [recentProj.name],
      };
    }
  }

  // 4. Safe Default: Workspace has exactly 1 project
  if (context.projects.length === 1) {
    return {
      entity: context.projects[0],
      entityType: "PROJECT",
      entityId: context.projects[0].id,
      entityName: context.projects[0].name,
      source: "DEFAULT",
      confidence: "DEFAULT",
      confidenceScore: 0.8,
      status: "SINGLE_HIGH_CONFIDENCE",
      isAmbiguous: false,
      candidates: [context.projects[0].name],
    };
  }

  // 5. Missing / Ambiguous
  if (context.projects.length > 1) {
    const candidateNames = context.projects.map((p) => p.name);
    return {
      entityType: "PROJECT",
      source: "DEFAULT",
      confidence: "MISSING",
      confidenceScore: 0.0,
      status: "NO_MATCH",
      isAmbiguous: false,
      candidates: candidateNames,
      clarificationPrompt: `Project mana yang dimaksud?\n\n${candidateNames.map((n, i) => `${i + 1}. ${n}`).join("\n")}`,
    };
  }

  return {
    entityType: "PROJECT",
    source: "DEFAULT",
    confidence: "MISSING",
    confidenceScore: 0.0,
    status: "NO_MATCH",
    isAmbiguous: false,
    candidates: [],
    clarificationPrompt: "Belum ada project yang terdaftar di workspace ini.",
  };
}

// ============================================================================
// 4. DETERMINISTIC CONTEXTUAL PHASE RESOLUTION
// ============================================================================

/**
 * Resolves phase using strict precedence:
 * 1. Explicit user input / name / pronoun / positional
 * 2. Active UI context (currentPhaseId)
 * 3. Recent conversation context
 * 4. Safe default (first phase of target project)
 * 5. Clarification / Missing
 */
export function resolveContextualPhase(
  explicitInput: string | undefined,
  rawContext: AiExecutionContext,
  projectId?: string
): ContextResolutionResult<AiExecutionContext["phases"][0]> {
  const context = validateAndSanitizeContext(rawContext);
  const targetProjId = projectId || context.currentProjectId;
  const phasePool = targetProjId ? context.phases.filter((ph) => ph.projectId === targetProjId) : context.phases;

  // 1. Explicit User Input
  if (explicitInput && explicitInput.trim()) {
    const clean = explicitInput.trim();

    // 1.1 Pronoun or Positional reference from Conversation State
    if (isPronounOrRelativeReference(clean) || extractPositionalIndex(clean) !== null) {
      const cs = context.conversationState;
      if (cs) {
        if (cs.activeEntity?.type === "PHASE") {
          const actPh = phasePool.find((ph) => ph.id === cs.activeEntity!.id);
          if (actPh) {
            return {
              entity: actPh,
              entityType: "PHASE",
              entityId: actPh.id,
              entityName: actPh.name,
              source: "CONVERSATION",
              confidence: "RECENT_EXACT",
              confidenceScore: 0.92,
              status: "EXACT_MATCH",
              isAmbiguous: false,
              candidates: [actPh.name],
            };
          }
        }

        const pos = extractPositionalIndex(clean);
        const recentPhs = cs.recentEntities?.phases || [];
        if (recentPhs.length > 0) {
          const targetRef = pos === "LAST" ? recentPhs[recentPhs.length - 1] : pos !== null ? recentPhs[pos] : recentPhs.length === 1 ? recentPhs[0] : null;
          if (targetRef) {
            const ph = phasePool.find((p) => p.id === targetRef.id);
            if (ph) {
              return {
                entity: ph,
                entityType: "PHASE",
                entityId: ph.id,
                entityName: ph.name,
                source: "CONVERSATION",
                confidence: "RECENT_EXACT",
                confidenceScore: 0.9,
                status: "EXACT_MATCH",
                isAmbiguous: false,
                candidates: [ph.name],
              };
            }
          }
        }
      }
    }

    const res = resolveWorkspacePhase(clean, context, targetProjId);
    if (res.isAmbiguous) {
      return {
        entityType: "PHASE",
        source: "EXPLICIT",
        confidence: "AMBIGUOUS",
        confidenceScore: 0.5,
        status: "AMBIGUOUS",
        isAmbiguous: true,
        candidates: res.candidateNames,
        clarificationPrompt: res.clarificationPrompt,
      };
    }
    if (res.selectedEntity) {
      return {
        entity: res.selectedEntity,
        entityType: "PHASE",
        entityId: res.selectedEntity.id,
        entityName: res.selectedEntity.name,
        source: "EXPLICIT",
        confidence: "EXACT",
        confidenceScore: res.confidence,
        status: res.status,
        isAmbiguous: false,
        candidates: [res.selectedEntity.name],
      };
    }
  }

  // 2. Active UI Context
  if (context.currentPhaseId) {
    const active = phasePool.find((ph) => ph.id === context.currentPhaseId);
    if (active) {
      return {
        entity: active,
        entityType: "PHASE",
        entityId: active.id,
        entityName: active.name,
        source: "UI_CONTEXT",
        confidence: "CONTEXT_EXACT",
        confidenceScore: 0.95,
        status: "EXACT_MATCH",
        isAmbiguous: false,
        candidates: [active.name],
      };
    }
  }

  // 3. Conversation Context
  if (context.conversationState?.activeEntity?.type === "PHASE") {
    const actPh = phasePool.find((ph) => ph.id === context.conversationState!.activeEntity!.id);
    if (actPh) {
      return {
        entity: actPh,
        entityType: "PHASE",
        entityId: actPh.id,
        entityName: actPh.name,
        source: "CONVERSATION",
        confidence: "RECENT_EXACT",
        confidenceScore: 0.9,
        status: "EXACT_MATCH",
        isAmbiguous: false,
        candidates: [actPh.name],
      };
    }
  }

  const recent = extractRecentEntitiesFromHistory(context.conversationHistory, context);
  if (recent.phases && recent.phases.length === 1) {
    const recentPhase = phasePool.find((ph) => ph.id === recent.phases![0]);
    if (recentPhase) {
      return {
        entity: recentPhase,
        entityType: "PHASE",
        entityId: recentPhase.id,
        entityName: recentPhase.name,
        source: "CONVERSATION",
        confidence: "RECENT_EXACT",
        confidenceScore: 0.9,
        status: "EXACT_MATCH",
        isAmbiguous: false,
        candidates: [recentPhase.name],
      };
    }
  }

  // 4. Safe Default: First phase of project
  if (phasePool.length > 0) {
    const firstPhase = [...phasePool].sort((a, b) => a.order - b.order)[0];
    return {
      entity: firstPhase,
      entityType: "PHASE",
      entityId: firstPhase.id,
      entityName: firstPhase.name,
      source: "DEFAULT",
      confidence: "DEFAULT",
      confidenceScore: 0.75,
      status: "SINGLE_HIGH_CONFIDENCE",
      isAmbiguous: false,
      candidates: [firstPhase.name],
    };
  }

  return {
    entityType: "PHASE",
    source: "DEFAULT",
    confidence: "MISSING",
    confidenceScore: 0.0,
    status: "NO_MATCH",
    isAmbiguous: false,
    candidates: [],
    clarificationPrompt: "Tidak ditemukan fase dalam project ini.",
  };
}

// ============================================================================
// 5. DETERMINISTIC CONTEXTUAL TASK RESOLUTION
// ============================================================================

/**
 * Resolves task using strict precedence:
 * 1. Explicit user input / title / pronoun / positional
 * 2. Active UI context (currentTaskId)
 * 3. Recent conversation state / context
 * 4. Clarification when ambiguous or missing
 */
export function resolveContextualTask(
  explicitInput: string | undefined,
  rawContext: AiExecutionContext,
  projectId?: string
): ContextResolutionResult<AiExecutionContext["tasks"][0]> {
  const context = validateAndSanitizeContext(rawContext);
  const targetProjId = projectId || context.currentProjectId;

  // 1. Explicit User Input
  if (explicitInput && explicitInput.trim()) {
    const clean = explicitInput.trim();
    const cleanLower = clean.toLowerCase();

    // 1.1 Contextual references: "task ini", "tugas ini", "current task", "ini"
    if (cleanLower === "task ini" || cleanLower === "tugas ini" || cleanLower === "current task" || cleanLower === "ini") {
      if (context.currentTaskId) {
        const active = context.tasks.find((t) => t.id === context.currentTaskId);
        if (active) {
          return {
            entity: active,
            entityType: "TASK",
            entityId: active.id,
            entityName: active.title,
            source: "UI_CONTEXT",
            confidence: "CONTEXT_EXACT",
            confidenceScore: 1.0,
            status: "EXACT_MATCH",
            isAmbiguous: false,
            candidates: [active.title],
          };
        }
      }

      if (context.conversationState?.activeEntity?.type === "TASK") {
        const activeTask = context.tasks.find((t) => t.id === context.conversationState!.activeEntity!.id);
        if (activeTask && (!targetProjId || activeTask.projectId === targetProjId)) {
          return {
            entity: activeTask,
            entityType: "TASK",
            entityId: activeTask.id,
            entityName: activeTask.title,
            source: "CONVERSATION",
            confidence: "RECENT_EXACT",
            confidenceScore: 0.95,
            status: "EXACT_MATCH",
            isAmbiguous: false,
            candidates: [activeTask.title],
          };
        }
      }

      const recent = extractRecentEntitiesFromHistory(context.conversationHistory, context);
      if (recent.tasks && recent.tasks.length === 1) {
        const recentTask = context.tasks.find((t) => t.id === recent.tasks![0]);
        if (recentTask) {
          return {
            entity: recentTask,
            entityType: "TASK",
            entityId: recentTask.id,
            entityName: recentTask.title,
            source: "CONVERSATION",
            confidence: "RECENT_EXACT",
            confidenceScore: 0.9,
            status: "EXACT_MATCH",
            isAmbiguous: false,
            candidates: [recentTask.title],
          };
        }
      }
    }

    // 1.2 Positional or Pronoun reference from Conversation State ("task itu", "yang tadi", "task pertama")
    const pos = extractPositionalIndex(clean);
    if (pos !== null) {
      const cs = context.conversationState;
      if (cs) {
        const recentTasks = (cs.recentEntities?.tasks || []).filter((t) => !targetProjId || t.projectId === targetProjId);
        if (recentTasks.length > 0) {
          const targetRef = pos === "LAST" ? recentTasks[recentTasks.length - 1] : recentTasks[pos];
          if (targetRef) {
            const t = context.tasks.find((tk) => tk.id === targetRef.id);
            if (t) {
              return {
                entity: t,
                entityType: "TASK",
                entityId: t.id,
                entityName: t.title,
                source: "CONVERSATION",
                confidence: "RECENT_EXACT",
                confidenceScore: 0.9,
                status: "EXACT_MATCH",
                isAmbiguous: false,
                candidates: [t.title],
              };
            }
          }
        }
      }
    } else if (isPronounOrRelativeReference(clean)) {
      const cs = context.conversationState;
      if (cs) {
        if (cs.activeEntity?.type === "TASK") {
          const actTask = context.tasks.find((t) => t.id === cs.activeEntity!.id);
          if (actTask && (!targetProjId || actTask.projectId === targetProjId)) {
            return {
              entity: actTask,
              entityType: "TASK",
              entityId: actTask.id,
              entityName: actTask.title,
              source: "CONVERSATION",
              confidence: "RECENT_EXACT",
              confidenceScore: 0.92,
              status: "EXACT_MATCH",
              isAmbiguous: false,
              candidates: [actTask.title],
            };
          }
        }

        const recentTasks = (cs.recentEntities?.tasks || []).filter((t) => !targetProjId || t.projectId === targetProjId);
        if (recentTasks.length === 1) {
          const t = context.tasks.find((tk) => tk.id === recentTasks[0].id);
          if (t) {
            return {
              entity: t,
              entityType: "TASK",
              entityId: t.id,
              entityName: t.title,
              source: "CONVERSATION",
              confidence: "RECENT_EXACT",
              confidenceScore: 0.9,
              status: "EXACT_MATCH",
              isAmbiguous: false,
              candidates: [t.title],
            };
          }
        } else if (recentTasks.length > 1) {
          const cNames = recentTasks.map((l) => l.name);
          return {
            entityType: "TASK",
            source: "CONVERSATION",
            confidence: "AMBIGUOUS",
            confidenceScore: 0.5,
            status: "AMBIGUOUS",
            isAmbiguous: true,
            candidates: cNames,
            clarificationPrompt: `Task mana yang dimaksud?\n\n${cNames.map((n, i) => `${i + 1}. ${n}`).join("\n")}`,
          };
        }
      }
    }

    const res = resolveWorkspaceTask(clean, context, targetProjId);
    if (res.isAmbiguous) {
      return {
        entityType: "TASK",
        source: "EXPLICIT",
        confidence: "AMBIGUOUS",
        confidenceScore: 0.5,
        status: "AMBIGUOUS",
        isAmbiguous: true,
        candidates: res.candidates,
        candidateDetails: res.candidateDetails,
        clarificationPrompt: res.clarificationPrompt,
      };
    }
    if (res.task) {
      return {
        entity: res.task,
        entityType: "TASK",
        entityId: res.task.id,
        entityName: res.task.title,
        source: "EXPLICIT",
        confidence: "EXACT",
        confidenceScore: res.confidence,
        status: res.status || "EXACT_MATCH",
        isAmbiguous: false,
        candidates: [res.task.title],
      };
    }
  }

  // 2. Active UI Context
  if (context.currentTaskId) {
    const active = context.tasks.find((t) => t.id === context.currentTaskId);
    if (active) {
      return {
        entity: active,
        entityType: "TASK",
        entityId: active.id,
        entityName: active.title,
        source: "UI_CONTEXT",
        confidence: "CONTEXT_EXACT",
        confidenceScore: 0.95,
        status: "EXACT_MATCH",
        isAmbiguous: false,
        candidates: [active.title],
      };
    }
  }

  // 3. Conversation State (Active Entity or single recent task)
  if (context.conversationState?.activeEntity?.type === "TASK") {
    const activeTask = context.tasks.find((t) => t.id === context.conversationState!.activeEntity!.id);
    if (activeTask && (!targetProjId || activeTask.projectId === targetProjId)) {
      return {
        entity: activeTask,
        entityType: "TASK",
        entityId: activeTask.id,
        entityName: activeTask.title,
        source: "CONVERSATION",
        confidence: "RECENT_EXACT",
        confidenceScore: 0.9,
        status: "EXACT_MATCH",
        isAmbiguous: false,
        candidates: [activeTask.title],
      };
    }
  }

  const recent = extractRecentEntitiesFromHistory(context.conversationHistory, context);
  if (recent.tasks && recent.tasks.length === 1) {
    const recentTask = context.tasks.find((t) => t.id === recent.tasks![0]);
    if (recentTask) {
      return {
        entity: recentTask,
        entityType: "TASK",
        entityId: recentTask.id,
        entityName: recentTask.title,
        source: "CONVERSATION",
        confidence: "RECENT_EXACT",
        confidenceScore: 0.9,
        status: "EXACT_MATCH",
        isAmbiguous: false,
        candidates: [recentTask.title],
      };
    }
  }

  // 4. Missing
  return {
    entityType: "TASK",
    source: "DEFAULT",
    confidence: "MISSING",
    confidenceScore: 0.0,
    status: "NO_MATCH",
    isAmbiguous: false,
    candidates: [],
    clarificationPrompt: "Task mana yang ingin Anda perbarui?",
  };
}

// ============================================================================
// 6. DETERMINISTIC CONTEXTUAL MEMBER RESOLUTION
// ============================================================================

/**
 * Resolves member using strict precedence:
 * 1. Explicit user input / name / "saya" / pronoun
 * 2. Active UI context (currentMemberId)
 * 3. Recent conversation context
 * 4. Clarification when ambiguous or missing
 */
export function resolveContextualMember(
  explicitInput: string | undefined,
  rawContext: AiExecutionContext
): ContextResolutionResult<AiExecutionContext["members"][0]> {
  const context = validateAndSanitizeContext(rawContext);

  // 1. Explicit User Input
  if (explicitInput && explicitInput.trim()) {
    const clean = explicitInput.trim();
    const cleanLower = clean.toLowerCase();

    // 1.1 Contextual references: "saya", "me", "myself"
    if (cleanLower === "saya" || cleanLower === "me" || cleanLower === "myself" || cleanLower === "diri saya") {
      const currentMember = context.members.find((m) => m.userId === context.userId);
      if (currentMember) {
        return {
          entity: currentMember,
          entityType: "MEMBER",
          entityId: currentMember.userId,
          entityName: currentMember.name,
          source: "UI_CONTEXT",
          confidence: "CONTEXT_EXACT",
          confidenceScore: 1.0,
          status: "EXACT_MATCH",
          isAmbiguous: false,
          candidates: [currentMember.name],
        };
      }
    }

    // 1.2 Pronoun reference to conversation member
    if (cleanLower === "dia" || cleanLower === "member itu" || cleanLower === "anggota itu") {
      if (context.conversationState?.activeEntity?.type === "MEMBER") {
        const actMem = context.members.find((m) => m.userId === context.conversationState!.activeEntity!.id);
        if (actMem) {
          return {
            entity: actMem,
            entityType: "MEMBER",
            entityId: actMem.userId,
            entityName: actMem.name,
            source: "CONVERSATION",
            confidence: "RECENT_EXACT",
            confidenceScore: 0.9,
            status: "EXACT_MATCH",
            isAmbiguous: false,
            candidates: [actMem.name],
          };
        }
      }
    }

    const res = resolveWorkspaceMember(clean, context.members, context.pendingClarification);
    if (res.isAmbiguous) {
      return {
        entityType: "MEMBER",
        source: "EXPLICIT",
        confidence: "AMBIGUOUS",
        confidenceScore: 0.5,
        status: "AMBIGUOUS",
        isAmbiguous: true,
        candidates: res.candidates,
        candidateDetails: res.candidateDetails,
        clarificationPrompt: res.clarificationPrompt,
      };
    }
    if (res.member) {
      return {
        entity: res.member,
        entityType: "MEMBER",
        entityId: res.member.userId,
        entityName: res.member.name,
        source: "EXPLICIT",
        confidence: "EXACT",
        confidenceScore: res.confidence,
        status: res.status || "EXACT_MATCH",
        isAmbiguous: false,
        candidates: [res.member.name],
      };
    }
  }

  // 2. Active UI Context
  if (context.currentMemberId) {
    const active = context.members.find((m) => m.userId === context.currentMemberId || m.id === context.currentMemberId);
    if (active) {
      return {
        entity: active,
        entityType: "MEMBER",
        entityId: active.userId,
        entityName: active.name,
        source: "UI_CONTEXT",
        confidence: "CONTEXT_EXACT",
        confidenceScore: 0.95,
        status: "EXACT_MATCH",
        isAmbiguous: false,
        candidates: [active.name],
      };
    }
  }

  // 3. Conversation Context
  if (context.conversationState?.activeEntity?.type === "MEMBER") {
    const activeMem = context.members.find((m) => m.userId === context.conversationState!.activeEntity!.id);
    if (activeMem) {
      return {
        entity: activeMem,
        entityType: "MEMBER",
        entityId: activeMem.userId,
        entityName: activeMem.name,
        source: "CONVERSATION",
        confidence: "RECENT_EXACT",
        confidenceScore: 0.9,
        status: "EXACT_MATCH",
        isAmbiguous: false,
        candidates: [activeMem.name],
      };
    }
  }

  const recent = extractRecentEntitiesFromHistory(context.conversationHistory, context);
  if (recent.members && recent.members.length === 1) {
    const recentMember = context.members.find((m) => m.userId === recent.members![0]);
    if (recentMember) {
      return {
        entity: recentMember,
        entityType: "MEMBER",
        entityId: recentMember.userId,
        entityName: recentMember.name,
        source: "CONVERSATION",
        confidence: "RECENT_EXACT",
        confidenceScore: 0.9,
        status: "EXACT_MATCH",
        isAmbiguous: false,
        candidates: [recentMember.name],
      };
    }
  }

  return {
    entityType: "MEMBER",
    source: "DEFAULT",
    confidence: "MISSING",
    confidenceScore: 0.0,
    status: "NO_MATCH",
    isAmbiguous: false,
    candidates: [],
    clarificationPrompt: "Anggota tim mana yang ingin Anda pilih?",
  };
}
