import { AIProjectPlan, ExplicitProjectConstraints, AiAction } from "./types";

export interface StrictValidationResult {
  isValid: boolean;
  repairedPlan?: AIProjectPlan;
  errors: string[];
  warnings: string[];
}

/**
 * Validates and repairs AI Project Plans against explicit user constraints.
 * Guarantees Strict Mode invariants are 100% deterministic.
 */
export function validateStrictProjectPlan(
  plan: AIProjectPlan,
  constraints: ExplicitProjectConstraints
): StrictValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const isStrictMode = plan.mode === "STRICT";

  // Invariant 1 & 2: Exact phase count and names
  if (constraints.exactPhaseCount !== undefined || (constraints.exactPhaseNames && constraints.exactPhaseNames.length > 0)) {
    const expectedCount = constraints.exactPhaseCount || constraints.exactPhaseNames?.length || 0;
    const actualCount = plan.phases.length;

    if (isStrictMode && expectedCount > 0 && actualCount !== expectedCount) {
      if (actualCount > expectedCount) {
        // Strict Mode Invariant 7: AI cannot add unauthorized phases in STRICT mode
        if (constraints.exactPhaseNames && constraints.exactPhaseNames.length > 0) {
          // Filter to only user-specified phases
          plan.phases = plan.phases.filter((p) =>
            constraints.exactPhaseNames!.some(
              (epn) => epn.toLowerCase().trim() === p.name.toLowerCase().trim()
            )
          );
          warnings.push(`[Strict Mode] Dihapus ${actualCount - plan.phases.length} fase tambahan yang tidak diminta oleh pengguna.`);
        } else {
          plan.phases = plan.phases.slice(0, expectedCount);
          warnings.push(`[Strict Mode] Dibatasi menjadi persis ${expectedCount} fase sesuai instruksi.`);
        }
      } else if (actualCount < expectedCount) {
        errors.push(`[Strict Mode Violation] Pengguna meminta ${expectedCount} fase, namun AI hanya menghasilkan ${actualCount} fase.`);
      }
    }

    // Check exact phase names
    if (constraints.exactPhaseNames && constraints.exactPhaseNames.length > 0) {
      for (const reqPhaseName of constraints.exactPhaseNames) {
        const found = plan.phases.find(
          (p) => p.name.toLowerCase().trim() === reqPhaseName.toLowerCase().trim()
        );
        if (!found) {
          // Strict Mode Invariant 8: AI cannot omit explicit phase requirement
          if (isStrictMode) {
            plan.phases.push({
              name: reqPhaseName,
              order: plan.phases.length + 1,
              tasks: [],
            });
            warnings.push(`[Strict Mode] Menambahkan kembali fase "${reqPhaseName}" yang diminta pengguna.`);
          } else {
            warnings.push(`Fase "${reqPhaseName}" yang diminta pengguna tidak ditemukan dalam rencana AI.`);
          }
        }
      }
    }
  }

  // Invariant 3 & 4: Exact task count and task titles
  if (constraints.exactTaskCount !== undefined || (constraints.exactTaskTitles && constraints.exactTaskTitles.length > 0)) {
    const allPlanTasks = plan.phases.flatMap((p) => p.tasks);
    const expectedTaskCount = constraints.exactTaskCount || constraints.exactTaskTitles?.length || 0;
    const actualTaskCount = allPlanTasks.length;

    if (isStrictMode && expectedTaskCount > 0 && actualTaskCount !== expectedTaskCount) {
      if (actualTaskCount > expectedTaskCount && constraints.exactTaskTitles && constraints.exactTaskTitles.length > 0) {
        // Filter out unauthorized tasks in strict mode
        for (const phase of plan.phases) {
          phase.tasks = phase.tasks.filter((t) =>
            constraints.exactTaskTitles!.some(
              (ett) => ett.toLowerCase().trim() === t.title.toLowerCase().trim() ||
                       t.title.toLowerCase().trim().includes(ett.toLowerCase().trim())
            )
          );
        }
        warnings.push(`[Strict Mode] Menghapus tugas tambahan yang tidak diminta secara eksplisit.`);
      } else if (actualTaskCount < expectedTaskCount) {
        errors.push(`[Strict Mode Violation] Pengguna meminta ${expectedTaskCount} tugas, namun hanya ada ${actualTaskCount} tugas.`);
      }
    }
  }

  // Invariant 5: Explicit deadline preservation
  if (constraints.exactDeadline) {
    if (plan.project.deadline !== constraints.exactDeadline) {
      plan.project.deadline = constraints.exactDeadline;
      warnings.push(`[Strict Mode] Menyelaraskan deadline project menjadi ${constraints.exactDeadline}.`);
    }
  }

  // Invariant 6: Explicit team members preservation
  if (constraints.exactMembers && constraints.exactMembers.length > 0) {
    if (!plan.teamMembers) {
      plan.teamMembers = [];
    }
    for (const reqMember of constraints.exactMembers) {
      const exists = plan.teamMembers.some(
        (m) => m.userName.toLowerCase().trim() === reqMember.toLowerCase().trim()
      );
      if (!exists) {
        plan.teamMembers.push({
          userName: reqMember,
          role: "MEMBER",
        });
      }
    }
  }

  return {
    isValid: errors.length === 0,
    repairedPlan: plan,
    errors,
    warnings,
  };
}

/**
 * Converts a validated AIProjectPlan into a list of Phase 2 AiActions.
 */
export function convertProjectPlanToActions(plan: AIProjectPlan): AiAction[] {
  const actions: AiAction[] = [];
  const projActionId = `act_proj_${Date.now()}`;

  // 1. Root CREATE_PROJECT action
  const initialTasks = plan.phases.flatMap((ph) =>
    ph.tasks.map((t) => ({
      title: t.title,
      description: t.description,
      priority: t.priority || "MEDIUM",
      status: t.status || "TODO",
      phaseName: ph.name,
      assigneeName: t.assigneeName,
      dueDate: t.dueDate || plan.project.deadline,
    }))
  );

  actions.push({
    id: projActionId,
    type: "CREATE_PROJECT",
    summary: `Buat project "${plan.project.name}" dengan ${plan.phases.length} tahapan dan ${initialTasks.length} tugas.`,
    riskLevel: "MEDIUM",
    requiredRole: "MEMBER",
    status: "READY",
    requiresConfirmation: false,
    payload: {
      name: plan.project.name,
      description: plan.project.description,
      deadline: plan.project.deadline,
      color: plan.project.color || "#0284C7",
      status: plan.project.status || "ACTIVE",
      phases: plan.phases.map((ph, idx) => ({
        name: ph.name,
        order: ph.order || idx + 1,
      })),
      initialTasks,
      memberNames: plan.teamMembers?.map((m) => m.userName) || [],
    },
  });

  // 2. Member additions if team specified
  if (plan.teamMembers && plan.teamMembers.length > 0) {
    plan.teamMembers.forEach((m, idx) => {
      actions.push({
        id: `act_mem_${Date.now()}_${idx + 1}`,
        type: "ADD_MEMBER",
        summary: `Tambahkan ${m.userName} ke tim proyek "${plan.project.name}".`,
        riskLevel: "MEDIUM",
        requiredRole: "MEMBER",
        status: "READY",
        dependsOn: [projActionId],
        payload: {
          projectName: plan.project.name,
          userName: m.userName,
          userId: m.userId,
          role: m.role || "MEMBER",
        },
      });
    });
  }

  return actions;
}
