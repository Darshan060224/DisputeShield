import { describe, expect, it } from "vitest";
import { shouldCreatePaymentEvidence, summarizeWebhookVerifiedIntakes } from "./paymentIntake";

describe("webhook-gated payment intake metrics", () => {
  it("excludes created, checkout-opened, client-confirmed, failed, and verification-failed orders", () => {
    const metrics = summarizeWebhookVerifiedIntakes([
      { amountPaise: 10000, status: "created" },
      { amountPaise: 20000, status: "checkout_opened" },
      { amountPaise: 30000, status: "client_confirmed" },
      { amountPaise: 40000, status: "failed" },
      { amountPaise: 50000, status: "verification_failed" },
    ]);

    expect(metrics).toEqual({ verifiedCapturedPayments: 0, verifiedCollectedAmount: 0 });
  });

  it("includes only payment intakes marked captured by a verified webhook", () => {
    const metrics = summarizeWebhookVerifiedIntakes([
      { amountPaise: 30000, status: "client_confirmed" },
      { amountPaise: 12500, status: "captured" },
      { amountPaise: 9900, status: "captured" },
    ]);

    expect(metrics).toEqual({ verifiedCapturedPayments: 2, verifiedCollectedAmount: 224 });
  });

  it("does not create payment evidence from an order or a browser checkout confirmation", () => {
    expect(shouldCreatePaymentEvidence({ eventType: "order.created", signatureVerified: true })).toBe(false);
    expect(shouldCreatePaymentEvidence({ eventType: "payment.captured", signatureVerified: false })).toBe(false);
    expect(shouldCreatePaymentEvidence({ eventType: "payment.captured", signatureVerified: true })).toBe(true);
  });
});
