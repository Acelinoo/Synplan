import { prisma } from "@/lib/prisma";
import { AutomationRule } from "@prisma/client";
import { AutomationConditions, EvaluationContext } from "./automation.conditions";

export interface MatchResult {
  rule: AutomationRule;
  context: EvaluationContext;
}

export class AutomationMatcher {
  /**
   * Matches an incoming domain event against active, scoped automation rules in PostgreSQL.
   * Utilizes the compound index @@index([workspaceId, triggerType, isActive]).
   */
  static async matchEvent(event: any): Promise<MatchResult[]> {
    if (!event || !event.workspaceId || !event.type) return [];

    const projectId = event.projectId || event.payload?.projectId;

    // 1. Efficient scoped query using index
    const candidateRules = await prisma.automationRule.findMany({
      where: {
        workspaceId: event.workspaceId,
        triggerType: event.type,
        isActive: true,
        ...(projectId
          ? {
              OR: [{ projectId: null }, { projectId }],
            }
          : { projectId: null }),
      },
    });

    if (candidateRules.length === 0) return [];

    // 2. Hydrate task / project entity context if needed for condition checks
    const taskId = event.payload?.taskId || (event.payload?.title && event.payload?.status ? event.payload?.taskId : null);
    let task: any = null;
    let hasBlockingDependency = false;

    if (taskId) {
      task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          blockedBy: {
            include: {
              blockingTask: { select: { id: true, status: true } },
            },
          },
        },
      });

      if (task) {
        hasBlockingDependency = task.blockedBy.some((dep: any) => dep.blockingTask.status !== "DONE");
      }
    }

    const evalContext: EvaluationContext = {
      event,
      task: task || event.payload,
      project: event.payload?.project,
      hasBlockingDependency,
    };

    // 3. Evaluate condition trees
    const matched: MatchResult[] = [];
    for (const rule of candidateRules) {
      const conditions = rule.conditions as any;
      const isMatch = AutomationConditions.evaluate(conditions, evalContext);
      if (isMatch) {
        matched.push({ rule, context: evalContext });
      }
    }

    return matched;
  }
}
