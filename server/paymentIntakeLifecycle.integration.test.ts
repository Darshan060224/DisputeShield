import { describe, expect, it } from "vitest";
import { checkoutVerificationTransition, summarizeWebhookVerifiedIntakes, verifiedWebhookCaptureTransition } from "./paymentIntake";

describe("merchant payment checkout-to-webhook lifecycle", () => {
  it("keeps metrics and payment evidence unchanged until a signed payment.captured webhook arrives", () => {
    const intake = { amountPaise: 12500, status: "created" as const };
    const evidenceEvents: Array<{ paymentId: string; signatureVerified: boolean }> = [];

    const checkout = checkoutVerificationTransition(true);
    const clientConfirmed = { ...intake, status: checkout.status };
    expect(checkout.createsEvidence).toBe(false);
    expect(summarizeWebhookVerifiedIntakes([clientConfirmed])).toEqual({ verifiedCapturedPayments: 0, verifiedCollectedAmount: 0 });
    expect(evidenceEvents).toHaveLength(0);

    const capture = verifiedWebhookCaptureTransition({ eventType: "payment.captured", signatureVerified: true });
    const webhookCaptured = { ...clientConfirmed, status: capture.status! };
    if (capture.createsEvidence) evidenceEvents.push({ paymentId: "pay_1", signatureVerified: true });

    expect(summarizeWebhookVerifiedIntakes([webhookCaptured])).toEqual({ verifiedCapturedPayments: 1, verifiedCollectedAmount: 125 });
    expect(evidenceEvents).toEqual([{ paymentId: "pay_1", signatureVerified: true }]);
  });
});
