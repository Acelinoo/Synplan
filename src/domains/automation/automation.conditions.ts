import { RuleCondition, SingleCondition, CompoundCondition } from "./automation.types";

export interface EvaluationContext {
  event: any;
  task?: any;
  project?: any;
  hasBlockingDependency?: boolean;
}

export class AutomationConditions {
  /**
   * Evaluates a rule's condition tree against the given evaluation context.
   * Returns true if the condition tree evaluates to true.
   * Never throws; returns false on malformed conditions.
   */
  static evaluate(conditionOrList: RuleCondition | RuleCondition[] | null | undefined, context: EvaluationContext): boolean {
    if (!conditionOrList) return true;

    if (Array.isArray(conditionOrList)) {
      if (conditionOrList.length === 0) return true;
      // An array of conditions implicitly behaves as AND
      return conditionOrList.every((cond) => this.evaluateNode(cond, context));
    }

    return this.evaluateNode(conditionOrList, context);
  }

  private static evaluateNode(node: RuleCondition, context: EvaluationContext): boolean {
    if (!node || typeof node !== "object") return false;

    // Compound Condition: AND / OR
    if ("operator" in node && (node.operator === "AND" || node.operator === "OR")) {
      const compound = node as CompoundCondition;
      if (!Array.isArray(compound.conditions) || compound.conditions.length === 0) {
        return true;
      }

      if (compound.operator === "AND") {
        return compound.conditions.every((subNode) => this.evaluateNode(subNode, context));
      } else {
        return compound.conditions.some((subNode) => this.evaluateNode(subNode, context));
      }
    }

    // Single Condition
    if ("field" in node && "operator" in node) {
      return this.evaluateSingle(node as SingleCondition, context);
    }

    return false;
  }

  private static evaluateSingle(cond: SingleCondition, context: EvaluationContext): boolean {
    const actualValue = this.extractFieldValue(cond.field, context);
    const expectedValue = cond.value;
    const operator = String(cond.operator).toUpperCase();

    switch (operator) {
      case "EQUALS":
      case "==":
      case "EQ":
        return this.compareEquals(actualValue, expectedValue);

      case "NOT_EQUALS":
      case "!=":
      case "NEQ":
        return !this.compareEquals(actualValue, expectedValue);

      case "IN":
        if (Array.isArray(expectedValue)) {
          return expectedValue.some((v) => this.compareEquals(actualValue, v));
        }
        return false;

      case "NOT_IN":
        if (Array.isArray(expectedValue)) {
          return !expectedValue.some((v) => this.compareEquals(actualValue, v));
        }
        return true;

      case "GREATER_THAN":
      case ">":
      case "GT":
        return this.compareOrder(actualValue, expectedValue) > 0;

      case "LESS_THAN":
      case "<":
      case "LT":
        return this.compareOrder(actualValue, expectedValue) < 0;

      case "IS_EMPTY":
        return actualValue === undefined || actualValue === null || actualValue === "";

      case "IS_NOT_EMPTY":
        return actualValue !== undefined && actualValue !== null && actualValue !== "";

      default:
        return false;
    }
  }

  /**
   * Safely extracts value for a field dot-notation or known context aliases.
   */
  private static extractFieldValue(field: string, context: EvaluationContext): any {
    const normalized = field.toLowerCase().trim();

    // 1. Task field aliases
    if (normalized === "task.status" || normalized === "status") {
      return context.task?.status || context.event?.payload?.status || context.event?.payload?.toStatus || context.event?.payload?.newStatus;
    }

    if (normalized === "task.priority" || normalized === "priority") {
      return context.task?.priority || context.event?.payload?.priority;
    }

    if (normalized === "task.assigneeid" || normalized === "assigneeid") {
      return context.task?.assigneeId ?? context.event?.payload?.assigneeId;
    }

    if (normalized === "task.projectid" || normalized === "projectid") {
      return context.task?.projectId || context.event?.projectId || context.event?.payload?.projectId;
    }

    if (normalized === "task.duedate" || normalized === "duedate") {
      return context.task?.dueDate || context.event?.payload?.dueDate;
    }

    if (normalized === "task.hasblockingdependency" || normalized === "hasblockingdependency") {
      return Boolean(context.hasBlockingDependency);
    }

    if (normalized === "project.status" || normalized === "projectstatus") {
      return context.project?.status || context.event?.payload?.status;
    }

    // 2. Generic payload property access
    if (context.event?.payload && typeof context.event.payload === "object") {
      if (normalized in context.event.payload) {
        return (context.event.payload as any)[normalized];
      }
    }

    return undefined;
  }

  private static compareEquals(actual: any, expected: any): boolean {
    if (actual === expected) return true;
    if (actual === null && expected === null) return true;
    if (actual === undefined && expected === undefined) return true;

    // Date comparison (e.g. today)
    if (expected === "today" && (actual instanceof Date || typeof actual === "string")) {
      const actDate = new Date(actual).toISOString().split("T")[0];
      const todayDate = new Date().toISOString().split("T")[0];
      return actDate === todayDate;
    }

    // String comparison (case-insensitive for status / priority strings)
    if (typeof actual === "string" && typeof expected === "string") {
      return actual.toUpperCase() === expected.toUpperCase();
    }

    return false;
  }

  private static compareOrder(actual: any, expected: any): number {
    if (expected === "today") {
      const actTime = new Date(actual).setHours(0, 0, 0, 0);
      const todayTime = new Date().setHours(0, 0, 0, 0);
      if (actTime < todayTime) return -1;
      if (actTime > todayTime) return 1;
      return 0;
    }

    const aTime = new Date(actual).getTime();
    const eTime = new Date(expected).getTime();

    if (!isNaN(aTime) && !isNaN(eTime)) {
      if (aTime < eTime) return -1;
      if (aTime > eTime) return 1;
      return 0;
    }

    if (typeof actual === "number" && typeof expected === "number") {
      return actual - expected;
    }

    return 0;
  }
}
