import { prisma } from "@/lib/prisma";
import {
  CreateAutomationRuleDTO,
  UpdateAutomationRuleDTO,
  SUPPORTED_TRIGGERS,
  SUPPORTED_ACTION_TYPES,
  RuleCondition,
  RuleAction,
} from "./automation.types";
import { TaskStatus, TaskPriority } from "@prisma/client";

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export class AutomationGuard {
  /**
   * Validates a rule creation payload against security, consistency, and schema rules.
   */
  static async validateCreate(data: CreateAutomationRuleDTO): Promise<ValidationResult> {
    if (!data.name || typeof data.name !== "string" || data.name.trim().length === 0) {
      return { isValid: false, error: "Rule name is required and cannot be empty." };
    }

    if (data.name.length > 100) {
      return { isValid: false, error: "Rule name exceeds maximum length of 100 characters." };
    }

    if (!data.workspaceId) {
      return { isValid: false, error: "workspaceId is required." };
    }

    // 1. Verify workspace exists
    const workspace = await prisma.workspace.findUnique({
      where: { id: data.workspaceId },
      select: { id: true },
    });

    if (!workspace) {
      return { isValid: false, error: "Workspace does not exist." };
    }

    // 2. Verify project belongs to workspace (if scoped)
    if (data.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: data.projectId, workspaceId: data.workspaceId },
        select: { id: true },
      });

      if (!project) {
        return { isValid: false, error: "Referenced project does not exist within this workspace." };
      }
    }

    // 3. Validate trigger
    if (!SUPPORTED_TRIGGERS.includes(data.triggerType)) {
      return { isValid: false, error: `Unsupported triggerType: '${data.triggerType}'` };
    }

    // 4. Validate conditions
    const condValid = this.validateConditions(data.conditions);
    if (!condValid.isValid) return condValid;

    // 5. Validate actions
    const actValid = await this.validateActions(data.actions, data.workspaceId);
    if (!actValid.isValid) return actValid;

    return { isValid: true };
  }

  /**
   * Validates a rule update payload.
   */
  static async validateUpdate(
    workspaceId: string,
    data: UpdateAutomationRuleDTO
  ): Promise<ValidationResult> {
    if (data.name !== undefined) {
      if (typeof data.name !== "string" || data.name.trim().length === 0) {
        return { isValid: false, error: "Rule name cannot be empty." };
      }
      if (data.name.length > 100) {
        return { isValid: false, error: "Rule name exceeds 100 characters." };
      }
    }

    if (data.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: data.projectId, workspaceId },
        select: { id: true },
      });

      if (!project) {
        return { isValid: false, error: "Referenced project does not exist within this workspace." };
      }
    }

    if (data.triggerType && !SUPPORTED_TRIGGERS.includes(data.triggerType)) {
      return { isValid: false, error: `Unsupported triggerType: '${data.triggerType}'` };
    }

    if (data.conditions) {
      const condValid = this.validateConditions(data.conditions);
      if (!condValid.isValid) return condValid;
    }

    if (data.actions) {
      const actValid = await this.validateActions(data.actions, workspaceId);
      if (!actValid.isValid) return actValid;
    }

    return { isValid: true };
  }

  private static validateConditions(conditions: RuleCondition | RuleCondition[] | undefined): ValidationResult {
    if (!conditions) return { isValid: true };

    const nodes = Array.isArray(conditions) ? conditions : [conditions];
    for (const node of nodes) {
      if (!node || typeof node !== "object") {
        return { isValid: false, error: "Condition must be a valid object." };
      }

      if ("operator" in node && (node.operator === "AND" || node.operator === "OR")) {
        const compound = node as any;
        if (Array.isArray(compound.conditions)) {
          const subRes = this.validateConditions(compound.conditions);
          if (!subRes.isValid) return subRes;
        }
      } else if ("field" in node && "operator" in node) {
        const single = node as any;
        if (!single.field || typeof single.field !== "string") {
          return { isValid: false, error: "Condition field must be a valid string." };
        }
      } else {
        return { isValid: false, error: "Malformed condition node: missing operator or field." };
      }
    }

    return { isValid: true };
  }

  private static async validateActions(actions: RuleAction[], workspaceId: string): Promise<ValidationResult> {
    if (!Array.isArray(actions) || actions.length === 0) {
      return { isValid: false, error: "Rule must contain at least one action." };
    }

    if (actions.length > 10) {
      return { isValid: false, error: "Rule exceeds maximum allowed action count (10 actions)." };
    }

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      if (!SUPPORTED_ACTION_TYPES.includes(action.type)) {
        return { isValid: false, error: `Action #${i + 1}: Unsupported action type '${action.type}'.` };
      }

      const p = action.payload || {};

      switch (action.type) {
        case "SET_STATUS":
          if (!p.status || !Object.values(TaskStatus).includes(p.status)) {
            return { isValid: false, error: `Action #${i + 1}: Invalid status '${p.status}'.` };
          }
          break;

        case "SET_PRIORITY":
          if (!p.priority || !Object.values(TaskPriority).includes(p.priority)) {
            return { isValid: false, error: `Action #${i + 1}: Invalid priority '${p.priority}'.` };
          }
          break;

        case "ASSIGN_TASK":
          if (!p.assigneeId || typeof p.assigneeId !== "string") {
            return { isValid: false, error: `Action #${i + 1}: 'assigneeId' is required.` };
          }
          // Verify assignee belongs to workspace
          const member = await prisma.workspaceMember.findUnique({
            where: {
              workspaceId_userId: {
                workspaceId,
                userId: p.assigneeId,
              },
            },
          });
          if (!member) {
            return { isValid: false, error: `Action #${i + 1}: Assignee user does not belong to workspace.` };
          }
          break;

        case "CREATE_NOTIFICATION":
          if (!p.title || typeof p.title !== "string" || !p.description) {
            return { isValid: false, error: `Action #${i + 1}: Notification 'title' and 'description' are required.` };
          }
          if (p.userId) {
            const notifMember = await prisma.workspaceMember.findUnique({
              where: {
                workspaceId_userId: {
                  workspaceId,
                  userId: p.userId,
                },
              },
            });
            if (!notifMember) {
              return { isValid: false, error: `Action #${i + 1}: Notification recipient does not belong to workspace.` };
            }
          }
          break;

        case "ADD_COMMENT":
          if (!p.content || typeof p.content !== "string" || p.content.trim().length === 0) {
            return { isValid: false, error: `Action #${i + 1}: Comment 'content' is required.` };
          }
          break;
      }
    }

    return { isValid: true };
  }
}
