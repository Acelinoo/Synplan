import { prisma } from "@/lib/prisma";
import { TaskStatus } from "@prisma/client";
import { TaskFilterParams, TaskQueryAdapter } from "./task.query";

export interface BoardColumn {
  status: TaskStatus;
  label: string;
  count: number;
  tasks: any[];
}

export interface BoardViewData {
  columns: Record<TaskStatus, BoardColumn>;
  totalTasks: number;
}

export interface StructuredListView {
  projectId: string;
  phases: Array<{
    id: string;
    name: string;
    description: string | null;
    order: number;
    milestones: Array<{
      id: string;
      title: string;
      targetDate: Date;
      isReached: boolean;
      tasks: any[];
      taskCount: number;
    }>;
    directTasks: any[];
    totalTasks: number;
    completedTasks: number;
  }>;
  ungroupedTasks: any[];
  totalTasks: number;
}

export class TaskViewsService {
  /**
   * Generates Board (Kanban) View Data Contract grouped by standard task statuses.
   */
  static async getBoardView(params: TaskFilterParams): Promise<BoardViewData> {
    // Fetch all matching tasks for the board without rigid page limits (up to 500 per board)
    const where = TaskQueryAdapter.buildWhereClause(params);
    const tasks = await prisma.task.findMany({
      where,
      orderBy: { order: "asc" },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        project: { select: { id: true, name: true, slug: true, color: true } },
        phase: { select: { id: true, name: true } },
        milestone: { select: { id: true, title: true } },
        subtasks: { select: { id: true, completed: true } },
        blockedBy: { select: { id: true, blockingTaskId: true } },
      },
    });

    const statusLabels: Record<TaskStatus, string> = {
      [TaskStatus.BACKLOG]: "Backlog",
      [TaskStatus.TODO]: "To Do",
      [TaskStatus.IN_PROGRESS]: "In Progress",
      [TaskStatus.IN_REVIEW]: "In Review",
      [TaskStatus.BLOCKED]: "Blocked",
      [TaskStatus.DONE]: "Done",
      [TaskStatus.CANCELED]: "Canceled",
    };

    const columns: Record<TaskStatus, BoardColumn> = {
      [TaskStatus.BACKLOG]: { status: TaskStatus.BACKLOG, label: statusLabels[TaskStatus.BACKLOG], count: 0, tasks: [] },
      [TaskStatus.TODO]: { status: TaskStatus.TODO, label: statusLabels[TaskStatus.TODO], count: 0, tasks: [] },
      [TaskStatus.IN_PROGRESS]: { status: TaskStatus.IN_PROGRESS, label: statusLabels[TaskStatus.IN_PROGRESS], count: 0, tasks: [] },
      [TaskStatus.IN_REVIEW]: { status: TaskStatus.IN_REVIEW, label: statusLabels[TaskStatus.IN_REVIEW], count: 0, tasks: [] },
      [TaskStatus.BLOCKED]: { status: TaskStatus.BLOCKED, label: statusLabels[TaskStatus.BLOCKED], count: 0, tasks: [] },
      [TaskStatus.DONE]: { status: TaskStatus.DONE, label: statusLabels[TaskStatus.DONE], count: 0, tasks: [] },
      [TaskStatus.CANCELED]: { status: TaskStatus.CANCELED, label: statusLabels[TaskStatus.CANCELED], count: 0, tasks: [] },
    };

    for (const t of tasks) {
      const totalSub = t.subtasks.length;
      const completedSub = t.subtasks.filter((s) => s.completed).length;

      const card = {
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        order: t.order,
        dueDate: t.dueDate,
        tags: t.tags,
        assignee: t.assignee,
        project: t.project,
        phase: t.phase,
        milestone: t.milestone,
        subtasksSummary: {
          total: totalSub,
          completed: completedSub,
          percent: totalSub > 0 ? Math.round((completedSub / totalSub) * 100) : 0,
        },
        isBlocked: t.blockedBy.length > 0,
      };

      if (columns[t.status]) {
        columns[t.status].tasks.push(card);
        columns[t.status].count++;
      }
    }

    return {
      columns,
      totalTasks: tasks.length,
    };
  }

  /**
   * Generates Hierarchical List View Data Contract:
   * Phase -> Milestone -> Task -> Subtasks, with an Ungrouped category for root tasks.
   * Runs in minimal parallel queries to eliminate N+1 latency.
   */
  static async getListView(params: TaskFilterParams & { projectId: string }): Promise<StructuredListView> {

    const [phases, milestones, tasks] = await Promise.all([
      prisma.phase.findMany({
        where: { projectId: params.projectId, workspaceId: params.workspaceId },
        orderBy: { order: "asc" },
      }),
      prisma.milestone.findMany({
        where: { projectId: params.projectId, workspaceId: params.workspaceId },
        orderBy: { targetDate: "asc" },
      }),
      prisma.task.findMany({
        where: TaskQueryAdapter.buildWhereClause(params),
        orderBy: { order: "asc" },
        include: {
          assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
          subtasks: { orderBy: { order: "asc" } },
          blockedBy: { select: { id: true, blockingTaskId: true } },
        },
      }),
    ]);

    const taskMapByPhaseAndMilestone = new Map<string, any[]>();
    const ungroupedTasks: any[] = [];

    for (const t of tasks) {
      const formatted = {
        ...t,
        subtasksSummary: {
          total: t.subtasks.length,
          completed: t.subtasks.filter((s) => s.completed).length,
        },
        isBlocked: t.blockedBy.length > 0,
      };

      if (!t.phaseId && !t.milestoneId) {
        ungroupedTasks.push(formatted);
      } else {
        const key = `${t.phaseId ?? "none"}:${t.milestoneId ?? "none"}`;
        if (!taskMapByPhaseAndMilestone.has(key)) {
          taskMapByPhaseAndMilestone.set(key, []);
        }
        taskMapByPhaseAndMilestone.get(key)!.push(formatted);
      }
    }

    const structuredPhases = phases.map((phase) => {
      // Find milestones that have tasks in this phase, or general milestones
      const phaseTasksNoMilestone = taskMapByPhaseAndMilestone.get(`${phase.id}:none`) || [];
      const phaseMilestones = milestones.map((ms) => {
        const msTasks = taskMapByPhaseAndMilestone.get(`${phase.id}:${ms.id}`) || [];
        return {
          id: ms.id,
          title: ms.title,
          targetDate: ms.targetDate,
          isReached: ms.isReached,
          tasks: msTasks,
          taskCount: msTasks.length,
        };
      }).filter((m) => m.taskCount > 0);

      const allPhaseTasks = tasks.filter((t) => t.phaseId === phase.id);

      return {
        id: phase.id,
        name: phase.name,
        description: phase.description,
        order: phase.order,
        milestones: phaseMilestones,
        directTasks: phaseTasksNoMilestone,
        totalTasks: allPhaseTasks.length,
        completedTasks: allPhaseTasks.filter((t) => t.status === TaskStatus.DONE).length,
      };
    });

    return {
      projectId: params.projectId,
      phases: structuredPhases,
      ungroupedTasks,
      totalTasks: tasks.length,
    };
  }

  /**
   * Generates High-Density Table View Data Contract with preformatted tabular rows.
   */
  static async getTableView(params: TaskFilterParams) {
    const result = await TaskQueryAdapter.queryTasks(params);

    const tableRows = result.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      order: t.order,
      assignee: t.assignee ? { id: t.assignee.id, name: t.assignee.name, avatarUrl: t.assignee.avatarUrl } : null,
      project: { id: t.project.id, name: t.project.name, color: t.project.color },
      phase: t.phase ? { id: t.phase.id, name: t.phase.name } : null,
      milestone: t.milestone ? { id: t.milestone.id, title: t.milestone.title } : null,
      startDate: t.startDate,
      dueDate: t.dueDate,
      completedAt: t.completedAt,
      estimatedHours: t.estimatedHours,
      actualHours: t.actualHours,
      tags: t.tags,
      isBlocked: t.isBlocked,
      subtasksCompleted: t.subtasksSummary.completed,
      subtasksTotal: t.subtasksSummary.total,
      subtasksPercent: t.subtasksSummary.percent,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

    return {
      rows: tableRows,
      pagination: result.pagination,
    };
  }
}
