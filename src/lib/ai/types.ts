import { Role } from "@prisma/client";

/**
 * Supported AI Action Types across Synplan Centralized Action Registry
 */
export type AiActionType =
  | "CREATE_PROJECT"
  | "UPDATE_PROJECT"
  | "DELETE_PROJECT"
  | "CREATE_PHASE"
  | "UPDATE_PHASE"
  | "DELETE_PHASE"
  | "CREATE_TASK"
  | "UPDATE_TASK"
  | "DELETE_TASK"
  | "ASSIGN_TASK"
  | "ADD_MEMBER"
  | "ADD_PROJECT_MEMBER"
  | "REMOVE_MEMBER"
  | "REMOVE_PROJECT_MEMBER";

/**
 * 4-Tier Risk Classification System
 * LOW: Read, search, preview
 * MEDIUM: Create project, create task, assign task, add member
 * HIGH: Update critical settings, remove member, bulk modifications
 * CRITICAL: Delete project, bulk delete, destructive workflows (Strict confirmation required)
 */
export type ActionRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type WorkflowPolicy = "ATOMIC" | "PARTIAL_SUCCESS_ALLOWED";

export type ActionExecutionStatus =
  | "READY"
  | "NEEDS_CLARIFICATION"
  | "NEEDS_CONFIRMATION"
  | "FORBIDDEN"
  | "INVALID"
  | "BLOCKED"
  | "FAILED"
  | "COMPLETED";

export type EntityType = "MEMBER" | "PROJECT" | "TASK" | "PHASE";

export type EntityMatchStatus =
  | "EXACT_MATCH"
  | "SINGLE_HIGH_CONFIDENCE"
  | "AMBIGUOUS"
  | "LOW_CONFIDENCE"
  | "TOO_MANY_CANDIDATES"
  | "NO_MATCH";

export interface ResolvedEntityCandidate<T = any> {
  id: string;
  name: string;
  secondaryText?: string;
  score: number;
  data: T;
}

export interface UniversalResolutionResult<T = any> {
  entityType: EntityType;
  query: string;
  status: EntityMatchStatus;
  isAmbiguous: boolean;
  notFound: boolean;
  selectedEntity?: T;
  selectedEntities?: T[];
  candidates: ResolvedEntityCandidate<T>[];
  candidateNames: string[];
  clarificationPrompt?: string;
  confidence: number;
}

export interface MemberResolutionResult {
  member?: AiExecutionContext["members"][0];
  members?: AiExecutionContext["members"];
  status?: EntityMatchStatus;
  isAmbiguous: boolean;
  candidates: string[];
  matchedCandidates?: string[];
  candidateDetails?: ResolvedEntityCandidate<AiExecutionContext["members"][0]>[];
  clarificationPrompt?: string;
  notFound: boolean;
  confidence: number;
}

export interface ProjectResolutionResult {
  project?: AiExecutionContext["projects"][0];
  status?: EntityMatchStatus;
  isAmbiguous: boolean;
  candidates: string[];
  candidateDetails?: ResolvedEntityCandidate<AiExecutionContext["projects"][0]>[];
  clarificationPrompt?: string;
  notFound: boolean;
  confidence: number;
}

export interface TaskResolutionResult {
  task?: AiExecutionContext["tasks"][0];
  status?: EntityMatchStatus;
  isAmbiguous: boolean;
  candidates: string[];
  candidateDetails?: ResolvedEntityCandidate<AiExecutionContext["tasks"][0]>[];
  clarificationPrompt?: string;
  notFound: boolean;
  confidence: number;
}

export interface ClarificationState {
  id: string;
  workspaceId?: string;
  userId?: string;
  entityType: EntityType;
  query: string;
  originalActionType: AiActionType;
  candidates: Array<{ id: string; name: string; secondaryText?: string }>;
  allowMultiSelect: boolean;
  message: string;
  createdAt: string;
}

export interface CreateProjectPayload {
  name: string;
  description?: string;
  deadline?: string;
  color?: string;
  status?: "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED";
  phases?: Array<{ name: string; order?: number }>;
  initialTasks?: Array<{
    title: string;
    description?: string;
    priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    status?: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
    phaseName?: string;
    assigneeName?: string;
    assigneeId?: string;
    dueDate?: string;
  }>;
  memberNames?: string[];
  memberIds?: string[];
}

export interface CreatePhasePayload {
  projectId?: string;
  projectName?: string;
  name: string;
  description?: string;
  order?: number;
}

export interface CreateTaskPayload {
  projectId?: string;
  projectName?: string;
  phaseId?: string;
  phaseName?: string;
  title: string;
  description?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status?: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
  assigneeName?: string;
  assigneeId?: string;
  dueDate?: string;
  subtasks?: string[];
  tags?: string[];
}

export interface UpdateProjectPayload {
  projectId?: string;
  projectName?: string;
  name?: string;
  description?: string;
  status?: "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "ARCHIVED";
  deadline?: string;
  color?: string;
}

export interface UpdateTaskPayload {
  taskId?: string;
  taskTitle?: string;
  projectId?: string;
  title?: string;
  description?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status?: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "BLOCKED";
  assigneeName?: string;
  assigneeId?: string | null;
  unassign?: boolean;
  dueDate?: string;
  clearDueDate?: boolean;
  phaseId?: string | null;
  phaseName?: string;
}

export interface AssignTaskPayload {
  taskId?: string;
  taskTitle?: string;
  assigneeId?: string;
  assigneeName: string;
  projectId?: string;
}

export interface AddProjectMemberPayload {
  projectId?: string;
  projectName?: string;
  userId?: string;
  userName?: string;
  memberName?: string;
  role?: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
}

export interface DeleteEntityPayload {
  id?: string;
  name?: string;
  entityType: "PROJECT" | "TASK" | "PHASE";
}

export type ActionPayloadMap = {
  CREATE_PROJECT: CreateProjectPayload;
  UPDATE_PROJECT: UpdateProjectPayload;
  DELETE_PROJECT: DeleteEntityPayload;
  CREATE_PHASE: CreatePhasePayload;
  UPDATE_PHASE: { phaseId?: string; name?: string; order?: number };
  DELETE_PHASE: DeleteEntityPayload;
  CREATE_TASK: CreateTaskPayload;
  UPDATE_TASK: UpdateTaskPayload;
  DELETE_TASK: DeleteEntityPayload;
  ASSIGN_TASK: AssignTaskPayload;
  ADD_MEMBER: AddProjectMemberPayload;
  ADD_PROJECT_MEMBER: AddProjectMemberPayload;
  REMOVE_MEMBER: { projectId?: string; userId?: string; userName?: string };
  REMOVE_PROJECT_MEMBER: { projectId?: string; userId?: string; userName?: string };
};

export interface AiAction<T extends AiActionType = AiActionType> {
  id: string;
  type: T;
  payload: ActionPayloadMap[T] | any;
  summary: string;
  riskLevel: ActionRiskLevel;
  requiredRole: Role;
  isDestructive?: boolean;
  requiresConfirmation?: boolean;
  status: ActionExecutionStatus;
  dependsOn?: string[]; // IDs of actions this action depends upon
  temporaryRefs?: Record<string, string>; // Maps payload property keys to temporary reference keys (e.g. { "projectId": "act_1" })
  blockedReason?: string;
  warnings?: string[];
  errors?: string[];
}

export type AiCreationMode = "STRICT" | "SMART";

export interface ExplicitProjectConstraints {
  exactProjectName?: string;
  exactPhaseCount?: number;
  exactPhaseNames?: string[];
  exactTaskCount?: number;
  exactTaskTitles?: string[];
  structuredTasks?: Array<{
    title: string;
    phaseName?: string;
    assigneeName?: string;
    priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  }>;
  exactDeadline?: string;
  exactMembers?: string[];
  hasExplicitStructure: boolean;
}

export interface AIProjectPlan {
  mode: AiCreationMode;
  project: {
    name: string;
    description?: string;
    deadline?: string;
    color?: string;
    status?: "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED";
  };
  phases: Array<{
    name: string;
    description?: string;
    order?: number;
    tasks: Array<{
      title: string;
      description?: string;
      priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
      status?: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
      dueDate?: string;
      assigneeName?: string;
      assigneeId?: string;
      subtasks?: Array<{ title: string }>;
    }>;
  }>;
  teamMembers?: Array<{
    userName: string;
    userId?: string;
    role?: string;
  }>;
  explicitConstraints?: ExplicitProjectConstraints;
}

export type ConfirmationStatus =
  | "IDLE"
  | "PLAN_READY"
  | "NEEDS_CONFIRMATION"
  | "CONFIRMED"
  | "CANCELLED"
  | "EXPIRED"
  | "EXECUTING"
  | "SUCCESS"
  | "FAILED";

export interface ActionPreviewItem {
  actionId: string;
  type: AiActionType | string;
  entityType: "TASK" | "PROJECT" | "PHASE" | "MEMBER";
  entityName: string;
  riskLevel: ActionRiskLevel;
  isDestructive: boolean;
  changes?: { field: string; from?: string | null; to: string | null }[];
  warning?: string;
  summary: string;
}

export interface TargetEntitySnapshot {
  id: string;
  type: "TASK" | "PROJECT" | "PHASE" | "MEMBER";
  name?: string;
  updatedAt?: string;
  status?: string;
  version?: number;
  hash?: string;
}

export interface PendingConfirmationRecord {
  token: string;
  planFingerprint: string;
  userId: string;
  workspaceId: string;
  planId: string;
  plan: AiPlan;
  actions: AiAction[];
  targetEntitySnapshots: TargetEntitySnapshot[];
  createdAt: string;
  expiresAt: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "EXPIRED" | "EXECUTED";
}

export interface AiPlan {
  id: string;
  userPrompt: string;
  assistantMessage: string;
  mode?: AiCreationMode;
  actions: AiAction[];
  status: ActionExecutionStatus;
  requiresConfirmation: boolean;
  isDestructive: boolean;
  riskLevel?: ActionRiskLevel;
  workflowPolicy?: WorkflowPolicy;
  warnings: string[];
  errors?: string[];
  needsClarification?: boolean;
  clarificationsNeeded?: string[];
  clarificationState?: ClarificationState;
  projectPlan?: AIProjectPlan;
  explicitConstraints?: ExplicitProjectConstraints;
  planner: "llm" | "heuristic";
  provider: "gemini" | "openai" | "fallback";
  confidence?: number;
  contextSummary?: string;
  idempotencyKey?: string;
  planFingerprint?: string;
  confirmationToken?: string;
  confirmationExpiresAt?: string;
  confirmationStatus?: ConfirmationStatus;
  actionPreviews?: ActionPreviewItem[];
  createdAt: string;
}

export type ContextConfidenceLevel =
  | "EXACT"
  | "CONTEXT_EXACT"
  | "RECENT_EXACT"
  | "DEFAULT"
  | "AMBIGUOUS"
  | "MISSING";

export type ContextResolutionSource =
  | "EXPLICIT"
  | "SLASH_ARGUMENT"
  | "UI_CONTEXT"
  | "CONVERSATION"
  | "DEFAULT";

export interface ContextResolutionResult<T> {
  entity?: T;
  entityType: EntityType;
  entityId?: string;
  entityName?: string;
  source: ContextResolutionSource;
  confidence: ContextConfidenceLevel;
  confidenceScore: number;
  status: EntityMatchStatus;
  isAmbiguous: boolean;
  candidates: string[];
  candidateDetails?: ResolvedEntityCandidate<T>[];
  clarificationPrompt?: string;
  isStale?: boolean;
}

export interface RecentEntities {
  projects?: string[];
  phases?: string[];
  tasks?: string[];
  members?: string[];
}

export const MAX_BATCH_ACTIONS = 50;

export type AiConversationIntentType =
  | "NEW_INTENT"
  | "CONTINUATION"
  | "CORRECTION"
  | "REFERENCE"
  | "CANCELLATION"
  | "CONFIRMATION";

export interface AiConversationEntityRef {
  type: EntityType;
  id: string;
  name: string;
  projectId?: string;
  phaseId?: string;
  lastReferencedAt: string;
}

export interface AiConversationTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  turnIndex: number;
  intentType?: AiConversationIntentType;
  entityReferences?: Array<{ type: EntityType; id: string; name: string }>;
  planId?: string;
}

export interface AiConversationState {
  conversationId: string;
  workspaceId: string;
  userId: string;
  turnIndex: number;
  lastIntent?: string;
  lastIntentType?: AiConversationIntentType;
  lastActionIds?: string[];
  activeEntity?: AiConversationEntityRef;
  recentEntities: {
    projects: AiConversationEntityRef[];
    tasks: AiConversationEntityRef[];
    phases: AiConversationEntityRef[];
    members: AiConversationEntityRef[];
  };
  lastCreatedEntity?: AiConversationEntityRef;
  lastModifiedEntity?: AiConversationEntityRef;
  pendingConfirmation?: {
    token: string;
    planFingerprint: string;
    planId: string;
    expiresAt: string;
  };
  history: AiConversationTurn[];
  createdAt: string;
  updatedAt: string;
}

export interface AiExecutionContext {
  workspaceId: string;
  workspaceName?: string;
  userId: string;
  userName: string;
  userRole?: Role | string;
  conversationId?: string;
  conversationState?: AiConversationState;
  currentProjectId?: string;
  currentProjectName?: string;
  currentPhaseId?: string;
  currentPhaseName?: string;
  currentTaskId?: string;
  currentTaskTitle?: string;
  currentMemberId?: string;
  currentMemberName?: string;
  currentView?: string;
  recentEntities?: RecentEntities;
  activePath?: string;
  serverTime?: string;
  isMock?: boolean;
  members: Array<{
    id: string;
    userId: string;
    name: string;
    email: string;
    role: Role | string;
  }>;
  projects: Array<{
    id: string;
    name: string;
    status: string;
    totalTasks: number;
    deadline?: string | null;
  }>;
  phases: Array<{
    id: string;
    projectId: string;
    name: string;
    order: number;
  }>;
  tasks: Array<{
    id: string;
    projectId: string;
    phaseId?: string | null;
    title: string;
    description?: string | null;
    status: string;
    priority: string;
    assigneeId?: string | null;
    dueDate?: string | null;
  }>;
  conversationHistory?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  pendingClarification?: ClarificationState;
}

export interface ActionResultItem {
  actionId: string;
  type: AiActionType;
  success: boolean;
  verified: boolean;
  status: "SUCCESS" | "FAILED" | "BLOCKED";
  data?: any;
  error?: string;
  summary: string;
  dependsOn?: string[];
  blockedReason?: string;
  isReversible?: boolean;
  rollbackPayload?: any;
}

export interface ActionReceiptItem {
  actionId: string;
  type: AiActionType;
  status: "SUCCESS" | "FAILED" | "BLOCKED";
  entityId?: string;
  entityType?: EntityType;
  entityName?: string;
  error?: string;
  isReversible: boolean;
  rollbackData?: {
    actionType: AiActionType;
    entityId: string;
    entityType: EntityType;
    payload: any;
  };
  summary: string;
}

export interface ExecutionReceipt {
  executionId: string;
  planId: string;
  workspaceId: string;
  userId: string;
  timestamp: string;
  status: "SUCCESS" | "FAILED" | "PARTIAL_SUCCESS" | "BLOCKED";
  workflowPolicy: WorkflowPolicy;
  actions: ActionReceiptItem[];
  reversible: boolean;
  summary: string;
  successfulCount: number;
  failedCount: number;
  blockedCount: number;
}

export interface AiExecutionResult {
  planId: string;
  idempotencyKey?: string;
  success: boolean;
  status: "SUCCESS" | "FAILED" | "PARTIAL_SUCCESS" | "BLOCKED";
  results: ActionResultItem[];
  createdEntities: {
    projectIds: string[];
    taskIds: string[];
    phaseIds: string[];
  };
  receipt?: ExecutionReceipt;
  summary: string;
  error?: string;
}

export interface AiChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  plan?: AiPlan;
  executionResult?: AiExecutionResult;
  timestamp: string;
}
