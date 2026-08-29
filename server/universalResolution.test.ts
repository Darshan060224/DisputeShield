import { describe, expect, it } from "vitest";
import { buildMerchantOperationalSignals, buildUniversalResolutionRecommendation } from "./universalResolution";

const base = {
  status: "merchant_review" as const,
  documentKinds: [] as const,
  hasUnreviewedExtraction: false,
  paymentObservation: "captured" as const,
  fulfilmentState: "delivery_exception" as const,
  refundConfirmed: false,
  returnReceiptRecorded: false,
};

describe("universal resolution recommendations", () => {
  it("prepares a partial-delivery review without asserting fraud or moving money", () => {
    const result = buildUniversalResolutionRecommendation({ ...base, issueType: "partial_delivery" });
    expect(result.readiness).toBe("evidence_pending");
    expect(result.nextActions.join(" ")).toContain("delivery exception");
    expect(result.blockedActions).toContain("Issue a refund automatically");
  });

  it("routes an unauthorized-transaction claim to human review without a fraud finding", () => {
    const result = buildUniversalResolutionRecommendation({ ...base, issueType: "unauthorized_transaction" });
    expect(result.nextActions.join(" ")).toContain("do not infer fraud");
  });

  it("creates aggregate merchant-operations signals without a customer-risk label", () => {
    const signals = buildMerchantOperationalSignals([
      { issueType: "product_not_received", status: "submitted" },
      { issueType: "partial_delivery", status: "submitted" },
      { issueType: "damaged_or_wrong_item", status: "merchant_review" },
    ]);
    expect(signals[0]).toMatchObject({ key: "delivery_friction", level: "review", count: 3 });
    expect(signals[0].boundary).toContain("not a customer risk score");
  });
});
