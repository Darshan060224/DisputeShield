import type { CustomerCaseStatus, CustomerDocumentKind, CustomerIssueType } from "./customerCasePolicy";

export type ProactiveRiskCase = {
  caseReference: string;
  issueType: CustomerIssueType;
  status: CustomerCaseStatus;
  createdAt: Date;
  updatedAt: Date;
  documentKinds: CustomerDocumentKind[];
  hasUnreviewedExtraction: boolean;
  paymentObservation: "not_started" | "created" | "checkout_opened" | "client_confirmed" | "api_observed" | "webhook_verified" | "captured" | "failed";
  fulfilmentState: "unfulfilled" | "packed" | "shipped" | "delivered" | "delivery_exception";
  returnReceiptRecorded: boolean;
  refundConfirmed: boolean;
};

export type ProactiveRiskSignal = {
  key: string;
  level: "watch" | "review" | "elevated";
  title: string;
  caseReference: string;
  source: string;
  why: string;
  nextAction: string;
  boundary: string;
};

const evidenceByIssue: Record<CustomerIssueType, CustomerDocumentKind[]> = {
  product_not_received: ["delivery_or_tracking", "support_conversation"],
  partial_delivery: ["delivery_or_tracking", "item_condition"],
  damaged_or_wrong_item: ["item_condition", "delivery_or_tracking"],
  return_request: ["item_condition"],
  refund_issue: ["payment_confirmation", "support_conversation"],
  wrong_amount: ["payment_confirmation"],
  duplicate_payment: ["payment_confirmation"],
  unauthorized_transaction: ["payment_confirmation", "support_conversation"],
};

const activeStatuses: CustomerCaseStatus[] = ["draft", "evidence_pending", "submitted", "merchant_review", "customer_action_required", "return_authorized", "return_in_transit", "return_received", "resolution_offered"];

function priority(ageHours: number): "watch" | "review" | "elevated" {
  return ageHours >= 72 ? "elevated" : ageHours >= 24 ? "review" : "watch";
}

export function buildProactiveRiskIntelligence(cases: ProactiveRiskCase[], now = new Date()) {
  const signals: ProactiveRiskSignal[] = [];
  const slaBoard: Array<{ caseReference: string; level: "watch" | "review" | "elevated"; ageHours: number; nextAction: string; owner: "merchant" | "customer" | "system"; boundary: string }> = [];
  const freshness: Array<{ caseReference: string; completeness: number; missing: string[]; stale: boolean; source: string; nextAction: string }> = [];
  const graph: Array<{ caseReference: string; nodes: Array<{ id: string; label: string; source: string; state: "verified" | "observed" | "missing" }>; edges: Array<[string, string]> }> = [];

  for (const item of cases) {
    const ageHours = Math.max(0, Math.floor((now.getTime() - item.updatedAt.getTime()) / 3_600_000));
    const required = evidenceByIssue[item.issueType];
    const missing = required.filter(kind => !item.documentKinds.includes(kind)).map(kind => kind.replaceAll("_", " "));
    const completeness = Math.round(((required.length - missing.length) / Math.max(required.length, 1)) * 100);
    const active = activeStatuses.includes(item.status);

    freshness.push({ caseReference: item.caseReference, completeness, missing, stale: active && ageHours >= 48, source: "local customer case + document metadata", nextAction: missing.length ? `Request ${missing.join(" and ")}` : item.hasUnreviewedExtraction ? "Ask customer to confirm OCR candidate facts" : "Evidence set is complete for the local policy" });

    if (item.fulfilmentState === "delivery_exception" || (item.issueType === "product_not_received" && item.fulfilmentState === "unfulfilled")) {
      signals.push({ key: `${item.caseReference}:fulfilment`, level: item.fulfilmentState === "delivery_exception" ? "elevated" : "review", title: "Fulfilment Risk Sentinel", caseReference: item.caseReference, source: "merchant fulfilment record", why: item.fulfilmentState === "delivery_exception" ? "A delivery exception is recorded while the case remains active." : "A non-delivery issue is active without a fulfilment record.", nextAction: "Reconcile merchant fulfilment, tracking, and customer contact facts.", boundary: "This is operational triage only. It does not decide customer intent, delivery outcome, refund, or external dispute action." });
    }
    if (missing.length || item.hasUnreviewedExtraction) {
      signals.push({ key: `${item.caseReference}:freshness`, level: missing.length >= 2 ? "elevated" : "review", title: "Evidence Freshness Monitor", caseReference: item.caseReference, source: "customer documents + local policy", why: missing.length ? `Missing ${missing.join(" and ")}.` : "OCR candidate facts have not been confirmed by the customer.", nextAction: missing.length ? `Request ${missing.join(" and ")}` : "Request customer confirmation or correction of OCR candidate facts.", boundary: "The monitor can request and organise evidence only; it never invents, alters, or submits evidence." });
    }
    if (active) {
      const level = priority(ageHours);
      const owner = item.status === "customer_action_required" ? "customer" : "merchant";
      const nextAction = owner === "customer" ? "Await requested clarification or evidence." : item.status === "return_in_transit" && !item.returnReceiptRecorded ? "Track return receipt before assessing refund readiness." : "Complete the next factual merchant review step.";
      slaBoard.push({ caseReference: item.caseReference, level, ageHours, nextAction, owner, boundary: "SLA recovery records work priority only. It cannot send communications, approve refunds, or initiate external action." });
    }
    const nodes = [
      { id: "order", label: "Order", source: "merchant order record", state: "observed" as const },
      { id: "payment", label: "Payment", source: item.paymentObservation === "webhook_verified" ? "signed Razorpay webhook" : "Razorpay API/browser observation", state: ["webhook_verified", "captured", "api_observed"].includes(item.paymentObservation) ? "verified" as const : "observed" as const },
      { id: "fulfilment", label: "Fulfilment", source: "merchant fulfilment record", state: item.fulfilmentState === "delivered" ? "verified" as const : item.fulfilmentState === "delivery_exception" ? "missing" as const : "observed" as const },
      { id: "evidence", label: "Evidence", source: "protected customer documents", state: missing.length || item.hasUnreviewedExtraction ? "missing" as const : "verified" as const },
      { id: "resolution", label: "Local resolution", source: "customer case timeline", state: item.refundConfirmed ? "verified" as const : "observed" as const },
    ];
    graph.push({ caseReference: item.caseReference, nodes, edges: [["order", "payment"], ["order", "fulfilment"], ["fulfilment", "evidence"], ["evidence", "resolution"]] });
  }
  const outcomeLearning = {
    observedLocalResolutions: cases.filter(item => ["resolved", "closed"].includes(item.status)).length,
    withdrawnLocalCases: cases.filter(item => item.status === "withdrawn").length,
    externalOutcomeRecords: 0,
    status: "awaiting_merchant_confirmed_external_outcomes" as const,
    boundary: "Outcome learning changes no decision automatically. External win/loss learning begins only when a merchant records a confirmed outcome with its source reference.",
  };
  return { signals, slaBoard: slaBoard.sort((a, b) => b.ageHours - a.ageHours), freshness, graph, outcomeLearning, boundary: "Proactive Risk Intelligence is an explainable merchant-operations layer. It cannot deny a case, profile a customer, issue/refuse money, submit a contest, or trigger a bank/Razorpay action." };
}
