import { beforeEach, describe, expect, it } from "vitest";
import { checkCustomerRateLimit, resetCustomerRateLimitsForTest } from "./customerRateLimit";

describe("authenticated buyer-facing rate limit", () => {
  beforeEach(() => resetCustomerRateLimitsForTest());

  it("limits catalog redemption per authenticated buyer while leaving another buyer independent", () => {
    const now = 1000;
    for (let request = 0; request < 30; request += 1) expect(checkCustomerRateLimit({ buyerOpenId: "buyer-a", action: "catalog_redemption", now }).allowed).toBe(true);
    expect(checkCustomerRateLimit({ buyerOpenId: "buyer-a", action: "catalog_redemption", now })).toEqual(expect.objectContaining({ allowed: false, retryAfterSeconds: 60, scope: "process_local_authenticated_buyer" }));
    expect(checkCustomerRateLimit({ buyerOpenId: "buyer-b", action: "catalog_redemption", now }).allowed).toBe(true);
  });

  it("keeps mutation budgets separate and restores them after the fixed window", () => {
    const now = 1000;
    for (let request = 0; request < 12; request += 1) expect(checkCustomerRateLimit({ buyerOpenId: "buyer-a", action: "case_creation", now }).allowed).toBe(true);
    expect(checkCustomerRateLimit({ buyerOpenId: "buyer-a", action: "case_creation", now }).allowed).toBe(false);
    expect(checkCustomerRateLimit({ buyerOpenId: "buyer-a", action: "document_upload", now }).allowed).toBe(true);
    expect(checkCustomerRateLimit({ buyerOpenId: "buyer-a", action: "case_creation", now: now + 60_000 })).toEqual(expect.objectContaining({ allowed: true, remaining: 11 }));
  });
});
