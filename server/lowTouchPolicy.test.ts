import { describe, expect, it } from "vitest";
import { evaluateLowTouchWorkflow } from "./lowTouchPolicy";

describe("low-touch dispute workflow policy", () => {
  it("automates matching, classification, gaps, and packet preparation when trusted facts are complete", () => {
    const result = evaluateLowTouchWorkflow({ source: "signed_webhook_verified", evidenceComplete: true, ocrNeedsConfirmation: false, paymentTrusted: true, externalDispute: true, refundRequested: false });
    expect(result.canPreparePacket).toBe(true);
    expect(result.automatedSteps.join(" ")).toMatch(/verified-facts-only/);
    expect(result.humanGates).toContain("Merchant must review and approve any external dispute response");
  });

  it("routes incomplete OCR and evidence to a concise exception queue", () => {
    const result = evaluateLowTouchWorkflow({ source: "customer_local_case", evidenceComplete: false, ocrNeedsConfirmation: true, paymentTrusted: false, externalDispute: false, refundRequested: false });
    expect(result.canPreparePacket).toBe(false);
    expect(result.exceptionQueue).toEqual(["Evidence packet incomplete", "Trusted Razorpay payment fact required"]);
    expect(result.humanGates).toContain("Customer must confirm or reject OCR candidate facts");
  });

  it("never prepares an external packet from API-only or local customer sources", () => {
    for (const source of ["razorpay_api_observed", "customer_local_case"] as const) {
      const result = evaluateLowTouchWorkflow({ source, evidenceComplete: true, ocrNeedsConfirmation: false, paymentTrusted: true, externalDispute: true, refundRequested: false });
      expect(result.canPreparePacket).toBe(false);
      expect(result.exceptionQueue).toContain("Signed Razorpay dispute event required before external packet preparation");
    }
  });

  it("keeps refund approval as a human gate", () => {
    const result = evaluateLowTouchWorkflow({ source: "signed_webhook_verified", evidenceComplete: true, ocrNeedsConfirmation: false, paymentTrusted: true, externalDispute: false, refundRequested: true });
    expect(result.humanGates).toContain("Merchant must approve any refund action; no automatic refund");
  });
});
