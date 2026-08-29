import { describe, expect, it } from "vitest";
import { shouldLockTestCardRetries, testCardRetryLockMessage } from "../client/src/lib/testCardRetryGuard";

describe("test-card retry guard", () => {
  it("locks card retries after an international-card rejection", () => {
    const failure = { error: { reason: "international_transaction_not_allowed" } };
    expect(shouldLockTestCardRetries(failure)).toBe(true);
    expect(testCardRetryLockMessage(failure)).toContain("Netbanking");
  });

  it("locks card retries after failed OTP verification but leaves other errors unblocked", () => {
    expect(shouldLockTestCardRetries({ error: { reason: "otp_verification_failed" } })).toBe(true);
    expect(shouldLockTestCardRetries({ error: { reason: "network_error" } })).toBe(false);
  });
});
