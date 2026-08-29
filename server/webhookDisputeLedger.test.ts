import { describe, expect, it } from "vitest";
import { buildVerifiedWebhookLedgerValues, mergeCommandCentreSources } from "./webhookDisputeLedger";

describe("signed dispute webhook ledger", () => {
  it("maps signed payment.dispute metadata into the merchant-scoped persistence values", () => {
    const values = buildVerifiedWebhookLedgerValues({
      eventId: "evt_dispute_1", eventType: "payment.dispute.created", merchantOpenId: "merchant_owner", rawMetadata: "{}",
      payload: { payload: { dispute: { entity: { id: "disp_1", reason_code: "duplicate_payment", phase: "chargeback", status: "open", respond_by: 1_800_000_000, notes: { disputeShieldCaseId: "DSP-1048" } } } } },
    });
    expect(values).toMatchObject({ merchantOpenId: "merchant_owner", signatureVerified: true, externalDisputeId: "disp_1", externalReasonCode: "duplicate_payment", externalPhase: "chargeback", externalStatus: "open", externalRespondBy: 1_800_000_000, disputeId: 1048 });
  });

  it("prioritizes a signed webhook command-centre case and removes its duplicate API observation", () => {
    const merged = mergeCommandCentreSources([{ externalId: "disp_1", source: "webhook" }], [{ externalId: "local_1", source: "local" }], [{ externalId: "disp_1", source: "api" }, { externalId: "disp_2", source: "api" }]);
    expect(merged).toEqual([{ externalId: "disp_1", source: "webhook" }, { externalId: "local_1", source: "local" }, { externalId: "disp_2", source: "api" }]);
  });
});
