import crypto from "node:crypto";

export const CASE_AUDIT_EXPORT_VERSION = "2026-08-27.1";
export const CASE_AUDIT_APPROVAL_PHRASE = "EXPORT REDACTED CASE AUDIT";
export const CASE_AUDIT_EXPORT_BOUNDARY = "This is a merchant-approved, redacted local audit export. It contains no customer statement text, buyer identity, access token, document bytes, storage key, payment credential, or provider submission. It does not create, contest, accept, refund, or submit an external dispute.";

type SourceEvent = { eventType: string; actorType: string; createdAt: Date; sourceRefs?: string | null };
type SourceDocument = { declaredKind: string; contentType: string; byteSize: number; sha256: string; createdAt: Date; extraction?: { status: string; customerConfirmation: string; overallConfidence: number } | null };

function stableReference(prefix: string, value: string) {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 12)}`;
}

function sourceLabel(raw: string | null | undefined) {
  try {
    const source = raw ? JSON.parse(raw) : null;
    const candidate = typeof source?.sourceKind === "string" ? source.sourceKind : "local_case_event";
    return candidate.replace(/[^a-z_]/g, "").slice(0, 64) || "local_case_event";
  } catch {
    return "local_case_event";
  }
}

export function buildRedactedCaseAudit(input: {
  caseItem: { caseReference: string; merchantOpenId: string; issueType: string; status: string; createdAt: Date; updatedAt: Date };
  order: { orderReference: string; totalAmountPaise: number; currency: string; paymentObservation: string; fulfillmentState: string } | null;
  readinessScore: number;
  missingEvidence: string[];
  evidenceFields: string[];
  documents: SourceDocument[];
  events: SourceEvent[];
  escalation: { ownerLabel: string; level: string; updatedAt: Date } | null;
}) {
  const audit = {
    exportType: "redacted_local_case_audit" as const,
    exportVersion: CASE_AUDIT_EXPORT_VERSION,
    sourceKind: "merchant_scoped_local_case" as const,
    generatedFor: stableReference("merchant", input.caseItem.merchantOpenId),
    case: {
      reference: input.caseItem.caseReference,
      issueType: input.caseItem.issueType,
      status: input.caseItem.status,
      createdAt: input.caseItem.createdAt.toISOString(),
      updatedAt: input.caseItem.updatedAt.toISOString(),
    },
    order: input.order ? {
      reference: input.order.orderReference,
      amountPaise: input.order.totalAmountPaise,
      currency: input.order.currency,
      paymentObservation: input.order.paymentObservation,
      fulfillmentState: input.order.fulfillmentState,
    } : null,
    evidenceReadiness: {
      score: input.readinessScore,
      missingEvidence: [...input.missingEvidence].sort(),
      candidateRazorpayFieldNames: [...input.evidenceFields].sort(),
    },
    documents: input.documents.map((document, index) => ({
      reference: `document_${index + 1}`,
      declaredKind: document.declaredKind,
      contentType: document.contentType,
      byteSize: document.byteSize,
      sha256Prefix: document.sha256.slice(0, 16),
      createdAt: document.createdAt.toISOString(),
      extraction: document.extraction ? {
        status: document.extraction.status,
        customerConfirmation: document.extraction.customerConfirmation,
        overallConfidence: document.extraction.overallConfidence,
      } : null,
    })),
    timeline: input.events.slice().sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime()).map(event => ({
      eventType: event.eventType,
      actorType: event.actorType,
      sourceKind: sourceLabel(event.sourceRefs),
      createdAt: event.createdAt.toISOString(),
    })),
    sla: input.escalation ? { ownerLabel: input.escalation.ownerLabel, level: input.escalation.level, updatedAt: input.escalation.updatedAt.toISOString() } : { ownerLabel: "Merchant review", level: "watch", updatedAt: input.caseItem.updatedAt.toISOString() },
    boundary: CASE_AUDIT_EXPORT_BOUNDARY,
  };
  return audit;
}

export function hashRedactedCaseAudit(audit: ReturnType<typeof buildRedactedCaseAudit>) {
  return crypto.createHash("sha256").update(JSON.stringify(audit)).digest("hex");
}
