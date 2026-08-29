import { describe, expect, it } from "vitest";
import { canConfirmRefundFromSignedWebhook } from "./refundConfirmation";

describe("local refund confirmation gate", () => {
  it("permits confirmation only for a signed Razorpay refund.processed event on a merchant-approved local request", () => {
    expect(canConfirmRefundFromSignedWebhook({ signatureVerified: true, eventType: "refund.processed", requestStatus: "merchant_approved" })).toBe(true);
  });

  it("rejects unsigned events, other event types, and unapproved local requests", () => {
    expect(canConfirmRefundFromSignedWebhook({ signatureVerified: false, eventType: "refund.processed", requestStatus: "merchant_approved" })).toBe(false);
    expect(canConfirmRefundFromSignedWebhook({ signatureVerified: true, eventType: "refund.created", requestStatus: "merchant_approved" })).toBe(false);
    expect(canConfirmRefundFromSignedWebhook({ signatureVerified: true, eventType: "refund.processed", requestStatus: "prepared" })).toBe(false);
  });
});
