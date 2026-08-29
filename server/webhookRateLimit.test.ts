import { beforeEach, describe, expect, it } from "vitest";
import { checkWebhookRateLimit, clearWebhookRateLimitForTest, WEBHOOK_RATE_LIMIT } from "./webhookRateLimit";

describe("webhook rate limit", () => {
  beforeEach(clearWebhookRateLimitForTest);
  it("allows expected requests, rejects an abusive burst, and resets after the fixed window", () => {
    const started = 1_000_000;
    for (let index = 0; index < WEBHOOK_RATE_LIMIT.maxRequests; index += 1) expect(checkWebhookRateLimit("198.51.100.20", started).allowed).toBe(true);
    const rejected = checkWebhookRateLimit("198.51.100.20", started);
    expect(rejected).toMatchObject({ allowed: false, remaining: 0 });
    expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
    expect(checkWebhookRateLimit("198.51.100.20", started + WEBHOOK_RATE_LIMIT.windowMs).allowed).toBe(true);
    expect(checkWebhookRateLimit("203.0.113.10", started).allowed).toBe(true);
  });
});
