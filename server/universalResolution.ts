import type { CustomerCaseStatus, CustomerDocumentKind, CustomerIssueType } from "./customerCasePolicy";

export type UniversalCaseFact = {
  issueType: CustomerIssueType;
  status: CustomerCaseStatus;
  documentKinds: CustomerDocumentKind[];
  hasUnreviewedExtraction: boolean;
  paymentObservation: "not_started" | "created" | "checkout_opened" | "client_confirmed" | "api_observed" | "webhook_verified" | "captured" | "failed";
  fulfilmentState: "unfulfilled" | "packed" | "shipped" | "delivered" | "delivery_exception";
  refundConfirmed: boolean;
  returnReceiptRecorded: boolean;
};

export type MerchantOperationalSignal = {
  key: "delivery_friction" | "return_friction" | "payment_friction" | "refund_friction";
  level: "watch" | "review" | "elevated";
  count: number;
  title: string;
  action: string;
  boundary: string;
};

const requiredEvidence: Record<CustomerIssueType, CustomerDocumentKind[]> = {
  product_not_received: ["delivery_or_tracking", "support_conversation"],
  partial_delivery: ["item_condition", "delivery_or_tracking"],
  damaged_or_wrong_item: ["item_condition", "delivery_or_tracking"],
  return_request: ["item_condition"],
  refund_issue: ["payment_confirmation", "support_conversation"],
  wrong_amount: ["payment_confirmation"],
  duplicate_payment: ["payment_confirmation"],
  unauthorized_transaction: ["payment_confirmation", "support_conversation"],
};

function evidenceGaps(fact: UniversalCaseFact) {
  return requiredEvidence[fact.issueType].filter(kind => !fact.documentKinds.includes(kind));
}

export function buildUniversalResolutionRecommendation(fact: UniversalCaseFact) {
  const missingEvidence = evidenceGaps(fact);
  const nextActions: string[] = [];
  const blockedActions = ["Issue a refund automatically", "Submit an external dispute or appeal", "Classify a customer as fraudulent", "Claim carrier verification without a trusted event"];

  if (fact.hasUnreviewedExtraction) nextActions.push("Ask the customer to confirm or correct OCR candidate facts");
  if (missingEvidence.length) nextActions.push(`Request ${missingEvidence.map(kind => kind.replaceAll("_", " ")).join(" and ")}`);
  if (!["captured", "api_observed", "webhook_verified"].includes(fact.paymentObservation)) nextActions.push("Verify the payment state from a trusted Razorpay source before any financial resolution");

  if (fact.issueType === "product_not_received" || fact.issueType === "partial_delivery") {
    nextActions.push(fact.fulfilmentState === "delivery_exception" ? "Resolve the merchant delivery exception and contact the customer" : "Compare fulfilment, tracking, and address records");
  }
  if (fact.issueType === "damaged_or_wrong_item" || fact.issueType === "return_request") {
    nextActions.push(fact.status === "merchant_review" ? "Decide whether to authorize a return" : "Review item-condition evidence before a return decision");
  }
  if (fact.issueType === "refund_issue") {
    nextActions.push(fact.refundConfirmed ? "Share the confirmed refund reference with the customer" : "Reconcile the refund request against a signed Razorpay refund event");
  }
  if (fact.issueType === "wrong_amount" || fact.issueType === "duplicate_payment") nextActions.push("Reconcile order and payment references in merchant review");
  if (fact.issueType === "unauthorized_transaction") nextActions.push("Route to human merchant review; do not infer fraud from this claim");
  if (fact.status === "return_in_transit" && !fact.returnReceiptRecorded) nextActions.push("Wait for a trusted carrier event or clearly labelled merchant receipt confirmation");

  return {
    readiness: fact.hasUnreviewedExtraction || missingEvidence.length ? "evidence_pending" : "merchant_review_ready",
    missingEvidence,
    nextActions: Array.from(new Set(nextActions)),
    blockedActions,
    rationale: "Recommendations combine the customer-selected issue type with source-labelled evidence availability. They are preparation steps, not a finding about the customer or an instruction to move money.",
  };
}

export function buildMerchantOperationalSignals(cases: Array<Pick<UniversalCaseFact, "issueType" | "status">>): MerchantOperationalSignal[] {
  const groups = {
    delivery_friction: cases.filter(item => ["product_not_received", "partial_delivery", "damaged_or_wrong_item"].includes(item.issueType)).length,
    return_friction: cases.filter(item => ["return_request", "damaged_or_wrong_item"].includes(item.issueType) && ["submitted", "merchant_review", "return_authorized", "return_in_transit", "return_received"].includes(item.status)).length,
    payment_friction: cases.filter(item => ["wrong_amount", "duplicate_payment", "unauthorized_transaction"].includes(item.issueType)).length,
    refund_friction: cases.filter(item => item.issueType === "refund_issue").length,
  } as const;

  const definitions = {
    delivery_friction: ["Delivery-friction pattern", "Review fulfilment, carrier, and support processes."],
    return_friction: ["Open return-friction pattern", "Review return instructions and receipt turnaround."],
    payment_friction: ["Payment-friction pattern", "Review order/payment reconciliation and checkout controls."],
    refund_friction: ["Refund-delay pattern", "Review refund queue, customer communications, and confirmation records."],
  } as const;

  return Object.entries(groups).flatMap(([key, count]) => {
    if (!count) return [];
    const [title, action] = definitions[key as keyof typeof definitions];
    return [{
      key: key as MerchantOperationalSignal["key"],
      level: count >= 5 ? "elevated" : count >= 3 ? "review" : "watch",
      count,
      title,
      action,
      boundary: "This is an aggregate merchant-operations signal. It is not a customer risk score, fraud label, or automated case decision.",
    }];
  });
}
