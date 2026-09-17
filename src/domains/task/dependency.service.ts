import { prisma } from "@/lib/prisma";
import { ProjectRole, TaskStatus } from "@prisma/client";
import { verifyUserProjectAccess } from "../identity/guards";
import { eventBus } from "../events/event-bus";

export interface AddDependencyDTO {
  actorUserId: string;
  blockingTaskId: string;
  blockedTaskId: string;
  workspaceId: string;
}

export class DependencyService {
  /**
   * Detects whether adding an edge (blockingTaskId -> blockedTaskId) creates a cycle in the DAG.
   * A cycle is created if there is already an existing path from blockedTaskId to blockingTaskId.
   */
  static async wouldCreateCycle(blockingTaskId: string, blockedTaskId: string): Promise<boolean> {
    // If blockedTaskId can reach blockingTaskId via existing dependencies, adding blockingTaskId -> blockedTaskId forms a cycle
    const visited = new Set<string>();
    const queue: string[] = [blockedTaskId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === blockingTaskId) {
        return true;
      }

      if (visited.has(current)) continue;
      visited.add(current);

      // Find all tasks that 'current' is blocking (i.e. where blockingTaskId == current)
      const outgoingEdges = await prisma.taskDependency.findMany({
        where: { blockingTaskId: current },
        select: { blockedTaskId: true },
      });

      for (const edge of outgoingEdges) {
        if (!visited.has(edge.blockedTaskId)) {
          queue.push(edge.blockedTaskId);
        }
      }
    }

    return false;
  }

  /**
   * Adds a dependency: Task A (blocking) blocks Task B (blocked).
   * Validates:
   * 1. No self-dependency
   * 2. Both tasks exist in the same workspace & project
   * 3. No duplicate dependency
   * 4. No circular dependency
   * 5. User has project mutation authorization
   */
  static async addDependency(data: AddDependencyDTO) {
    const { actorUserId, blockingTaskId, blockedTaskId, workspaceId } = data;

    // 1. Self-dependency check
    if (blockingTaskId === blockedTaskId) {
      throw new Error("Self-dependency forbidden: A task cannot block or depend on itself.");
    }

    // 2. Fetch both tasks
    const [blockingTask, blockedTask] = await Promise.all([
      prisma.task.findUnique({
        where: { id: blockingTaskId },
        select: { id: true, title: true, projectId: true, workspaceId: true },
      }),
      prisma.task.findUnique({
        where: { id: blockedTaskId },
        select: { id: true, title: true, projectId: true, workspaceId: true },
      }),
    ]);

    if (!blockingTask || !blockedTask) {
      throw new Error("One or both tasks for dependency were not found.");
    }

    // Workspace & Project isolation
    if (blockingTask.workspaceId !== workspaceId || blockedTask.workspaceId !== workspaceId) {
      throw new Error("Cross-workspace dependencies are strictly prohibited.");
    }

    if (blockingTask.projectId !== blockedTask.projectId) {
      throw new Error("Cross-project dependencies are prohibited. Tasks must share the same project context.");
    }

    // 3. Authorize actor on the project
    const auth = await verifyUserProjectAccess({
      userId: actorUserId,
      projectId: blockedTask.projectId,
      workspaceId,
      allowedRoles: [ProjectRole.LEAD, ProjectRole.CONTRIBUTOR],
    });

    if (!auth.isAuthorized) {
      throw new Error("Unauthorized to manage task dependencies in this project.");
    }

    // 4. Check for duplicate dependency
    const existing = await prisma.taskDependency.findUnique({
      where: {
        blockingTaskId_blockedTaskId: {
          blockingTaskId,
          blockedTaskId,
        },
      },
    });

    if (existing) {
      throw new Error("Duplicate dependency: This dependency relationship already exists.");
    }

    // 5. Check for circular dependency
    const isCycle = await this.wouldCreateCycle(blockingTaskId, blockedTaskId);
    if (isCycle) {
      throw new Error(
        `Circular dependency detected: Cannot make task "${blockingTask.title}" block "${blockedTask.title}" as it would introduce a dependency cycle.`
      );
    }

    // 6. Create dependency
    const dependency = await prisma.taskDependency.create({
      data: {
        blockingTaskId,
        blockedTaskId,
      },
      include: {
        blockingTask: { select: { id: true, title: true, status: true } },
        blockedTask: { select: { id: true, title: true, status: true } },
      },
    });

    // 7. Publish domain event
    await eventBus.publish({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "TASK_DEPENDENCY_CREATED",
      workspaceId,
      projectId: blockedTask.projectId,
      actorId: actorUserId,
      timestamp: new Date().toISOString(),
      payload: {
        dependencyId: dependency.id,
        blockingTaskId,
        blockedTaskId,
      },
    });

    return dependency;
  }

  /**
   * Removes an existing dependency.
   */
  static async removeDependency(actorUserId: string, dependencyId: string, workspaceId: string) {
    const dependency = await prisma.taskDependency.findUnique({
      where: { id: dependencyId },
      include: {
        blockedTask: { select: { projectId: true, workspaceId: true } },
      },
    });

    if (!dependency) {
      throw new Error("Dependency relationship not found.");
    }

    if (dependency.blockedTask.workspaceId !== workspaceId) {
      throw new Error("Cross-workspace access denied.");
    }

    const auth = await verifyUserProjectAccess({
      userId: actorUserId,
      projectId: dependency.blockedTask.projectId,
      workspaceId,
      allowedRoles: [ProjectRole.LEAD, ProjectRole.CONTRIBUTOR],
    });

    if (!auth.isAuthorized) {
      throw new Error("Unauthorized to remove task dependencies in this project.");
    }

    const deleted = await prisma.taskDependency.delete({
      where: { id: dependencyId },
    });

    await eventBus.publish({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "TASK_DEPENDENCY_REMOVED",
      workspaceId,
      projectId: dependency.blockedTask.projectId,
      actorId: actorUserId,
      timestamp: new Date().toISOString(),
      payload: {
        dependencyId,
        blockingTaskId: dependency.blockingTaskId,
        blockedTaskId: dependency.blockedTaskId,
      },
    });

    return deleted;
  }

  /**
   * Retrieves all dependencies for a task (both blocking and blockedBy).
   */
  static async getTaskDependencies(taskId: string) {
    const [blockedBy, blocking] = await Promise.all([
      prisma.taskDependency.findMany({
        where: { blockedTaskId: taskId },
        include: {
          blockingTask: {
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
              assignee: { select: { id: true, name: true, avatarUrl: true } },
            },
          },
        },
      }),
      prisma.taskDependency.findMany({
        where: { blockingTaskId: taskId },
        include: {
          blockedTask: {
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
              assignee: { select: { id: true, name: true, avatarUrl: true } },
            },
          },
        },
      }),
    ]);

    const isBlocked = blockedBy.some((dep) => dep.blockingTask.status !== TaskStatus.DONE);

    return {
      taskId,
      isBlocked,
      blockedBy: blockedBy.map((d) => ({
        dependencyId: d.id,
        task: d.blockingTask,
        isResolved: d.blockingTask.status === TaskStatus.DONE,
      })),
      blocking: blocking.map((d) => ({
        dependencyId: d.id,
        task: d.blockedTask,
      })),
    };
  }
}
