import {
  AiExecutionContext,
  ContextConfidenceLevel,
  ContextResolutionResult,
  ContextResolutionSource,
  RecentEntities,
  EntityType,
} from "./types";
import {
  resolveWorkspaceProject,
  resolveWorkspaceTask,
  resolveWorkspacePhase,
  resolveWorkspaceMember,
} from "./entityResolver";

// ============================================================================
// 1. CONTEXT SANITIZATION & STALE CONTEXT VALIDATION
// ============================================================================

/**
 * Validates that all IDs in the execution context belong strictly to the active workspace.
 * Invalidates stale IDs that no longer exist or belong to a different workspace.
 */
export function validateAndSanitizeContext(context: AiExecutionContext): AiExecutionContext {
  const sanitized: AiExecutionContext = { ...context };

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
// 2. CONVERSATIONAL ENTITY EXTRACTION
// ============================================================================

/**
 * Scans conversation history to identify recently referenced projects, tasks, phases, and members.
 */
export function extractRecentEntitiesFromHistory(
  history: AiExecutionContext["conversationHistory"] | undefined,
  context: AiExecutionContext
): RecentEntities {
  if (!history || history.length === 0) {
    return context.recentEntities || {};
  }

  const recent: RecentEntities = {
    projects: [...(context.recentEntities?.projects || [])],
    phases: [...(context.recentEntities?.phases || [])],
    tasks: [...(context.recentEntities?.tasks || [])],
    members: [...(context.recentEntities?.members || [])],
  };

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
 * 1. Explicit user input / name
 * 2. Active UI context (currentProjectId)
 * 3. Recent conversation context
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
    // Contextual phrases
    const cleanLower = clean.toLowerCase();
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

  // 3. Conversation Context (Recent Entities)
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
 * 1. Explicit user input / name
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
 * 1. Explicit user input / title
 * 2. Active UI context (currentTaskId)
 * 3. Recent conversation context
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

    // Contextual references: "task ini", "tugas ini", "current task", "ini"
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

  // 3. Conversation Context (Recent Entities)
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
 * 1. Explicit user input / name
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

    // Contextual references: "saya", "me", "myself"
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
