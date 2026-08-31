import {
  AiConversationEntityRef,
  AiConversationIntentType,
  AiConversationState,
  AiConversationTurn,
  AiExecutionContext,
  AiPlan,
  EntityType,
} from "./types";

/**
 * Phase 8: AI Conversation Memory & Multi-Turn Context Manager
 *
 * Invariants:
 * 1. Multi-Tenant Scoped: Keyed strictly by `${workspaceId}:${userId}:${conversationId}`.
 * 2. Bounded Structure: Max 20 turns, max 10 recent entities per type.
 * 3. Freshness Policy: 15-minute TTL. Stale state reduces confidence or triggers clarification.
 * 4. Data Only: History is untrusted plain text data and NEVER executed as instructions.
 * 5. Not an Auth Boundary: Authorization is always server-side revalidated.
 */

export const MAX_CONVERSATION_TURNS = 20;
export const MAX_RECENT_ENTITIES_PER_TYPE = 10;
export const CONVERSATION_CONTEXT_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const MAX_STORED_CONVERSATIONS = 300;

const conversationStore = new Map<string, AiConversationState>();

/**
 * Prunes expired or excess conversation entries to prevent unbounded memory growth.
 */
export function pruneConversationStore(): void {
  const now = Date.now();
  for (const [key, state] of conversationStore.entries()) {
    const updatedTime = new Date(state.updatedAt).getTime();
    if (now - updatedTime > CONVERSATION_CONTEXT_TTL_MS) {
      conversationStore.delete(key);
    }
  }

  if (conversationStore.size > MAX_STORED_CONVERSATIONS) {
    const sorted = Array.from(conversationStore.entries()).sort((a, b) => {
      return new Date(a[1].updatedAt).getTime() - new Date(b[1].updatedAt).getTime();
    });
    const excess = conversationStore.size - MAX_STORED_CONVERSATIONS;
    for (let i = 0; i < excess; i++) {
      conversationStore.delete(sorted[i][0]);
    }
  }
}

/**
 * Builds the canonical isolation key for a conversation
 */
export function buildConversationKey(workspaceId: string, userId: string, conversationId: string): string {
  return `${workspaceId}:${userId}:${conversationId}`;
}

/**
 * Checks whether a conversation state is still fresh within the 15-minute TTL.
 */
export function isConversationContextFresh(state: AiConversationState): boolean {
  const updatedTime = new Date(state.updatedAt).getTime();
  return Date.now() - updatedTime <= CONVERSATION_CONTEXT_TTL_MS;
}

/**
 * Creates an empty, initialized conversation state.
 */
export function createInitialConversationState(
  workspaceId: string,
  userId: string,
  conversationId: string
): AiConversationState {
  const now = new Date().toISOString();
  return {
    conversationId,
    workspaceId,
    userId,
    turnIndex: 0,
    recentEntities: {
      projects: [],
      tasks: [],
      phases: [],
      members: [],
    },
    history: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Retrieves conversation state if exists and matches user and workspace isolation boundaries.
 */
export function getConversationState(
  workspaceId: string,
  userId: string,
  conversationId: string
): AiConversationState | null {
  const key = buildConversationKey(workspaceId, userId, conversationId);
  const state = conversationStore.get(key);
  if (!state) return null;

  // Strict tenant and user authorization boundary check
  if (state.workspaceId !== workspaceId || state.userId !== userId) {
    return null;
  }

  return state;
}

/**
 * Retrieves or creates a fresh conversation state.
 */
export function getOrCreateConversationState(
  workspaceId: string,
  userId: string,
  conversationId?: string
): AiConversationState {
  pruneConversationStore();
  const effectiveConvId = conversationId && conversationId.trim() ? conversationId.trim() : `conv_${userId}_default`;
  const existing = getConversationState(workspaceId, userId, effectiveConvId);
  if (existing) return existing;

  const fresh = createInitialConversationState(workspaceId, userId, effectiveConvId);
  const key = buildConversationKey(workspaceId, userId, effectiveConvId);
  conversationStore.set(key, fresh);
  return fresh;
}

/**
 * Updates a conversation state with partial updates and enforces bounded collections.
 */
export function updateConversationState(
  workspaceId: string,
  userId: string,
  conversationId: string,
  update: Partial<AiConversationState>
): AiConversationState {
  const state = getOrCreateConversationState(workspaceId, userId, conversationId);
  const now = new Date().toISOString();

  if (update.activeEntity !== undefined) state.activeEntity = update.activeEntity;
  if (update.lastIntent !== undefined) state.lastIntent = update.lastIntent;
  if (update.lastIntentType !== undefined) state.lastIntentType = update.lastIntentType;
  if (update.lastActionIds !== undefined) state.lastActionIds = update.lastActionIds;
  if (update.lastCreatedEntity !== undefined) state.lastCreatedEntity = update.lastCreatedEntity;
  if (update.lastModifiedEntity !== undefined) state.lastModifiedEntity = update.lastModifiedEntity;
  if (update.pendingConfirmation !== undefined) state.pendingConfirmation = update.pendingConfirmation;

  if (update.recentEntities) {
    state.recentEntities = {
      projects: (update.recentEntities.projects || state.recentEntities.projects).slice(0, MAX_RECENT_ENTITIES_PER_TYPE),
      tasks: (update.recentEntities.tasks || state.recentEntities.tasks).slice(0, MAX_RECENT_ENTITIES_PER_TYPE),
      phases: (update.recentEntities.phases || state.recentEntities.phases).slice(0, MAX_RECENT_ENTITIES_PER_TYPE),
      members: (update.recentEntities.members || state.recentEntities.members).slice(0, MAX_RECENT_ENTITIES_PER_TYPE),
    };
  }

  state.updatedAt = now;
  const key = buildConversationKey(workspaceId, userId, state.conversationId);
  conversationStore.set(key, state);
  return state;
}

/**
 * Adds an entity reference to the recent entities list, moving it to the front.
 * Supports both (state, entity) and (workspaceId, userId, conversationId, entity) signatures.
 */
export function pushRecentEntity(
  stateOrWsId: AiConversationState | string,
  entityOrUserId: AiConversationEntityRef | string,
  convId?: string,
  entityRef?: AiConversationEntityRef
): void {
  let targetState: AiConversationState;
  let targetEntity: AiConversationEntityRef;

  if (typeof stateOrWsId === "object") {
    targetState = stateOrWsId;
    targetEntity = entityOrUserId as AiConversationEntityRef;
  } else {
    targetState = getOrCreateConversationState(stateOrWsId, entityOrUserId as string, convId!);
    targetEntity = entityRef!;
  }

  if (!targetEntity) return;

  const listKey =
    targetEntity.type === "PROJECT"
      ? "projects"
      : targetEntity.type === "TASK"
      ? "tasks"
      : targetEntity.type === "PHASE"
      ? "phases"
      : "members";

  const currentList = targetState.recentEntities[listKey] || [];
  const filtered = currentList.filter((e) => e.id !== targetEntity.id);
  filtered.unshift(targetEntity);
  targetState.recentEntities[listKey] = filtered.slice(0, MAX_RECENT_ENTITIES_PER_TYPE);
}

/**
 * Records a full conversation turn into the memory store.
 */
export function recordConversationTurn(
  workspaceId: string,
  userId: string,
  conversationId: string,
  data: {
    userPrompt: string;
    assistantMessage?: string;
    plan?: AiPlan;
    intentType?: AiConversationIntentType;
  }
): AiConversationState {
  const state = getOrCreateConversationState(workspaceId, userId, conversationId);
  const now = new Date().toISOString();
  state.turnIndex += 1;

  const entityReferences: Array<{ type: EntityType; id: string; name: string }> = [];

  // Extract referenced entities from generated plan actions
  if (data.plan && data.plan.actions.length > 0) {
    for (const act of data.plan.actions) {
      const p = act.payload || {};

      if (act.type === "CREATE_PROJECT" && p.name) {
        const ref: AiConversationEntityRef = {
          type: "PROJECT",
          id: p.id || `temp_proj_${Date.now()}`,
          name: p.name,
          lastReferencedAt: now,
        };
        state.activeEntity = ref;
        state.lastCreatedEntity = ref;
        pushRecentEntity(state, ref);
        entityReferences.push({ type: "PROJECT", id: ref.id, name: ref.name });
      } else if (act.type === "CREATE_TASK" && p.title) {
        const ref: AiConversationEntityRef = {
          type: "TASK",
          id: p.id || `temp_tsk_${Date.now()}`,
          name: p.title,
          projectId: p.projectId,
          phaseId: p.phaseId,
          lastReferencedAt: now,
        };
        state.activeEntity = ref;
        state.lastCreatedEntity = ref;
        pushRecentEntity(state, ref);
        entityReferences.push({ type: "TASK", id: ref.id, name: ref.name });
      } else if (
        (act.type === "UPDATE_TASK" || act.type === "ASSIGN_TASK" || act.type === "DELETE_TASK") &&
        (p.taskId || p.id)
      ) {
        const taskId = p.taskId || p.id;
        const ref: AiConversationEntityRef = {
          type: "TASK",
          id: taskId,
          name: p.title || p.taskTitle || taskId,
          projectId: p.projectId,
          phaseId: p.phaseId,
          lastReferencedAt: now,
        };
        state.activeEntity = ref;
        state.lastModifiedEntity = ref;
        pushRecentEntity(state, ref);
        entityReferences.push({ type: "TASK", id: ref.id, name: ref.name });
      } else if ((act.type === "UPDATE_PROJECT" || act.type === "DELETE_PROJECT") && (p.projectId || p.id)) {
        const projId = p.projectId || p.id;
        const ref: AiConversationEntityRef = {
          type: "PROJECT",
          id: projId,
          name: p.name || p.projectName || projId,
          lastReferencedAt: now,
        };
        state.activeEntity = ref;
        state.lastModifiedEntity = ref;
        pushRecentEntity(state, ref);
        entityReferences.push({ type: "PROJECT", id: ref.id, name: ref.name });
      } else if (act.type === "CREATE_PHASE" && p.name) {
        const ref: AiConversationEntityRef = {
          type: "PHASE",
          id: p.id || `temp_ph_${Date.now()}`,
          name: p.name,
          projectId: p.projectId,
          lastReferencedAt: now,
        };
        state.activeEntity = ref;
        state.lastCreatedEntity = ref;
        pushRecentEntity(state, ref);
        entityReferences.push({ type: "PHASE", id: ref.id, name: ref.name });
      }
    }
  }

  // Record user turn
  const userTurn: AiConversationTurn = {
    role: "user",
    content: data.userPrompt,
    timestamp: now,
    turnIndex: state.turnIndex,
    intentType: data.intentType || "NEW_INTENT",
    entityReferences: entityReferences.length > 0 ? entityReferences : undefined,
    planId: data.plan?.id,
  };
  state.history.push(userTurn);

  // Record assistant turn if message provided
  if (data.assistantMessage) {
    const assistantTurn: AiConversationTurn = {
      role: "assistant",
      content: data.assistantMessage,
      timestamp: new Date().toISOString(),
      turnIndex: state.turnIndex,
      planId: data.plan?.id,
    };
    state.history.push(assistantTurn);
  }

  // Trim history to MAX_CONVERSATION_TURNS
  if (state.history.length > MAX_CONVERSATION_TURNS) {
    state.history = state.history.slice(-MAX_CONVERSATION_TURNS);
  }

  state.lastIntent = data.userPrompt;
  state.lastIntentType = data.intentType || "NEW_INTENT";
  state.lastActionIds = data.plan?.actions.map((a) => a.id);
  state.updatedAt = now;

  const key = buildConversationKey(workspaceId, userId, state.conversationId);
  conversationStore.set(key, state);
  return state;
}

/**
 * Sanitizes a conversation state against the live workspace context,
 * removing references to entities that no longer exist or belong to other workspaces.
 */
export function sanitizeConversationState(
  state: AiConversationState,
  context: AiExecutionContext
): AiConversationState {
  const validProjIds = new Set(context.projects.map((p) => p.id));
  const validTaskIds = new Set(context.tasks.map((t) => t.id));
  const validPhaseIds = new Set(context.phases.map((ph) => ph.id));
  const validMemberIds = new Set(context.members.map((m) => m.userId));

  // Sanitize activeEntity
  let activeEntity = state.activeEntity;
  if (activeEntity) {
    if (
      (activeEntity.type === "PROJECT" && !validProjIds.has(activeEntity.id)) ||
      (activeEntity.type === "TASK" && !validTaskIds.has(activeEntity.id)) ||
      (activeEntity.type === "PHASE" && !validPhaseIds.has(activeEntity.id)) ||
      (activeEntity.type === "MEMBER" && !validMemberIds.has(activeEntity.id))
    ) {
      activeEntity = undefined;
    }
  }

  // Sanitize recentEntities
  const recentEntities = {
    projects: (state.recentEntities?.projects || []).filter((e) => validProjIds.has(e.id)),
    tasks: (state.recentEntities?.tasks || []).filter((e) => validTaskIds.has(e.id)),
    phases: (state.recentEntities?.phases || []).filter((e) => validPhaseIds.has(e.id)),
    members: (state.recentEntities?.members || []).filter((e) => validMemberIds.has(e.id)),
  };

  return {
    ...state,
    activeEntity,
    recentEntities,
  };
}

/**
 * Clears conversation state for a specific user and conversation.
 */
export function clearConversationState(
  workspaceId: string,
  userId: string,
  conversationId: string
): boolean {
  const key = buildConversationKey(workspaceId, userId, conversationId);
  return conversationStore.delete(key);
}

/**
 * Resets the entire in-memory conversation store (used in test suites).
 */
export function resetConversationStore(): void {
  conversationStore.clear();
}
