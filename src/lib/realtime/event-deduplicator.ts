/**
 * Client-Side Realtime Event Deduplicator
 *
 * Enforces bounded LRU cache for deduplicating delivered realtime events.
 * Prevents memory leaks by maintaining a strict maximum size and time-to-live.
 */
export class EventDeduplicator {
  private processedIds: Map<string, number> = new Map();
  private readonly maxCapacity: number;
  private readonly ttlMs: number;

  constructor(maxCapacity = 500, ttlMs = 60_000) {
    this.maxCapacity = maxCapacity;
    this.ttlMs = ttlMs;
  }

  /**
   * Checks if an event has already been processed recently.
   * If not duplicate, records the event ID in cache.
   */
  isDuplicate(eventId: string): boolean {
    if (!eventId) return false;
    const now = Date.now();

    if (this.processedIds.has(eventId)) {
      const recordedAt = this.processedIds.get(eventId)!;
      if (now - recordedAt <= this.ttlMs) {
        return true;
      }
      this.processedIds.delete(eventId);
    }

    this.processedIds.set(eventId, now);

    // Evict oldest entries if capacity is exceeded
    if (this.processedIds.size > this.maxCapacity) {
      for (const [id, timestamp] of this.processedIds.entries()) {
        if (now - timestamp > this.ttlMs || this.processedIds.size > this.maxCapacity) {
          this.processedIds.delete(id);
        }
      }
    }

    return false;
  }

  /**
   * Resets deduplication cache.
   */
  clear(): void {
    this.processedIds.clear();
  }

  get size(): number {
    return this.processedIds.size;
  }
}

export const globalEventDeduplicator = new EventDeduplicator();
