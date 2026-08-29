type WindowEntry = { startedAt: number; count: number };

const entries = new Map<string, WindowEntry>();
export const WEBHOOK_RATE_LIMIT = { windowMs: 60_000, maxRequests: 120 } as const;

export function checkWebhookRateLimit(sourceIp: string, now = Date.now()) {
  const key = sourceIp || "unknown";
  const current = entries.get(key);
  if (!current || now - current.startedAt >= WEBHOOK_RATE_LIMIT.windowMs) {
    entries.set(key, { startedAt: now, count: 1 });
    return { allowed: true, remaining: WEBHOOK_RATE_LIMIT.maxRequests - 1, retryAfterSeconds: 0 };
  }
  if (current.count >= WEBHOOK_RATE_LIMIT.maxRequests) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((WEBHOOK_RATE_LIMIT.windowMs - (now - current.startedAt)) / 1_000)) };
  }
  current.count += 1;
  return { allowed: true, remaining: WEBHOOK_RATE_LIMIT.maxRequests - current.count, retryAfterSeconds: 0 };
}

export function clearWebhookRateLimitForTest() { entries.clear(); }
