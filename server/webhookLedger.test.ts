import { describe, expect, it } from "vitest";
import { pendingWebhookAction } from "../client/src/lib/webhookLedger";

describe("webhook ledger pending actions", () => {
  it("keeps unproven delivery explicitly pending", () => {
    expect(pendingWebhookAction()).toBe("Await a signed Razorpay delivery");
    expect(pendingWebhookAction("payment.captured", false)).toBe("Await a signed Razorpay delivery");
  });

  it("routes verified events to their bounded merchant action", () => {
    expect(pendingWebhookAction("payment.captured", true)).toBe("Reconcile capture to payment intake");
    expect(pendingWebhookAction("refund.processed", true)).toBe("Reconcile refund outcome");
    expect(pendingWebhookAction("payment.dispute.created", true)).toBe("Review evidence before packet preparation");
    expect(pendingWebhookAction("qr_code.created", true)).toBe("Review event provenance");
  });
});
