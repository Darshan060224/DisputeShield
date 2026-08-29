import { describe, expect, it } from "vitest";
import { canReleaseAppealPacket, evaluateAppealPolicy } from "./appealPolicy";

describe("bounded appeal policy", () => {
  it("prepares but never auto-submits a contest-ready product-not-received packet", () => {
    const policy = evaluateAppealPolicy({ claimType: "product_not_received", fulfillmentState: "delivered", claims: [
      { kind: "Payment", source: "Razorpay", claim: "Captured", verified: true },
      { kind: "Delivery proof", source: "Carrier", claim: "Delivered", verified: true },
      { kind: "Address match", source: "Order", claim: "Matched", verified: true },
    ] });
    expect(policy.decision).toBe("prepare_contest");
    expect(policy.score).toBe(100);
    expect(policy.approvalRequired).toBe(true);
    expect(policy.blockedExternalActions).toContain("Submit a dispute response");
    expect(canReleaseAppealPacket(policy)).toBe(true);
  });

  it("routes a delivery exception to customer-resolution preparation", () => {
    const policy = evaluateAppealPolicy({ claimType: "product_not_received", fulfillmentState: "delivery_exception", claims: [
      { kind: "Payment", source: "Razorpay", claim: "Captured", verified: true },
      { kind: "Delivery proof", source: "Carrier", claim: "Exception", verified: false },
      { kind: "Address match", source: "Order", claim: "Pending", verified: false },
    ] });
    expect(policy.decision).toBe("prepare_customer_resolution");
    expect(policy.approvalRequired).toBe(true);
    expect(canReleaseAppealPacket(policy)).toBe(false);
  });

  it("blocks unsupported duplicate-payment action until its own evidence set is complete", () => {
    const policy = evaluateAppealPolicy({ claimType: "duplicate_payment", claims: [{ kind: "Payment references", source: "Razorpay", claim: "One payment", verified: true }] });
    expect(policy.decision).toBe("human_review");
    expect(policy.missingEvidence).toEqual(["Order reference", "Duplicate-payment comparison"]);
  });

  it("routes a refund conflict to human review even when a payment record exists", () => {
    const policy = evaluateAppealPolicy({ claimType: "refund_issue", claims: [
      { kind: "Refund request", source: "Support", claim: "Requested", verified: true },
      { kind: "Refund reference", source: "Razorpay", claim: "Reference present", verified: true },
      { kind: "Refund status", source: "Ledger", claim: "Conflict between refund sources", verified: true },
    ] });
    expect(policy.decision).toBe("human_review");
    expect(policy.approvalRequired).toBe(true);
    expect(policy.conflictPenalty).toBe(20);
    expect(policy.score).toBe(80);
  });

  it("requires all authentication evidence before preparing an unauthorized-transaction contest", () => {
    const incomplete = evaluateAppealPolicy({ claimType: "unauthorized_transaction", claims: [{ kind: "Payment", source: "Razorpay", claim: "Captured", verified: true }] });
    const complete = evaluateAppealPolicy({ claimType: "unauthorized_transaction", claims: [
      { kind: "Payment", source: "Razorpay", claim: "Captured", verified: true },
      { kind: "Customer authentication", source: "Auth", claim: "Verified", verified: true },
      { kind: "Fulfillment status", source: "Order", claim: "Shipped", verified: true },
    ] });
    expect(incomplete.decision).toBe("human_review");
    expect(complete.decision).toBe("prepare_contest");
  });
});
