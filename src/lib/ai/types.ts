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
  status?: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
  assigneeName?: string;
  assigneeId?: string | null;
  dueDate?: string;
  phaseId?: string;
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

export interface AiPlan {
  id: string;
  userPrompt: string;
  assistantMessage: string;
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
  planner: "llm" | "heuristic";
  provider: "gemini" | "openai" | "fallback";
  confidence?: number;
  contextSummary?: string;
  idempotencyKey?: string;
  createdAt: string;
}

export interface AiExecutionContext {
  workspaceId: string;
  workspaceName?: string;
  userId: string;
  userName: string;
  userRole?: Role | string;
  currentProjectId?: string;
  currentProjectName?: string;
  currentTaskId?: string;
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
    title: string;
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
