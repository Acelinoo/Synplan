import { TaskStatus, TaskPriority } from "@prisma/client";

export type AutomationTriggerType =
  | "TASK_CREATED"
  | "TASK_UPDATED"
  | "TASK_ASSIGNED"
  | "TASK_STATUS_CHANGED"
  | "TASK_COMPLETED"
  | "TASK_DELETED"
  | "TASK_DEPENDENCY_CREATED"
  | "TASK_DEPENDENCY_REMOVED"
  | "COMMENT_CREATED"
  | "PROJECT_UPDATED";

export const SUPPORTED_TRIGGERS: AutomationTriggerType[] = [
  "TASK_CREATED",
  "TASK_UPDATED",
  "TASK_ASSIGNED",
  "TASK_STATUS_CHANGED",
  "TASK_COMPLETED",
  "TASK_DELETED",
  "TASK_DEPENDENCY_CREATED",
  "TASK_DEPENDENCY_REMOVED",
  "COMMENT_CREATED",
  "PROJECT_UPDATED",
];

export type ConditionOperator =
  | "EQUALS"
  | "NOT_EQUALS"
  | "IN"
  | "NOT_IN"
  | "GREATER_THAN"
  | "LESS_THAN"
  | "IS_EMPTY"
  | "IS_NOT_EMPTY";

export interface SingleCondition {
  field: string;
  operator: ConditionOperator;
  value?: any;
}

export interface CompoundCondition {
  operator: "AND" | "OR";
  conditions: Array<SingleCondition | CompoundCondition>;
}

export type RuleCondition = SingleCondition | CompoundCondition;

export type AutomationActionType =
  | "SET_STATUS"
  | "SET_PRIORITY"
  | "ASSIGN_TASK"
  | "UNASSIGN_TASK"
  | "CREATE_NOTIFICATION"
  | "ADD_COMMENT";

export const SUPPORTED_ACTION_TYPES: AutomationActionType[] = [
  "SET_STATUS",
  "SET_PRIORITY",
  "ASSIGN_TASK",
  "UNASSIGN_TASK",
  "CREATE_NOTIFICATION",
  "ADD_COMMENT",
];

export interface SetStatusActionPayload {
  status: TaskStatus;
}

export interface SetPriorityActionPayload {
  priority: TaskPriority;
}

export interface AssignTaskActionPayload {
  assigneeId: string;
}

export interface CreateNotificationActionPayload {
  userId?: string;
  recipientType?: "ASSIGNEE" | "CREATOR" | "LEAD" | "SPECIFIC";
  title: string;
  description: string;
}

export interface AddCommentActionPayload {
  content: string;
}

export interface RuleAction {
  type: AutomationActionType;
  payload: Record<string, any>;
}

export interface AutomationExecutionContext {
  rootEventId: string;
  depth: number;
  visitedRules: string[];
}

export interface AutomationExecutionResult {
  ruleId: string;
  eventId: string;
  status: "EXECUTED" | "SKIPPED" | "FAILED";
  actionsExecuted: number;
  reason?: string;
  error?: string;
  durationMs: number;
}

export interface CreateAutomationRuleDTO {
  workspaceId: string;
  projectId?: string | null;
  name: string;
  triggerType: AutomationTriggerType;
  conditions: RuleCondition | RuleCondition[];
  actions: RuleAction[];
  isActive?: boolean;
}

export interface UpdateAutomationRuleDTO {
  name?: string;
  projectId?: string | null;
  triggerType?: AutomationTriggerType;
  conditions?: RuleCondition | RuleCondition[];
  actions?: RuleAction[];
  isActive?: boolean;
}
