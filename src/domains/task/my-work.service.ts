import { prisma } from "@/lib/prisma";
import { TaskStatus, TaskPriority } from "@prisma/client";

export interface MyWorkData {
  summary: {
    totalAssigned: number;
    dueTodayCount: number;
    overdueCount: number;
    blockedCount: number;
    highPriorityCount: number;
    completedRecentlyCount: number;
  };
  categories: {
    overdue: any[];
    dueToday: any[];
    upcoming: any[];
    blocked: any[];
    highPriority: any[];
    recentlyCompleted: any[];
  };
}

export class MyWorkService {
  /**
   * Retrieves deterministic and explainable "My Work" dashboard for a user in a workspace.
   */
  static async getMyWork(userId: string, workspaceId: string): Promise<MyWorkData> {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const sevenDaysFromNow = new Date(endOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Single query for all tasks assigned to the user in this workspace
    const userTasks = await prisma.task.findMany({
      where: {
        workspaceId,
        assigneeId: userId,
      },
      include: {
        project: { select: { id: true, name: true, slug: true, color: true } },
        phase: { select: { id: true, name: true } },
        milestone: { select: { id: true, title: true } },
        subtasks: { select: { id: true, completed: true } },
        blockedBy: {
          include: {
            blockingTask: { select: { id: true, title: true, status: true } },
          },
        },
      },
      orderBy: [
        { dueDate: "asc" },
        { priority: "desc" },
      ],
    });

    const overdue: any[] = [];
    const dueToday: any[] = [];
    const upcoming: any[] = [];
    const blocked: any[] = [];
    const highPriority: any[] = [];
    const recentlyCompleted: any[] = [];

    let totalActive = 0;

    for (const t of userTasks) {
      const isCompleted = t.status === TaskStatus.DONE;
      const isCanceled = t.status === TaskStatus.CANCELED;
      const hasActiveBlockers = t.blockedBy.some((b) => b.blockingTask.status !== TaskStatus.DONE);
      const isBlocked = t.status === TaskStatus.BLOCKED || hasActiveBlockers;

      const subtasksTotal = t.subtasks.length;
      const subtasksCompleted = t.subtasks.filter((s) => s.completed).length;

      const item = {
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
        project: t.project,
        phase: t.phase,
        milestone: t.milestone,
        isBlocked,
        blockersCount: t.blockedBy.filter((b) => b.blockingTask.status !== TaskStatus.DONE).length,
        subtasksSummary: {
          total: subtasksTotal,
          completed: subtasksCompleted,
          percent: subtasksTotal > 0 ? Math.round((subtasksCompleted / subtasksTotal) * 100) : 0,
        },
        completedAt: t.completedAt,
        updatedAt: t.updatedAt,
      };

      if (!isCompleted && !isCanceled) {
        totalActive++;

        // 1. Overdue: due date strictly before start of today
        if (t.dueDate && t.dueDate < startOfToday) {
          overdue.push(item);
        }

        // 2. Due Today: due date within today's boundaries
        if (t.dueDate && t.dueDate >= startOfToday && t.dueDate <= endOfToday) {
          dueToday.push(item);
        }

        // 3. Upcoming: due date within the next 7 days
        if (t.dueDate && t.dueDate > endOfToday && t.dueDate <= sevenDaysFromNow) {
          upcoming.push(item);
        }

        // 4. Blocked
        if (isBlocked) {
          blocked.push(item);
        }

        // 5. High Priority
        if (t.priority === TaskPriority.HIGH || t.priority === TaskPriority.URGENT) {
          highPriority.push(item);
        }
      }

      // 6. Recently completed (last 7 days)
      if (isCompleted && t.completedAt && t.completedAt >= sevenDaysAgo) {
        recentlyCompleted.push(item);
      }
    }

    return {
      summary: {
        totalAssigned: totalActive,
        dueTodayCount: dueToday.length,
        overdueCount: overdue.length,
        blockedCount: blocked.length,
        highPriorityCount: highPriority.length,
        completedRecentlyCount: recentlyCompleted.length,
      },
      categories: {
        overdue,
        dueToday,
        upcoming,
        blocked,
        highPriority,
        recentlyCompleted,
      },
    };
  }
}
