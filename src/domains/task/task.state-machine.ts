import { TaskStatus } from "@prisma/client";

/**
 * Explicit Task Status Transition Rules for Synplan 2.0 Work Engine.
 *
 * Enforces legitimate lifecycle paths across UI, API, AI, and Automations.
 * Prevents illogical status leaps (e.g. BACKLOG directly to DONE without review).
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.BACKLOG]: [
    TaskStatus.TODO,
    TaskStatus.IN_PROGRESS,
    TaskStatus.CANCELED,
  ],
  [TaskStatus.TODO]: [
    TaskStatus.IN_PROGRESS,
    TaskStatus.BACKLOG,
    TaskStatus.BLOCKED,
    TaskStatus.CANCELED,
  ],
  [TaskStatus.IN_PROGRESS]: [
    TaskStatus.IN_REVIEW,
    TaskStatus.DONE,
    TaskStatus.BLOCKED,
    TaskStatus.TODO,
    TaskStatus.CANCELED,
  ],
  [TaskStatus.IN_REVIEW]: [
    TaskStatus.DONE,
    TaskStatus.IN_PROGRESS,
    TaskStatus.BLOCKED,
    TaskStatus.CANCELED,
  ],
  [TaskStatus.BLOCKED]: [
    TaskStatus.IN_PROGRESS,
    TaskStatus.TODO,
    TaskStatus.CANCELED,
  ],
  [TaskStatus.DONE]: [
    TaskStatus.IN_PROGRESS, // Reopen for revision
    TaskStatus.TODO,        // Reopen to queue
  ],
  [TaskStatus.CANCELED]: [
    TaskStatus.BACKLOG,     // Re-activate into backlog
    TaskStatus.TODO,        // Re-activate into todo
  ],
};

export class TaskStateMachine {
  /**
   * Checks if a transition from one status to another is permitted.
   */
  static canTransition(from: TaskStatus, to: TaskStatus): boolean {
    if (from === to) return true; // No-op transition is always valid
    const allowed = ALLOWED_STATUS_TRANSITIONS[from];
    return Array.isArray(allowed) && allowed.includes(to);
  }

  /**
   * Asserts that a transition is valid; throws descriptive Error if forbidden.
   */
  static assertValidTransition(from: TaskStatus, to: TaskStatus): void {
    if (!this.canTransition(from, to)) {
      const allowed = ALLOWED_STATUS_TRANSITIONS[from] || [];
      throw new Error(
        `Invalid task status transition: Cannot transition from '${from}' to '${to}'. Allowed target statuses: [${allowed.join(
          ", "
        )}]`
      );
    }
  }

  /**
   * Returns all statuses that the task can legally transition to.
   */
  static getAllowedTransitions(currentStatus: TaskStatus): TaskStatus[] {
    return ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
  }

  /**
   * Determines if the transition marks completion or reopening.
   */
  static getTransitionSideEffects(from: TaskStatus, to: TaskStatus): {
    completedAt: Date | null | undefined;
  } {
    if (to === TaskStatus.DONE && from !== TaskStatus.DONE) {
      return { completedAt: new Date() };
    }
    if (from === TaskStatus.DONE && to !== TaskStatus.DONE) {
      return { completedAt: null };
    }
    return { completedAt: undefined };
  }
}
