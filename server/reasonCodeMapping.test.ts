import { describe, expect, it } from "vitest";
import { buildRazorpayEvidenceExportPreview, getReasonCodeMapping, razorpayEvidenceExportSkeleton } from "./reasonCodeMapping";

describe("network reason-code evidence mapping", () => {
  it("maps product-not-received to documented Visa and RuPay candidates without creating an external claim", () => {
    const mapping = getReasonCodeMapping("product_not_received");
    expect(mapping.networkCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ network: "Visa", code: "13.1" }),
      expect.objectContaining({ network: "RuPay", code: "1064" }),
    ]));
    expect(mapping.boundary).toMatch(/actual issuer\/Razorpay/i);
    expect(mapping.razorpayEvidenceFields).toContain("shipping_proof");
  });

  it("leaves ambiguous and local-only flows awaiting an issuer code instead of guessing one", () => {
    expect(getReasonCodeMapping("wrong_amount").externalReadiness).toBe("awaiting_issuer_reason_code");
    expect(getReasonCodeMapping("return_request").externalReadiness).toBe("local_only");
    expect(getReasonCodeMapping("unauthorized_transaction").networkCandidates).toEqual([]);
  });

  it("creates only documented Razorpay evidence-field placeholders", () => {
    expect(razorpayEvidenceExportSkeleton("refund_issue")).toEqual({ billing_proof: null, customer_communication: null, refund_cancellation_policy: null, refund_confirmation: null });
  });

  it("builds a source-labelled merchant review preview without an issuer reason or provider action", () => {
    const preview = buildRazorpayEvidenceExportPreview({ issueType: "product_not_received", documentKinds: ["delivery_or_tracking", "support_conversation"], paymentObservation: "api_observed", refundConfirmed: false });
    expect(preview.actualReasonCode).toBeNull();
    expect(preview.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "shipping_proof", availability: "merchant_document_present" }),
      expect.objectContaining({ field: "customer_communication", availability: "merchant_document_present" }),
    ]));
    expect(preview.boundary).toMatch(/review preview only/i);
  });
});
