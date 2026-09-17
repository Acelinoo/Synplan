import { prisma } from "@/lib/prisma";
import { TaskStatus, TaskPriority, ProjectRole } from "@prisma/client";
import { verifyUserProjectAccess } from "../identity/guards";
import { TaskStateMachine } from "./task.state-machine";
import { DependencyService } from "./dependency.service";
import { eventBus } from "../events/event-bus";

export interface CreateTaskDTO {
  workspaceId: string;
  projectId: string;
  phaseId?: string | null;
  milestoneId?: string | null;
  assigneeId?: string | null;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  order?: number;
  startDate?: Date | null;
  dueDate?: Date | null;
  tags?: string[];
  estimatedHours?: number | null;
  actualHours?: number | null;
}

export interface UpdateTaskDTO {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  phaseId?: string | null;
  milestoneId?: string | null;
  assigneeId?: string | null;
  order?: number;
  startDate?: Date | null;
  dueDate?: Date | null;
  tags?: string[];
  estimatedHours?: number | null;
  actualHours?: number | null;
}

export class TaskDomainService {
  /**
   * Create a new task within a project.
   * Enforces Project Membership (LEAD or CONTRIBUTOR).
   * Validates Phase & Milestone project boundaries.
   */
  static async createTask(actorUserId: string, data: CreateTaskDTO) {
    const auth = await verifyUserProjectAccess({
      userId: actorUserId,
      projectId: data.projectId,
      workspaceId: data.workspaceId,
      allowedRoles: [ProjectRole.LEAD, ProjectRole.CONTRIBUTOR],
    });

    if (!auth.isAuthorized) {
      throw new Error("Unauthorized to create tasks in this project.");
    }

    // Validate Phase belongs to the same project & workspace
    if (data.phaseId) {
      const phase = await prisma.phase.findFirst({
        where: { id: data.phaseId, projectId: data.projectId, workspaceId: data.workspaceId },
      });
      if (!phase) {
        throw new Error("Invalid Phase: Phase does not belong to the target project or workspace.");
      }
    }

    // Validate Milestone belongs to the same project & workspace
    if (data.milestoneId) {
      const milestone = await prisma.milestone.findFirst({
        where: { id: data.milestoneId, projectId: data.projectId, workspaceId: data.workspaceId },
      });
      if (!milestone) {
        throw new Error("Invalid Milestone: Milestone does not belong to the target project or workspace.");
      }
    }

    // Validate Assignee is in the workspace
    if (data.assigneeId) {
      const assigneeWsMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId: data.workspaceId, userId: data.assigneeId },
      });
      if (!assigneeWsMember) {
        throw new Error("Invalid Assignee: User is not a member of this workspace.");
      }
    }

    // Determine initial order if not provided
    let taskOrder = data.order;
    if (taskOrder === undefined) {
      const lastTask = await prisma.task.findFirst({
        where: { projectId: data.projectId, phaseId: data.phaseId ?? null },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      taskOrder = lastTask ? lastTask.order + 1000 : 1000;
    }

    const initialStatus = data.status ?? TaskStatus.TODO;
    const completedAt = initialStatus === TaskStatus.DONE ? new Date() : null;

    const task = await prisma.task.create({
      data: {
        workspaceId: data.workspaceId,
        projectId: data.projectId,
        phaseId: data.phaseId ?? null,
        milestoneId: data.milestoneId ?? null,
        creatorId: actorUserId,
        assigneeId: data.assigneeId ?? null,
        title: data.title.trim(),
        description: data.description ?? null,
        status: initialStatus,
        priority: data.priority ?? TaskPriority.MEDIUM,
        order: taskOrder,
        startDate: data.startDate ?? null,
        dueDate: data.dueDate ?? null,
        completedAt,
        tags: data.tags ?? [],
        estimatedHours: data.estimatedHours ?? null,
        actualHours: data.actualHours ?? null,
      },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        phase: { select: { id: true, name: true } },
        milestone: { select: { id: true, title: true } },
      },
    });

    // Publish domain events
    await eventBus.publish({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "TASK_CREATED",
      workspaceId: data.workspaceId,
      projectId: data.projectId,
      actorId: actorUserId,
      timestamp: new Date().toISOString(),
      payload: {
        taskId: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        assigneeId: task.assigneeId,
        phaseId: task.phaseId,
        milestoneId: task.milestoneId,
      },
    });

    if (task.assigneeId) {
      await eventBus.publish({
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: "TASK_ASSIGNED",
        workspaceId: data.workspaceId,
        projectId: data.projectId,
        actorId: actorUserId,
        timestamp: new Date().toISOString(),
        payload: {
          taskId: task.id,
          taskTitle: task.title,
          assigneeId: task.assigneeId,
          previousAssigneeId: null,
        },
      });
    }

    return task;
  }

  /**
   * Update task with Task State Machine validation and audit event emissions.
   */
  static async updateTask(actorUserId: string, taskId: string, updates: UpdateTaskDTO) {
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true },
    });

    if (!existingTask) {
      throw new Error("Task not found.");
    }

    const auth = await verifyUserProjectAccess({
      userId: actorUserId,
      projectId: existingTask.projectId,
      workspaceId: existingTask.workspaceId,
      allowedRoles: [ProjectRole.LEAD, ProjectRole.CONTRIBUTOR],
    });

    if (!auth.isAuthorized) {
      throw new Error("Unauthorized to update tasks in this project.");
    }

    // State machine check if status is changing
    let sideEffects: { completedAt: Date | null | undefined } = { completedAt: undefined };
    if (updates.status && updates.status !== existingTask.status) {
      TaskStateMachine.assertValidTransition(existingTask.status, updates.status);
      sideEffects = TaskStateMachine.getTransitionSideEffects(existingTask.status, updates.status);
    }

    // Validate phase if changed
    if (updates.phaseId !== undefined && updates.phaseId !== null) {
      const phase = await prisma.phase.findFirst({
        where: { id: updates.phaseId, projectId: existingTask.projectId, workspaceId: existingTask.workspaceId },
      });
      if (!phase) throw new Error("Invalid Phase: Target phase does not belong to this project.");
    }

    // Validate milestone if changed
    if (updates.milestoneId !== undefined && updates.milestoneId !== null) {
      const milestone = await prisma.milestone.findFirst({
        where: { id: updates.milestoneId, projectId: existingTask.projectId, workspaceId: existingTask.workspaceId },
      });
      if (!milestone) throw new Error("Invalid Milestone: Target milestone does not belong to this project.");
    }

    // Validate assignee if changed
    if (updates.assigneeId !== undefined && updates.assigneeId !== null) {
      const assigneeWsMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId: existingTask.workspaceId, userId: updates.assigneeId },
      });
      if (!assigneeWsMember) throw new Error("Invalid Assignee: User is not a member of this workspace.");
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        title: updates.title !== undefined ? updates.title.trim() : undefined,
        description: updates.description,
        status: updates.status,
        priority: updates.priority,
        phaseId: updates.phaseId,
        milestoneId: updates.milestoneId,
        assigneeId: updates.assigneeId,
        order: updates.order,
        dueDate: updates.dueDate,
        startDate: updates.startDate,
        tags: updates.tags,
        estimatedHours: updates.estimatedHours,
        actualHours: updates.actualHours,
        completedAt: sideEffects.completedAt,
      },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        phase: { select: { id: true, name: true } },
        milestone: { select: { id: true, title: true } },
      },
    });

    // Publish domain events
    await eventBus.publish({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "TASK_UPDATED",
      workspaceId: existingTask.workspaceId,
      projectId: existingTask.projectId,
      actorId: actorUserId,
      timestamp: new Date().toISOString(),
      payload: {
        taskId: updated.id,
        changes: updates,
        previous: {
          status: existingTask.status,
          priority: existingTask.priority,
          assigneeId: existingTask.assigneeId,
        },
      },
    });

    if (updates.status && updates.status !== existingTask.status) {
      await eventBus.publish({
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: "TASK_STATUS_CHANGED",
        workspaceId: existingTask.workspaceId,
        projectId: existingTask.projectId,
        actorId: actorUserId,
        timestamp: new Date().toISOString(),
        payload: {
          taskId: updated.id,
          taskTitle: updated.title,
          previousStatus: existingTask.status,
          newStatus: updates.status,
        },
      });

      if (updates.status === TaskStatus.DONE) {
        await eventBus.publish({
          id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          type: "TASK_COMPLETED",
          workspaceId: existingTask.workspaceId,
          projectId: existingTask.projectId,
          actorId: actorUserId,
          timestamp: new Date().toISOString(),
          payload: {
            taskId: updated.id,
            taskTitle: updated.title,
            completedAt: new Date().toISOString(),
          },
        });
      }
    }

    if (updates.assigneeId !== undefined && updates.assigneeId !== existingTask.assigneeId && updates.assigneeId !== null) {
      await eventBus.publish({
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: "TASK_ASSIGNED",
        workspaceId: existingTask.workspaceId,
        projectId: existingTask.projectId,
        actorId: actorUserId,
        timestamp: new Date().toISOString(),
        payload: {
          taskId: updated.id,
          taskTitle: updated.title,
          assigneeId: updates.assigneeId,
          previousAssigneeId: existingTask.assigneeId,
        },
      });
    }

    return updated;
  }

  /**
   * Delete task and related subtasks/dependencies inside a transaction.
   */
  static async deleteTask(actorUserId: string, taskId: string) {
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!existingTask) {
      throw new Error("Task not found.");
    }

    const auth = await verifyUserProjectAccess({
      userId: actorUserId,
      projectId: existingTask.projectId,
      workspaceId: existingTask.workspaceId,
      allowedRoles: [ProjectRole.LEAD],
    });

    if (!auth.isAuthorized) {
      throw new Error("Unauthorized: Only project LEADs or workspace Admins can delete tasks.");
    }

    const deleted = await prisma.$transaction(async (tx) => {
      await tx.taskDependency.deleteMany({
        where: {
          OR: [{ blockingTaskId: taskId }, { blockedTaskId: taskId }],
        },
      });

      await tx.subtask.deleteMany({ where: { taskId } });
      await tx.taskComment.deleteMany({ where: { taskId } });

      return tx.task.delete({ where: { id: taskId } });
    });

    await eventBus.publish({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "TASK_DELETED",
      workspaceId: existingTask.workspaceId,
      projectId: existingTask.projectId,
      actorId: actorUserId,
      timestamp: new Date().toISOString(),
      payload: {
        taskId,
        taskTitle: existingTask.title,
      },
    });

    return deleted;
  }

  // --- Convenience Mutation Methods ---

  static async assignTask(actorUserId: string, taskId: string, assigneeId: string | null) {
    return this.updateTask(actorUserId, taskId, { assigneeId });
  }

  static async unassignTask(actorUserId: string, taskId: string) {
    return this.updateTask(actorUserId, taskId, { assigneeId: null });
  }

  static async changeStatus(actorUserId: string, taskId: string, status: TaskStatus) {
    return this.updateTask(actorUserId, taskId, { status });
  }

  static async changePriority(actorUserId: string, taskId: string, priority: TaskPriority) {
    return this.updateTask(actorUserId, taskId, { priority });
  }

  static async changeDates(actorUserId: string, taskId: string, dates: { startDate?: Date | null; dueDate?: Date | null }) {
    return this.updateTask(actorUserId, taskId, dates);
  }

  static async moveTask(actorUserId: string, taskId: string, target: { phaseId?: string | null; milestoneId?: string | null; order?: number }) {
    return this.updateTask(actorUserId, taskId, target);
  }

  // --- Batch Operations ---

  /**
   * Batch update status for multiple tasks within a workspace.
   * Runs in a transaction, enforcing authorization and state machine on each.
   */
  static async batchChangeStatus(
    actorUserId: string,
    taskIds: string[],
    newStatus: TaskStatus,
    workspaceId: string
  ) {
    if (taskIds.length === 0) return { updatedCount: 0 };

    const tasks = await prisma.task.findMany({
      where: { id: { in: taskIds }, workspaceId },
      select: { id: true, status: true, projectId: true, title: true },
    });

    if (tasks.length !== taskIds.length) {
      throw new Error("One or more tasks were not found in this workspace.");
    }

    // Verify user authorization for each project represented in batch
    const uniqueProjectIds = Array.from(new Set(tasks.map((t) => t.projectId)));
    for (const projectId of uniqueProjectIds) {
      const auth = await verifyUserProjectAccess({
        userId: actorUserId,
        projectId,
        workspaceId,
        allowedRoles: [ProjectRole.LEAD, ProjectRole.CONTRIBUTOR],
      });
      if (!auth.isAuthorized) {
        throw new Error(`Unauthorized to perform batch updates on project ${projectId}.`);
      }
    }

    // Validate state machine transitions
    for (const t of tasks) {
      TaskStateMachine.assertValidTransition(t.status, newStatus);
    }

    const completedAt = newStatus === TaskStatus.DONE ? new Date() : null;

    const result = await prisma.$transaction(async (tx) => {
      return tx.task.updateMany({
        where: { id: { in: taskIds } },
        data: {
          status: newStatus,
          completedAt: newStatus === TaskStatus.DONE ? completedAt : undefined,
        },
      });
    });

    for (const t of tasks) {
      await eventBus.publish({
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: "TASK_STATUS_CHANGED",
        workspaceId,
        projectId: t.projectId,
        actorId: actorUserId,
        timestamp: new Date().toISOString(),
        payload: {
          taskId: t.id,
          taskTitle: t.title,
          previousStatus: t.status,
          newStatus,
        },
      });
    }

    return { updatedCount: result.count };
  }

  /**
   * Batch assign multiple tasks to a user.
   */
  static async batchAssign(
    actorUserId: string,
    taskIds: string[],
    assigneeId: string | null,
    workspaceId: string
  ) {
    if (taskIds.length === 0) return { updatedCount: 0 };

    if (assigneeId) {
      const assigneeWsMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: assigneeId },
      });
      if (!assigneeWsMember) throw new Error("Assignee is not a member of this workspace.");
    }

    const tasks = await prisma.task.findMany({
      where: { id: { in: taskIds }, workspaceId },
      select: { id: true, projectId: true, title: true, assigneeId: true },
    });

    const uniqueProjectIds = Array.from(new Set(tasks.map((t) => t.projectId)));
    for (const projectId of uniqueProjectIds) {
      const auth = await verifyUserProjectAccess({
        userId: actorUserId,
        projectId,
        workspaceId,
        allowedRoles: [ProjectRole.LEAD, ProjectRole.CONTRIBUTOR],
      });
      if (!auth.isAuthorized) {
        throw new Error(`Unauthorized to assign tasks on project ${projectId}.`);
      }
    }

    const result = await prisma.task.updateMany({
      where: { id: { in: taskIds } },
      data: { assigneeId },
    });

    if (assigneeId) {
      for (const t of tasks) {
        await eventBus.publish({
          id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          type: "TASK_ASSIGNED",
          workspaceId,
          projectId: t.projectId,
          actorId: actorUserId,
          timestamp: new Date().toISOString(),
          payload: {
            taskId: t.id,
            taskTitle: t.title,
            assigneeId,
            previousAssigneeId: t.assigneeId,
          },
        });
      }
    }

    return { updatedCount: result.count };
  }

  /**
   * Batch change priority for multiple tasks.
   */
  static async batchChangePriority(
    actorUserId: string,
    taskIds: string[],
    priority: TaskPriority,
    workspaceId: string
  ) {
    if (taskIds.length === 0) return { updatedCount: 0 };

    const tasks = await prisma.task.findMany({
      where: { id: { in: taskIds }, workspaceId },
      select: { id: true, projectId: true },
    });

    const uniqueProjectIds = Array.from(new Set(tasks.map((t) => t.projectId)));
    for (const projectId of uniqueProjectIds) {
      const auth = await verifyUserProjectAccess({
        userId: actorUserId,
        projectId,
        workspaceId,
        allowedRoles: [ProjectRole.LEAD, ProjectRole.CONTRIBUTOR],
      });
      if (!auth.isAuthorized) {
        throw new Error(`Unauthorized on project ${projectId}.`);
      }
    }

    const result = await prisma.task.updateMany({
      where: { id: { in: taskIds } },
      data: { priority },
    });

    return { updatedCount: result.count };
  }

  // --- Subtasks System ---

  static async createSubtask(actorUserId: string, taskId: string, title: string, order = 0) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true, workspaceId: true },
    });
    if (!task) throw new Error("Parent task not found.");

    const auth = await verifyUserProjectAccess({
      userId: actorUserId,
      projectId: task.projectId,
      workspaceId: task.workspaceId,
      allowedRoles: [ProjectRole.LEAD, ProjectRole.CONTRIBUTOR],
    });
    if (!auth.isAuthorized) throw new Error("Unauthorized to add subtasks.");

    return prisma.subtask.create({
      data: {
        taskId,
        title: title.trim(),
        completed: false,
        order,
      },
    });
  }

  static async updateSubtask(
    actorUserId: string,
    subtaskId: string,
    updates: { title?: string; completed?: boolean; order?: number }
  ) {
    const subtask = await prisma.subtask.findUnique({
      where: { id: subtaskId },
      include: { task: { select: { projectId: true, workspaceId: true } } },
    });
    if (!subtask) throw new Error("Subtask not found.");

    const auth = await verifyUserProjectAccess({
      userId: actorUserId,
      projectId: subtask.task.projectId,
      workspaceId: subtask.task.workspaceId,
      allowedRoles: [ProjectRole.LEAD, ProjectRole.CONTRIBUTOR],
    });
    if (!auth.isAuthorized) throw new Error("Unauthorized to edit subtask.");

    const completedAt = updates.completed === true ? new Date() : updates.completed === false ? null : undefined;

    return prisma.subtask.update({
      where: { id: subtaskId },
      data: {
        title: updates.title !== undefined ? updates.title.trim() : undefined,
        completed: updates.completed,
        order: updates.order,
        completedAt,
      },
    });
  }

  static async completeSubtask(actorUserId: string, subtaskId: string, completed: boolean) {
    return this.updateSubtask(actorUserId, subtaskId, { completed });
  }

  static async deleteSubtask(actorUserId: string, subtaskId: string) {
    const subtask = await prisma.subtask.findUnique({
      where: { id: subtaskId },
      include: { task: { select: { projectId: true, workspaceId: true } } },
    });
    if (!subtask) throw new Error("Subtask not found.");

    const auth = await verifyUserProjectAccess({
      userId: actorUserId,
      projectId: subtask.task.projectId,
      workspaceId: subtask.task.workspaceId,
      allowedRoles: [ProjectRole.LEAD, ProjectRole.CONTRIBUTOR],
    });
    if (!auth.isAuthorized) throw new Error("Unauthorized to delete subtask.");

    return prisma.subtask.delete({ where: { id: subtaskId } });
  }

  static async getSubtasksForTask(taskId: string) {
    const subtasks = await prisma.subtask.findMany({
      where: { taskId },
      orderBy: { order: "asc" },
    });

    const total = subtasks.length;
    const completed = subtasks.filter((s) => s.completed).length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      subtasks,
      summary: { total, completed, percentage },
    };
  }

  // --- Task Comments ---

  static async addComment(actorUserId: string, taskId: string, content: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, title: true, projectId: true, workspaceId: true },
    });
    if (!task) throw new Error("Task not found.");

    const auth = await verifyUserProjectAccess({
      userId: actorUserId,
      projectId: task.projectId,
      workspaceId: task.workspaceId,
      allowedRoles: [ProjectRole.LEAD, ProjectRole.CONTRIBUTOR, ProjectRole.VIEWER],
    });
    if (!auth.isAuthorized) throw new Error("Unauthorized to comment on this task.");

    const comment = await prisma.taskComment.create({
      data: {
        taskId,
        authorId: actorUserId,
        content: content.trim(),
      },
    });

    await eventBus.publish({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "COMMENT_CREATED",
      workspaceId: task.workspaceId,
      projectId: task.projectId,
      actorId: actorUserId,
      timestamp: new Date().toISOString(),
      payload: {
        commentId: comment.id,
        taskId: task.id,
        taskTitle: task.title,
        authorId: actorUserId,
        content: comment.content,
      },
    });

    return comment;
  }

  static async deleteComment(actorUserId: string, commentId: string) {
    const comment = await prisma.taskComment.findUnique({
      where: { id: commentId },
      include: { task: { select: { projectId: true, workspaceId: true } } },
    });
    if (!comment) throw new Error("Comment not found.");

    // Author or Project Lead can delete
    if (comment.authorId !== actorUserId) {
      const auth = await verifyUserProjectAccess({
        userId: actorUserId,
        projectId: comment.task.projectId,
        workspaceId: comment.task.workspaceId,
        allowedRoles: [ProjectRole.LEAD],
      });
      if (!auth.isAuthorized) throw new Error("Unauthorized to delete this comment.");
    }

    return prisma.taskComment.delete({ where: { id: commentId } });
  }

  // --- Dependency Delegations ---
  static async createDependency(actorUserId: string, blockingTaskId: string, blockedTaskId: string) {
    const blocking = await prisma.task.findUnique({ where: { id: blockingTaskId }, select: { workspaceId: true } });
    if (!blocking) throw new Error("Blocking task not found.");
    return DependencyService.addDependency({
      actorUserId,
      blockingTaskId,
      blockedTaskId,
      workspaceId: blocking.workspaceId,
    });
  }

  static async removeDependency(actorUserId: string, dependencyId: string) {
    const dep = await prisma.taskDependency.findUnique({
      where: { id: dependencyId },
      include: { blockedTask: { select: { workspaceId: true } } },
    });
    if (!dep) throw new Error("Dependency not found.");
    return DependencyService.removeDependency(actorUserId, dependencyId, dep.blockedTask.workspaceId);
  }
}

export const TaskService = TaskDomainService;
