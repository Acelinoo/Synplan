import { prisma } from "@/lib/prisma";
import { TaskStatus, TaskPriority } from "@prisma/client";

export type ProjectHealthStatus = "ON_TRACK" | "AT_RISK" | "CRITICAL";

export interface ProjectHealthSignals {
  projectId: string;
  projectName: string;
  healthStatus: ProjectHealthStatus;
  reasons: string[];
  metrics: {
    totalTasks: number;
    completedTasks: number;
    completionRate: number;
    overdueTasksCount: number;
    blockedTasksCount: number;
    unassignedTasksCount: number;
    upcomingDeadlinesCount: number;
    highPriorityOpenCount: number;
  };
  upcomingDeadlines: Array<{
    id: string;
    title: string;
    dueDate: Date | null;
    status: TaskStatus;
    assigneeName?: string | null;
  }>;
}

export class ProjectHealthService {
  /**
   * Calculates deterministic, explainable health signals for a project.
   * Zero opaque AI magic; purely derived from live task aggregation.
   */
  static async calculateHealthSignals(projectId: string, workspaceId: string): Promise<ProjectHealthSignals> {
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true, name: true },
    });

    if (!project) {
      throw new Error("Project not found in this workspace.");
    }

    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    // Fetch all active/relevant tasks for the project in a single query
    const tasks = await prisma.task.findMany({
      where: { projectId, workspaceId },
      include: {
        assignee: { select: { id: true, name: true } },
        blockedBy: {
          include: {
            blockingTask: { select: { status: true } },
          },
        },
      },
    });

    const totalTasks = tasks.length;
    let completedTasks = 0;
    let overdueCount = 0;
    let blockedCount = 0;
    let unassignedCount = 0;
    let highPriorityOpen = 0;

    const upcomingDeadlines: ProjectHealthSignals["upcomingDeadlines"] = [];

    for (const t of tasks) {
      const isDone = t.status === TaskStatus.DONE;
      const isCanceled = t.status === TaskStatus.CANCELED;

      if (isDone) {
        completedTasks++;
        continue;
      }

      if (isCanceled) continue;

      // Unassigned
      if (!t.assigneeId) {
        unassignedCount++;
      }

      // Overdue
      if (t.dueDate && t.dueDate < now) {
        overdueCount++;
      }

      // Blocked
      const hasBlockers = t.blockedBy.some((b) => b.blockingTask.status !== TaskStatus.DONE);
      if (t.status === TaskStatus.BLOCKED || hasBlockers) {
        blockedCount++;
      }

      // High Priority Open
      if (t.priority === TaskPriority.HIGH || t.priority === TaskPriority.URGENT) {
        highPriorityOpen++;
      }

      // Upcoming Deadlines (within 3 days)
      if (t.dueDate && t.dueDate >= now && t.dueDate <= threeDaysFromNow) {
        upcomingDeadlines.push({
          id: t.id,
          title: t.title,
          dueDate: t.dueDate,
          status: t.status,
          assigneeName: t.assignee?.name,
        });
      }
    }

    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Evaluate deterministic status & reasons
    const reasons: string[] = [];
    let healthStatus: ProjectHealthStatus = "ON_TRACK";

    if (overdueCount >= 3) {
      healthStatus = "CRITICAL";
      reasons.push(`${overdueCount} tasks are overdue.`);
    } else if (overdueCount > 0) {
      healthStatus = "AT_RISK";
      reasons.push(`${overdueCount} task(s) are overdue.`);
    }

    if (blockedCount >= 2) {
      healthStatus = "CRITICAL";
      reasons.push(`${blockedCount} tasks are currently blocked by dependencies or issues.`);
    } else if (blockedCount > 0 && healthStatus !== "CRITICAL") {
      healthStatus = "AT_RISK";
      reasons.push(`${blockedCount} task(s) are blocked.`);
    }

    if (unassignedCount > 5 && healthStatus === "ON_TRACK") {
      healthStatus = "AT_RISK";
      reasons.push(`${unassignedCount} tasks remain unassigned.`);
    }

    if (reasons.length === 0) {
      reasons.push("All project tasks are on schedule with no blocking dependencies.");
    }

    return {
      projectId: project.id,
      projectName: project.name,
      healthStatus,
      reasons,
      metrics: {
        totalTasks,
        completedTasks,
        completionRate,
        overdueTasksCount: overdueCount,
        blockedTasksCount: blockedCount,
        unassignedTasksCount: unassignedCount,
        upcomingDeadlinesCount: upcomingDeadlines.length,
        highPriorityOpenCount: highPriorityOpen,
      },
      upcomingDeadlines,
    };
  }
}
