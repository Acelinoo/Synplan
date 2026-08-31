import { NextRequest, NextResponse } from "next/server";

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetTime: number; // Unix timestamp in seconds
  retryAfter: number; // Seconds until retry
}

interface WindowRecord {
  timestamps: number[];
}

export class SlidingWindowRateLimiter {
  private windowMs: number;
  private maxRequests: number;
  private storage: Map<string, WindowRecord> = new Map();
  private lastCleanup: number = Date.now();
  private cleanupIntervalMs: number = 60000; // Cleanup every 1 minute

  constructor(options: { windowMs: number; maxRequests: number }) {
    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
  }

  /**
   * Evaluates if a request identified by `key` is within the rate limit.
   */
  public check(key: string): RateLimitResult {
    const now = Date.now();
    this.periodicCleanup(now);

    const windowStart = now - this.windowMs;
    let record = this.storage.get(key);

    if (!record) {
      record = { timestamps: [] };
      this.storage.set(key, record);
    }

    // Filter out timestamps outside the active sliding window
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

    const currentCount = record.timestamps.length;
    const limit = this.maxRequests;
    const resetTime = Math.ceil((now + this.windowMs) / 1000);

    if (currentCount >= limit) {
      // Calculate earliest timestamp in window that will expire
      const oldestTimestamp = record.timestamps[0] || now;
      const retryAfter = Math.max(1, Math.ceil((oldestTimestamp + this.windowMs - now) / 1000));

      return {
        success: false,
        limit,
        remaining: 0,
        resetTime,
        retryAfter,
      };
    }

    // Record this request
    record.timestamps.push(now);
    const remaining = limit - record.timestamps.length;

    return {
      success: true,
      limit,
      remaining,
      resetTime,
      retryAfter: 0,
    };
  }

  /**
   * Periodically prunes expired keys to prevent memory growth.
   */
  private periodicCleanup(now: number) {
    if (now - this.lastCleanup < this.cleanupIntervalMs) {
      return;
    }
    this.lastCleanup = now;
    const windowStart = now - this.windowMs;

    for (const [key, record] of this.storage.entries()) {
      record.timestamps = record.timestamps.filter((ts) => ts > windowStart);
      if (record.timestamps.length === 0) {
        this.storage.delete(key);
      }
    }
  }

  /**
   * Resets rate limit for a key (useful for tests and manual administrative actions).
   */
  public reset(key: string) {
    this.storage.delete(key);
  }

  /**
   * Clears all storage (useful for test resets).
   */
  public clear() {
    this.storage.clear();
  }
}

/**
 * Standard Production Rate Limit Tiers:
 * 1. AI Rate Limiter: 20 requests per 60 seconds (Heavy LLM & planning operations)
 * 2. Auth Rate Limiter: 15 requests per 60 seconds (Brute force & OAuth abuse prevention)
 * 3. General API Rate Limiter: 120 requests per 60 seconds (Standard mutations & queries)
 */
export const aiRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
});

export const authRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 15,
});

export const apiRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 120,
});

/**
 * Extracts a client IP from NextRequest with standard proxy header support.
 */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return cfConnectingIp.trim();
  }
  return "127.0.0.1";
}

/**
 * Helper to apply rate limiting to a Route Handler.
 * Returns null if allowed, or a pre-formatted 429 NextResponse if rate limit is exceeded.
 */
export function applyRateLimit(
  req: NextRequest,
  limiter: SlidingWindowRateLimiter,
  customIdentifier?: string
): { errorResponse?: NextResponse; rateLimitHeaders: Record<string, string> } {
  // In automated test environments, allow test bypass if explicitly set
  if (process.env.NODE_ENV === "test" && process.env.DISABLE_RATE_LIMIT === "true") {
    return {
      rateLimitHeaders: {
        "X-RateLimit-Limit": "unlimited",
        "X-RateLimit-Remaining": "unlimited",
      },
    };
  }

  const identifier = customIdentifier || getClientIp(req);
  const result = limiter.check(identifier);

  const rateLimitHeaders: Record<string, string> = {
    "X-RateLimit-Limit": result.limit.toString(),
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": result.resetTime.toString(),
  };

  if (!result.success) {
    rateLimitHeaders["Retry-After"] = result.retryAfter.toString();
    const errorResponse = NextResponse.json(
      {
        success: false,
        error: "Too Many Requests",
        message: `Rate limit exceeded. Please try again in ${result.retryAfter} seconds.`,
      },
      {
        status: 429,
        headers: rateLimitHeaders,
      }
    );
    return { errorResponse, rateLimitHeaders };
  }

  return { rateLimitHeaders };
}
