import { describe, expect, it } from "vitest";
import { buildRedactedCaseAudit, CASE_AUDIT_EXPORT_BOUNDARY, hashRedactedCaseAudit } from "./caseAuditExport";

describe("redacted case audit export", () => {
  const createdAt = new Date("2026-08-27T00:00:00.000Z");
  const audit = buildRedactedCaseAudit({
    caseItem: { caseReference: "CASE-100", merchantOpenId: "merchant-secret-open-id", issueType: "product_not_received", status: "merchant_review", createdAt, updatedAt: createdAt },
    order: { orderReference: "ORDER-100", totalAmountPaise: 79900, currency: "INR", paymentObservation: "api_observed", fulfillmentState: "delivery_exception" },
    readinessScore: 50,
    missingEvidence: ["delivery_or_tracking"],
    evidenceFields: ["shipping_proof"],
    documents: [{ declaredKind: "support_conversation", contentType: "application/pdf", byteSize: 1024, sha256: "abcdef0123456789abcdef0123456789", createdAt, extraction: { status: "complete", customerConfirmation: "confirmed", overallConfidence: 88 } }],
    events: [{ eventType: "case_drafted", actorType: "customer", createdAt, sourceRefs: JSON.stringify({ sourceKind: "customer_local_case", rawCustomerText: "must not export" }) }],
    escalation: null,
  });

  it("retains source-labelled operational facts while redacting raw customer and storage data", () => {
    const serialized = JSON.stringify(audit);
    expect(audit.generatedFor).toMatch(/^merchant_[a-f0-9]{12}$/);
    expect(audit.documents[0]).not.toHaveProperty("originalName");
    expect(audit.documents[0]).not.toHaveProperty("fileKey");
    expect(audit.timeline[0].sourceKind).toBe("customer_local_case");
    expect(serialized).not.toContain("merchant-secret-open-id");
    expect(serialized).not.toContain("must not export");
    expect(audit.boundary).toBe(CASE_AUDIT_EXPORT_BOUNDARY);
  });

  it("produces a stable content hash for the same redacted operational facts", () => {
    expect(hashRedactedCaseAudit(audit)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashRedactedCaseAudit(audit)).toBe(hashRedactedCaseAudit(audit));
  });
});
