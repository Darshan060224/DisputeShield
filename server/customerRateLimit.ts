export type CustomerRateLimitAction = "catalog_redemption" | "case_creation" | "document_upload";

type LimitRule = { maxRequests: number; windowMs: number };
type WindowState = { count: number; resetAt: number };

const LIMITS: Record<CustomerRateLimitAction, LimitRule> = {
  catalog_redemption: { maxRequests: 30, windowMs: 60_000 },
  case_creation: { maxRequests: 12, windowMs: 60_000 },
  document_upload: { maxRequests: 12, windowMs: 60_000 },
};
const windows = new Map<string, WindowState>();

export function checkCustomerRateLimit(input: { buyerOpenId: string; action: CustomerRateLimitAction; now?: number }) {
  const now = input.now ?? Date.now();
  const rule = LIMITS[input.action];
  const key = `${input.action}:${input.buyerOpenId}`;
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true as const, remaining: rule.maxRequests - 1, retryAfterSeconds: 0, scope: "process_local_authenticated_buyer" as const };
  }
  if (current.count >= rule.maxRequests) return { allowed: false as const, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)), scope: "process_local_authenticated_buyer" as const };
  current.count += 1;
  return { allowed: true as const, remaining: rule.maxRequests - current.count, retryAfterSeconds: 0, scope: "process_local_authenticated_buyer" as const };
}

export function resetCustomerRateLimitsForTest() { windows.clear(); }
