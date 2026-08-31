import { NextRequest, NextResponse } from "next/server";

export interface IdempotencyEntry {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
  timestamp: number;
}

const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 1000;

class IdempotencyManager {
  private cache = new Map<string, IdempotencyEntry>();
  private inFlight = new Set<string>();

  /**
   * Generates a composite cache key scoped to user and workspace to prevent cross-tenant collision.
   */
  private getCompositeKey(key: string, workspaceId?: string, userId?: string): string {
    return `${workspaceId || "global"}:${userId || "anon"}:${key.trim()}`;
  }

  /**
   * Extracts idempotency key from request headers or query.
   */
  extractKey(req: NextRequest): string | null {
    const key =
      req.headers.get("idempotency-key") ||
      req.headers.get("x-idempotency-key") ||
      new URL(req.url).searchParams.get("idempotencyKey");
    return key && key.trim().length > 0 ? key.trim() : null;
  }

  /**
   * Checks if an idempotency key is cached or currently being processed.
   */
  check(key: string, workspaceId?: string, userId?: string): {
    cachedResponse: NextResponse | null;
    isInFlight: boolean;
  } {
    const compositeKey = this.getCompositeKey(key, workspaceId, userId);

    // Prune stale entries if cache is growing
    if (this.cache.size > MAX_CACHE_SIZE) {
      const now = Date.now();
      for (const [k, v] of this.cache.entries()) {
        if (now - v.timestamp > IDEMPOTENCY_TTL_MS) {
          this.cache.delete(k);
        }
      }
    }

    const cached = this.cache.get(compositeKey);
    if (cached) {
      if (Date.now() - cached.timestamp <= IDEMPOTENCY_TTL_MS) {
        const response = NextResponse.json(cached.body, {
          status: cached.status,
          headers: {
            "x-idempotency-cache": "HIT",
            ...(cached.headers || {}),
          },
        });
        return { cachedResponse: response, isInFlight: false };
      } else {
        this.cache.delete(compositeKey);
      }
    }

    const isInFlight = this.inFlight.has(compositeKey);
    return { cachedResponse: null, isInFlight };
  }

  /**
   * Marks a key as in-flight during mutation execution.
   */
  start(key: string, workspaceId?: string, userId?: string): void {
    const compositeKey = this.getCompositeKey(key, workspaceId, userId);
    this.inFlight.add(compositeKey);
  }

  /**
   * Records the final response in cache and removes in-flight lock.
   */
  save(
    key: string,
    status: number,
    body: unknown,
    workspaceId?: string,
    userId?: string,
    headers?: Record<string, string>
  ): void {
    const compositeKey = this.getCompositeKey(key, workspaceId, userId);
    this.inFlight.delete(compositeKey);

    // Only cache successful or intentional client results (status < 500)
    if (status < 500) {
      this.cache.set(compositeKey, {
        status,
        body,
        headers,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Releases an in-flight key without caching (e.g. on server error).
   */
  release(key: string, workspaceId?: string, userId?: string): void {
    const compositeKey = this.getCompositeKey(key, workspaceId, userId);
    this.inFlight.delete(compositeKey);
  }

  /**
   * Clears entire cache (used during automated tests).
   */
  clear(): void {
    this.cache.clear();
    this.inFlight.clear();
  }
}

export const idempotency = new IdempotencyManager();
