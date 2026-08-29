import { describe, expect, it, vi } from "vitest";

vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "test-secret");

import crypto from "node:crypto";
import { verifyRazorpaySignature } from "./razorpay";
import { buildVerifiedDraft, validateDisputeCase } from "./disputeEngine";
import { reconcileCaseReference } from "./webhookReconciliation";

describe("DisputeShield Razorpay safety layer", () => {
  it("accepts a valid webhook signature", () => {
    const payload = JSON.stringify({ id: "evt_1", event: "payment.captured" });
    const signature = crypto.createHmac("sha256", "test-secret").update(payload).digest("hex");
    expect(verifyRazorpaySignature(payload, signature)).toBe(true);
  });

  it("rejects a modified webhook payload", () => {
    const original = JSON.stringify({ id: "evt_1", event: "payment.captured" });
    const signature = crypto.createHmac("sha256", "test-secret").update(original).digest("hex");
    expect(verifyRazorpaySignature(JSON.stringify({ id: "evt_1", event: "refund.created" }), signature)).toBe(false);
  });

  it("blocks incomplete evidence and computes a missing-evidence list", () => {
    const result = validateDisputeCase({ amount: 6800, status: "blocked", recommendation: "contest", confidence: 48, claims: [{ kind: "Payment", source: "pay_1", claim: "Payment captured", verified: true }] });
    expect(result.policyBlocked).toBe(true);
    expect(result.missingEvidence).toContain("Delivery proof");
    expect(result.recommendation).toBe("human_review");
  });

  it("recommends contest when payment, delivery proof, and address evidence agree", () => {
    const result = validateDisputeCase({ amount: 2499, status: "review", recommendation: "contest", confidence: 92, claims: [
      { kind: "Payment", source: "pay_1", claim: "Payment captured", verified: true },
      { kind: "Delivery proof", source: "ship_1", claim: "Delivered with OTP", verified: true },
      { kind: "Address match", source: "order_1", claim: "Address matches", verified: true },
    ] });
    expect(result.policyBlocked).toBe(false);
    expect(result.recommendation).toBe("contest");
  });

  it("creates a draft only from verified claims with citations", () => {
    const result = buildVerifiedDraft("ORD-1", 100, [{ kind: "Payment", source: "pay_1", claim: "Payment captured", verified: true }, { kind: "Delivery proof", source: "ship_1", claim: "Delivered with OTP", verified: false }]);
    expect(result.text).toContain("Payment captured");
    expect(result.text).not.toContain("Delivered with OTP");
    expect(result.citations).toContain("[pay_1]");
    expect(result.unsupportedClaimRate).toBe(0);
  });

  it("rejects signatures with a different length before comparison", () => {
    expect(verifyRazorpaySignature("{}", "too-short")).toBe(false);
  });

  it("requires a valid signature before an event can be considered for persistence", () => {
    const payload = JSON.stringify({ event: "payment.captured" });
    expect(verifyRazorpaySignature(payload, "invalid-signature")).toBe(false);
  });

  it("reconciles verified payment, QR, refund, and dispute events through a DisputeShield case note", () => {
    const cases = [
      ["payment.captured", { payload: { payment: { entity: { notes: { disputeShieldCaseId: "DSP-1048" } } } } }, "payment"],
      ["qr_code.credited", { payload: { qr_code: { entity: { notes: { disputeShieldCaseId: "DSP-1048" } } } } }, "qr"],
      ["refund.processed", { payload: { refund: { entity: { notes: { disputeShieldCaseId: "DSP-1048" } } } } }, "refund"],
      ["payment.dispute.created", { payload: { dispute: { entity: { notes: { disputeShieldCaseId: "DSP-1048" } } } } }, "dispute"],
    ] as const;
    for (const [eventType, payload, family] of cases) {
      expect(reconcileCaseReference(eventType, payload)).toEqual({ caseReference: "DSP-1048", family });
    }
  });
});
