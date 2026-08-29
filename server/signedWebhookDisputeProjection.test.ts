import { describe, expect, it } from "vitest";
import { projectLatestSignedWebhookDisputes, type SignedWebhookDisputeRecord } from "./signedWebhookDisputeProjection";

const payload = (id: string, phase = "chargeback") => JSON.stringify({ payload: { dispute: { entity: { id, reason_code: "duplicate_payment", status: "open", phase, respond_by: 1_800_000_000, evidence: { payment_reconciliation: ["matched"] } } }, payment: { entity: { id: "pay_123" } } } });

function row(overrides: Partial<SignedWebhookDisputeRecord> = {}): SignedWebhookDisputeRecord {
  return { eventId: "evt_1", eventType: "payment.dispute.created", merchantOpenId: "merchant_a", signatureVerified: true, externalDisputeId: "disp_1", externalReasonCode: "duplicate_payment", externalPhase: "chargeback", externalStatus: "open", externalRespondBy: 1_800_000_000, rawMetadata: payload("disp_1"), ...overrides };
}

describe("signed webhook dispute projection", () => {
  it("keeps only the newest signed dispute event for the owning merchant", () => {
    const rows = [row({ eventId: "evt_new", eventType: "payment.dispute.under_review", externalStatus: "under_review", rawMetadata: payload("disp_1", "chargeback") }), row({ eventId: "evt_old" })];
    const projected = projectLatestSignedWebhookDisputes(rows, "merchant_a");
    expect(projected).toHaveLength(1);
    expect(projected[0].eventId).toBe("evt_new");
    expect(projected[0].dispute.id).toBe("disp_1");
  });

  it("rejects other merchants, unsigned deliveries, non-dispute events, and malformed metadata", () => {
    const projected = projectLatestSignedWebhookDisputes([
      row({ merchantOpenId: "merchant_b" }),
      row({ eventId: "evt_unsigned", signatureVerified: false }),
      row({ eventId: "evt_payment", eventType: "payment.captured" }),
      row({ eventId: "evt_bad", rawMetadata: "not-json" }),
    ], "merchant_a");
    expect(projected).toEqual([]);
  });
});
