import { AutomationRule } from "@prisma/client";
import {
  AutomationExecutionContext,
  AutomationExecutionResult,
  RuleAction,
} from "./automation.types";
import { AutomationActions, ActionExecutionContext } from "./automation.actions";
import { globalAutomationIdempotency, AutomationIdempotencyTracker } from "./automation.idempotency";
import { EvaluationContext } from "./automation.conditions";

export const MAX_AUTOMATION_DEPTH = 5;

export class AutomationExecutor {
  /**
   * Executes a matched automation rule in a recursion-guarded, idempotent sandbox.
   * NEVER lets an action failure abort or rollback the parent domain mutation.
   */
  static async executeRule(
    rule: AutomationRule,
    event: any,
    evalContext: EvaluationContext,
    context?: AutomationExecutionContext
  ): Promise<AutomationExecutionResult> {
    const startTime = Date.now();

    const currentContext: AutomationExecutionContext = context || {
      rootEventId: event.id,
      depth: 0,
      visitedRules: [],
    };

    // 1. Recursion Guard: Maximum Depth Limit
    if (currentContext.depth >= MAX_AUTOMATION_DEPTH) {
      console.warn(
        `[AutomationExecutor] Recursion limit reached (depth: ${currentContext.depth}). Skipping rule: ${rule.name} (${rule.id})`
      );
      return {
        ruleId: rule.id,
        eventId: event.id,
        status: "SKIPPED",
        actionsExecuted: 0,
        reason: "MAX_DEPTH_EXCEEDED",
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Recursion Guard: Cycle / Self-Invocation Limit
    if (currentContext.visitedRules.includes(rule.id)) {
      console.warn(
        `[AutomationExecutor] Circular execution detected for rule: ${rule.name} (${rule.id}). Skipping to prevent loop.`
      );
      return {
        ruleId: rule.id,
        eventId: event.id,
        status: "SKIPPED",
        actionsExecuted: 0,
        reason: "CIRCULAR_RULE_DETECTED",
        durationMs: Date.now() - startTime,
      };
    }

    const actions = (rule.actions as unknown as RuleAction[]) || [];
    if (!Array.isArray(actions) || actions.length === 0) {
      return {
        ruleId: rule.id,
        eventId: event.id,
        status: "SKIPPED",
        actionsExecuted: 0,
        reason: "NO_ACTIONS_CONFIGURED",
        durationMs: Date.now() - startTime,
      };
    }

    let actionsExecuted = 0;

    const actionContext: ActionExecutionContext = {
      workspaceId: rule.workspaceId,
      projectId: rule.projectId || event.projectId || event.payload?.projectId,
      ruleId: rule.id,
      eventId: event.id,
      eventPayload: event.payload || {},
      task: evalContext.task,
    };

    try {
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        const idempotencyKey = AutomationIdempotencyTracker.generateKey(rule.id, event.id, i);

        // 3. Idempotency Check: Action already executed for this triggering event
        if (globalAutomationIdempotency.isExecuted(idempotencyKey)) {
          continue;
        }

        // 4. Action Execution
        const result = await AutomationActions.execute(action, actionContext);
        if (!result.success) {
          console.warn(
            `[AutomationExecutor] Action #${i} (${action.type}) failed for rule ${rule.name}:`,
            result.error
          );
          return {
            ruleId: rule.id,
            eventId: event.id,
            status: "FAILED",
            actionsExecuted,
            error: result.error,
            durationMs: Date.now() - startTime,
          };
        }

        // Mark action executed in idempotency cache
        globalAutomationIdempotency.markExecuted(idempotencyKey);
        actionsExecuted++;
      }

      return {
        ruleId: rule.id,
        eventId: event.id,
        status: "EXECUTED",
        actionsExecuted,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      // 5. Failure Isolation: Never crash domain mutation
      console.error(
        `[AutomationExecutor] Unhandled failure in rule ${rule.name} (${rule.id}):`,
        err?.message || err
      );

      return {
        ruleId: rule.id,
        eventId: event.id,
        status: "FAILED",
        actionsExecuted,
        error: err?.message || "Execution exception",
        durationMs: Date.now() - startTime,
      };
    }
  }
}
