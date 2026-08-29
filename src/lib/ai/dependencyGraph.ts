import { AiAction, AiActionType } from "./types";

export interface DependencyGraphNode {
  action: AiAction;
  dependsOn: string[];
}

export interface DependencyValidationResult {
  isValid: boolean;
  sortedActions: AiAction[];
  hasCycle: boolean;
  errors: string[];
}

/**
 * Automatically infers logical parent-child dependencies across actions in a plan.
 * E.g.:
 * - CREATE_PHASE / CREATE_TASK / ADD_MEMBER for a new project depend on CREATE_PROJECT
 * - CREATE_TASK for a new phase depends on CREATE_PHASE
 * - ASSIGN_TASK for a new task depends on CREATE_TASK
 */
export function inferActionDependencies(actions: AiAction[]): AiAction[] {
  const enriched: AiAction[] = [];
  let createProjectActionId: string | undefined = undefined;
  const phaseActionMap = new Map<string, string>(); // phaseName -> actionId
  const taskActionMap = new Map<string, string>(); // taskTitle -> actionId

  // First pass: identify creator action IDs
  for (const act of actions) {
    if (act.type === "CREATE_PROJECT") {
      createProjectActionId = act.id;
    } else if (act.type === "CREATE_PHASE" && act.payload?.name) {
      phaseActionMap.set(act.payload.name.toLowerCase().trim(), act.id);
    } else if (act.type === "CREATE_TASK" && act.payload?.title) {
      taskActionMap.set(act.payload.title.toLowerCase().trim(), act.id);
    }
  }

  // Second pass: assign explicit dependsOn and temporaryRefs
  for (const act of actions) {
    const dependsOn: string[] = [...(act.dependsOn || [])];
    const temporaryRefs: Record<string, string> = { ...(act.temporaryRefs || {}) };

    if (createProjectActionId && act.id !== createProjectActionId) {
      if (
        act.type === "CREATE_PHASE" ||
        act.type === "CREATE_TASK" ||
        act.type === "ADD_MEMBER" ||
        act.type === "ADD_PROJECT_MEMBER"
      ) {
        if (!dependsOn.includes(createProjectActionId)) {
          dependsOn.push(createProjectActionId);
        }
        temporaryRefs["projectId"] = createProjectActionId;
      }
    }

    if (act.type === "CREATE_TASK" && act.payload?.phaseName) {
      const phaseActId = phaseActionMap.get(act.payload.phaseName.toLowerCase().trim());
      if (phaseActId && !dependsOn.includes(phaseActId)) {
        dependsOn.push(phaseActId);
        temporaryRefs["phaseId"] = phaseActId;
      }
    }

    if (act.type === "ASSIGN_TASK" && act.payload?.taskTitle) {
      const taskActId = taskActionMap.get(act.payload.taskTitle.toLowerCase().trim());
      if (taskActId && !dependsOn.includes(taskActId)) {
        dependsOn.push(taskActId);
        temporaryRefs["taskId"] = taskActId;
      }
    }

    enriched.push({
      ...act,
      dependsOn: dependsOn.length > 0 ? dependsOn : undefined,
      temporaryRefs: Object.keys(temporaryRefs).length > 0 ? temporaryRefs : undefined,
    });
  }

  return enriched;
}

/**
 * Topologically sorts actions using Kahn's algorithm.
 * Guarantees that parents (e.g. CREATE_PROJECT) are executed strictly before children (CREATE_PHASE, CREATE_TASK).
 * Detects and prevents circular dependencies.
 */
export function sortAndValidateDependencies(actions: AiAction[]): DependencyValidationResult {
  const enrichedActions = inferActionDependencies(actions);
  const actionMap = new Map<string, AiAction>();
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>(); // parentId -> [childId1, childId2]
  const errors: string[] = [];

  // Initialize
  for (const act of enrichedActions) {
    actionMap.set(act.id, act);
    inDegree.set(act.id, 0);
    adjacency.set(act.id, []);
  }

  // Build edges
  for (const act of enrichedActions) {
    if (act.dependsOn && act.dependsOn.length > 0) {
      for (const depId of act.dependsOn) {
        if (!actionMap.has(depId)) {
          errors.push(`Action "${act.summary}" depends on missing action ID: ${depId}`);
          continue;
        }
        adjacency.get(depId)!.push(act.id);
        inDegree.set(act.id, (inDegree.get(act.id) || 0) + 1);
      }
    }
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      sortedActions: enrichedActions,
      hasCycle: false,
      errors,
    };
  }

  // Queue of nodes with 0 in-degree
  // To keep deterministic priority among ties, sort by natural action order
  const actionPriority: Record<AiActionType, number> = {
    CREATE_PROJECT: 1,
    CREATE_PHASE: 2,
    CREATE_TASK: 3,
    ASSIGN_TASK: 4,
    ADD_MEMBER: 5,
    ADD_PROJECT_MEMBER: 5,
    UPDATE_PROJECT: 6,
    UPDATE_PHASE: 7,
    UPDATE_TASK: 8,
    REMOVE_MEMBER: 9,
    REMOVE_PROJECT_MEMBER: 9,
    DELETE_TASK: 10,
    DELETE_PHASE: 11,
    DELETE_PROJECT: 12,
  };

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  queue.sort((a, b) => {
    const actA = actionMap.get(a)!;
    const actB = actionMap.get(b)!;
    return (actionPriority[actA.type] || 50) - (actionPriority[actB.type] || 50);
  });

  const sorted: AiAction[] = [];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentAct = actionMap.get(currentId)!;
    sorted.push(currentAct);

    const children = adjacency.get(currentId) || [];
    for (const childId of children) {
      const newDeg = inDegree.get(childId)! - 1;
      inDegree.set(childId, newDeg);
      if (newDeg === 0) {
        queue.push(childId);
        queue.sort((a, b) => {
          const actA = actionMap.get(a)!;
          const actB = actionMap.get(b)!;
          return (actionPriority[actA.type] || 50) - (actionPriority[actB.type] || 50);
        });
      }
    }
  }

  if (sorted.length !== enrichedActions.length) {
    return {
      isValid: false,
      sortedActions: enrichedActions,
      hasCycle: true,
      errors: ["Circular dependency detected across action graph."],
    };
  }

  return {
    isValid: true,
    sortedActions: sorted,
    hasCycle: false,
    errors: [],
  };
}

/**
 * Resolves temporary entity references in an action's payload using newly created database entity IDs.
 */
export function resolvePayloadTemporaryRefs(
  payload: any,
  temporaryRefs: Record<string, string> | undefined,
  createdEntityMap: Map<string, { projectId?: string; taskId?: string; phaseId?: string }>
): any {
  if (!payload || !temporaryRefs) return payload;

  const resolved = { ...payload };

  for (const [propKey, refActionId] of Object.entries(temporaryRefs)) {
    const entityInfo = createdEntityMap.get(refActionId);
    if (entityInfo) {
      if (propKey === "projectId" && entityInfo.projectId) {
        resolved.projectId = entityInfo.projectId;
      } else if (propKey === "taskId" && entityInfo.taskId) {
        resolved.taskId = entityInfo.taskId;
      } else if (propKey === "phaseId" && entityInfo.phaseId) {
        resolved.phaseId = entityInfo.phaseId;
      }
    }
  }

  return resolved;
}
