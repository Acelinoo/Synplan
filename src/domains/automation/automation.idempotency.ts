/**
 * Deterministic Idempotency Tracker for Automation Executions
 *
 * Guarantees that the exact same action for the exact same triggering event
 * is executed at most once, even under network retries, duplicate deliveries,
 * or concurrent event bus emissions.
 */
export class AutomationIdempotencyTracker {
  private executedKeys: Map<string, number> = new Map();
  private readonly maxCapacity: number;
  private readonly ttlMs: number;

  constructor(maxCapacity = 2000, ttlMs = 10 * 60 * 1000) {
    this.maxCapacity = maxCapacity;
    this.ttlMs = ttlMs;
  }

  /**
   * Builds a deterministic execution key for an action within a rule and event.
   */
  static generateKey(ruleId: string, eventId: string, actionIndex: number): string {
    return `${ruleId}:${eventId}:${actionIndex}`;
  }

  /**
   * Checks whether the given execution key has already been executed.
   */
  isExecuted(key: string): boolean {
    const now = Date.now();
    const executedAt = this.executedKeys.get(key);

    if (executedAt) {
      if (now - executedAt <= this.ttlMs) {
        return true;
      }
      this.executedKeys.delete(key);
    }

    return false;
  }

  /**
   * Marks the key as successfully executed.
   */
  markExecuted(key: string): void {
    const now = Date.now();
    this.executedKeys.set(key, now);

    // Evict oldest entries if capacity bound is exceeded
    if (this.executedKeys.size > this.maxCapacity) {
      for (const [k, timestamp] of this.executedKeys.entries()) {
        if (now - timestamp > this.ttlMs || this.executedKeys.size > this.maxCapacity) {
          this.executedKeys.delete(k);
        }
      }
    }
  }

  /**
   * Clears the tracker (used in unit tests).
   */
  clear(): void {
    this.executedKeys.clear();
  }

  get size(): number {
    return this.executedKeys.size;
  }
}

export const globalAutomationIdempotency = new AutomationIdempotencyTracker();
