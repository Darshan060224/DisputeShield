import { describe, expect, it } from "vitest";
import { buildExternalDisputeControl } from "./universalDisputeControl";

describe("universal external dispute control", () => {
  it("keeps a Razorpay reason, phase, deadline and evidence field as external source facts", () => {
    const command = buildExternalDisputeControl({
      id: "disp_123",
      reasonCode: "goods_or_services_not_received_or_partially_received",
      status: "open",
      phase: "chargeback",
      respondBy: 1_800_000_000,
      evidence: { shipping_proof: ["doc_1"], customer_communication: null },
    }, 1_799_900_000_000);
    expect(command.reason).toBe("Goods Or Services Not Received Or Partially Received");
    expect(command.phase).toBe("chargeback");
    expect(command.deadlineState).toBe("watch");
    expect(command.evidenceFields).toEqual(["Shipping Proof"]);
    expect(command.evidencePolicy.family).toBe("fulfilment_quality");
    expect(command.sourceBoundary).toBe("bank_initiated_external_dispute");
  });

  it("fails safe when Razorpay does not provide a phase or response deadline", () => {
    const command = buildExternalDisputeControl({ id: "disp_456", reason: "chargeback" });
    expect(command.phase).toBe("unclassified");
    expect(command.deadlineState).toBe("deadline_unavailable");
    expect(command.blockedActions).toContain("Auto-submit a contest");
  });

  it("uses reason-specific evidence policies without converting them into automatic contest decisions", () => {
    expect(buildExternalDisputeControl({ id: "refund", reasonCode: "refund_not_received" }).evidencePolicy.requiredKinds).toEqual(["Payment", "Refund status", "Customer communication"]);
    expect(buildExternalDisputeControl({ id: "duplicate", reasonCode: "duplicate_payment" }).evidencePolicy.requiredKinds).toEqual(["Payment", "Order reference", "Payment reconciliation"]);
    expect(buildExternalDisputeControl({ id: "unauthorized", reasonCode: "unauthorized_transaction" }).blockedActions).toContain("Auto-submit a contest");
  });
});
