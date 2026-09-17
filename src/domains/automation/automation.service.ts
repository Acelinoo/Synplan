import { prisma } from "@/lib/prisma";
import { AutomationRule } from "@prisma/client";
import {
  CreateAutomationRuleDTO,
  UpdateAutomationRuleDTO,
  AutomationExecutionContext,
  AutomationExecutionResult,
} from "./automation.types";
import { AutomationGuard } from "./automation.guard";
import { AutomationMatcher } from "./automation.matcher";
import { AutomationExecutor } from "./automation.executor";

export class AutomationService {
  /**
   * Creates a new automation rule with strict validation.
   */
  static async createRule(data: CreateAutomationRuleDTO): Promise<AutomationRule> {
    const validation = await AutomationGuard.validateCreate(data);
    if (!validation.isValid) {
      throw new Error(`Validation Error: ${validation.error}`);
    }

    return prisma.automationRule.create({
      data: {
        workspaceId: data.workspaceId,
        projectId: data.projectId || null,
        name: data.name.trim(),
        triggerType: data.triggerType,
        conditions: data.conditions as any,
        actions: data.actions as any,
        isActive: data.isActive !== undefined ? data.isActive : true,
      },
    });
  }

  /**
   * Updates an existing automation rule.
   */
  static async updateRule(
    id: string,
    workspaceId: string,
    data: UpdateAutomationRuleDTO
  ): Promise<AutomationRule> {
    const existing = await prisma.automationRule.findFirst({
      where: { id, workspaceId },
    });

    if (!existing) {
      throw new Error("Automation rule not found in this workspace.");
    }

    const validation = await AutomationGuard.validateUpdate(workspaceId, data);
    if (!validation.isValid) {
      throw new Error(`Validation Error: ${validation.error}`);
    }

    return prisma.automationRule.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name.trim() : undefined,
        projectId: data.projectId !== undefined ? data.projectId : undefined,
        triggerType: data.triggerType,
        conditions: data.conditions !== undefined ? (data.conditions as any) : undefined,
        actions: data.actions !== undefined ? (data.actions as any) : undefined,
        isActive: data.isActive !== undefined ? data.isActive : undefined,
      },
    });
  }

  /**
   * Retrieves an automation rule by ID with workspace isolation.
   */
  static async getRuleById(id: string, workspaceId: string): Promise<AutomationRule | null> {
    return prisma.automationRule.findFirst({
      where: { id, workspaceId },
    });
  }

  /**
   * Lists automation rules for a workspace and optional project.
   */
  static async getRules(workspaceId: string, projectId?: string): Promise<AutomationRule[]> {
    return prisma.automationRule.findMany({
      where: {
        workspaceId,
        ...(projectId ? { OR: [{ projectId: null }, { projectId }] } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Deletes an automation rule.
   */
  static async deleteRule(id: string, workspaceId: string): Promise<boolean> {
    const existing = await prisma.automationRule.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });

    if (!existing) {
      throw new Error("Automation rule not found in this workspace.");
    }

    await prisma.automationRule.delete({
      where: { id },
    });

    return true;
  }

  /**
   * Enables or disables an automation rule.
   */
  static async toggleRule(id: string, workspaceId: string, isActive: boolean): Promise<AutomationRule> {
    const existing = await prisma.automationRule.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });

    if (!existing) {
      throw new Error("Automation rule not found in this workspace.");
    }

    return prisma.automationRule.update({
      where: { id },
      data: { isActive },
    });
  }

  /**
   * Evaluates and executes all matching automation rules for an incoming domain event.
   */
  static async processEvent(
    event: any,
    context?: AutomationExecutionContext
  ): Promise<AutomationExecutionResult[]> {
    const results: AutomationExecutionResult[] = [];

    try {
      const matches = await AutomationMatcher.matchEvent(event);
      if (matches.length === 0) return [];

      const currentContext: AutomationExecutionContext = context || {
        rootEventId: event.id,
        depth: 0,
        visitedRules: [],
      };

      for (const match of matches) {
        const result = await AutomationExecutor.executeRule(
          match.rule,
          event,
          match.context,
          currentContext
        );

        results.push(result);
      }
    } catch (err: any) {
      console.error("[AutomationService] Event processing failed:", err?.message || err);
    }

    return results;
  }
}
