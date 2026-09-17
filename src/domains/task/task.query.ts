import { prisma } from "@/lib/prisma";
import { TaskStatus, TaskPriority, Prisma } from "@prisma/client";

export interface TaskFilterParams {
  workspaceId: string;
  projectId?: string;
  phaseId?: string;
  milestoneId?: string;
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority | TaskPriority[];
  assigneeId?: string | string[];
  search?: string;
  dueDateStart?: Date;
  dueDateEnd?: Date;
  page?: number;
  limit?: number;
  sortBy?: "order" | "dueDate" | "priority" | "createdAt" | "updatedAt" | "title";
  sortOrder?: "asc" | "desc";
}

export class TaskQueryAdapter {
  /**
   * Builds standardized Prisma where clause ensuring strict workspace & project scoping.
   */
  static buildWhereClause(params: TaskFilterParams): Prisma.TaskWhereInput {
    const where: Prisma.TaskWhereInput = {
      workspaceId: params.workspaceId,
    };

    if (params.projectId) {
      where.projectId = params.projectId;
    }

    if (params.phaseId) {
      where.phaseId = params.phaseId;
    }

    if (params.milestoneId) {
      where.milestoneId = params.milestoneId;
    }

    if (params.status) {
      if (Array.isArray(params.status)) {
        where.status = { in: params.status };
      } else {
        where.status = params.status;
      }
    }

    if (params.priority) {
      if (Array.isArray(params.priority)) {
        where.priority = { in: params.priority };
      } else {
        where.priority = params.priority;
      }
    }

    if (params.assigneeId) {
      if (Array.isArray(params.assigneeId)) {
        where.assigneeId = { in: params.assigneeId };
      } else {
        where.assigneeId = params.assigneeId;
      }
    }

    if (params.search && params.search.trim()) {
      const q = params.search.trim();
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    if (params.dueDateStart || params.dueDateEnd) {
      where.dueDate = {};
      if (params.dueDateStart) where.dueDate.gte = params.dueDateStart;
      if (params.dueDateEnd) where.dueDate.lte = params.dueDateEnd;
    }

    return where;
  }

  /**
   * Retrieves paginated tasks matching filter params with efficient relations.
   */
  static async queryTasks(params: TaskFilterParams) {
    const where = this.buildWhereClause(params);
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 50));
    const skip = (page - 1) * limit;

    const sortBy = params.sortBy || "order";
    const sortOrder = params.sortOrder || "asc";

    const [totalCount, tasks] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
          project: { select: { id: true, name: true, slug: true, color: true } },
          phase: { select: { id: true, name: true } },
          milestone: { select: { id: true, title: true } },
          subtasks: { select: { id: true, completed: true } },
          blockedBy: { select: { id: true, blockingTaskId: true } },
        },
      }),
    ]);

    const formattedTasks = tasks.map((t) => {
      const totalSubtasks = t.subtasks.length;
      const completedSubtasks = t.subtasks.filter((s) => s.completed).length;
      return {
        ...t,
        subtasksSummary: {
          total: totalSubtasks,
          completed: completedSubtasks,
          percent: totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0,
        },
        isBlocked: t.blockedBy.length > 0,
      };
    });

    return {
      tasks: formattedTasks,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    };
  }
}
