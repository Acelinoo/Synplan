import { AiExecutionResult } from "./types";

interface IdempotentEntry {
  planId: string;
  result: AiExecutionResult;
  timestamp: number;
}

// In-memory idempotency cache (TTL: 1 hour)
const executionCache = new Map<string, IdempotentEntry>();
const IDEMPOTENCY_TTL_MS = 60 * 60 * 1000;

export function getIdempotencyResult(key: string): AiExecutionResult | null {
  const entry = executionCache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > IDEMPOTENCY_TTL_MS) {
    executionCache.delete(key);
    return null;
  }

  return entry.result;
}

export function setIdempotencyResult(key: string, planId: string, result: AiExecutionResult): void {
  executionCache.set(key, {
    planId,
    result,
    timestamp: Date.now(),
  });
}
