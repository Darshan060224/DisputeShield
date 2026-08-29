export const CUSTOMER_ISSUE_TYPES = [
  "product_not_received",
  "partial_delivery",
  "damaged_or_wrong_item",
  "return_request",
  "refund_issue",
  "wrong_amount",
  "duplicate_payment",
  "unauthorized_transaction",
] as const;

export type CustomerIssueType = (typeof CUSTOMER_ISSUE_TYPES)[number];

export const CUSTOMER_CASE_STATUSES = [
  "draft",
  "evidence_pending",
  "submitted",
  "customer_action_required",
  "merchant_review",
  "return_authorized",
  "return_in_transit",
  "return_received",
  "resolution_offered",
  "local_policy_review",
  "resolved",
  "closed",
  "withdrawn",
] as const;

export type CustomerCaseStatus = (typeof CUSTOMER_CASE_STATUSES)[number];

export const CUSTOMER_DOCUMENT_KINDS = [
  "return_shipping_receipt",
  "item_condition",
  "payment_confirmation",
  "support_conversation",
  "delivery_or_tracking",
  "other",
] as const;

export type CustomerDocumentKind = (typeof CUSTOMER_DOCUMENT_KINDS)[number];

export type EvidenceReadinessRequirement = { kind: CustomerDocumentKind; label: string; weight: number };

export const CUSTOMER_CASE_READINESS_REQUIREMENTS: Record<CustomerIssueType, EvidenceReadinessRequirement[]> = {
  product_not_received: [{ kind: "delivery_or_tracking", label: "Delivery or tracking evidence", weight: 0.6 }, { kind: "support_conversation", label: "Support conversation or delivery update", weight: 0.4 }],
  partial_delivery: [{ kind: "delivery_or_tracking", label: "Delivery or tracking evidence", weight: 0.4 }, { kind: "item_condition", label: "Item or packing photo", weight: 0.35 }, { kind: "support_conversation", label: "Support conversation", weight: 0.25 }],
  damaged_or_wrong_item: [{ kind: "item_condition", label: "Item-condition photo or document", weight: 0.55 }, { kind: "delivery_or_tracking", label: "Delivery or tracking evidence", weight: 0.25 }, { kind: "support_conversation", label: "Order or product support evidence", weight: 0.2 }],
  return_request: [{ kind: "item_condition", label: "Item-condition photo or document", weight: 0.6 }, { kind: "support_conversation", label: "Order or support evidence", weight: 0.4 }],
  refund_issue: [{ kind: "payment_confirmation", label: "Payment confirmation", weight: 0.6 }, { kind: "support_conversation", label: "Support conversation", weight: 0.4 }],
  wrong_amount: [{ kind: "payment_confirmation", label: "Payment confirmation", weight: 0.7 }, { kind: "support_conversation", label: "Order or invoice support evidence", weight: 0.3 }],
  duplicate_payment: [{ kind: "payment_confirmation", label: "Payment confirmation", weight: 0.7 }, { kind: "support_conversation", label: "Transaction reference or support evidence", weight: 0.3 }],
  unauthorized_transaction: [{ kind: "payment_confirmation", label: "Payment confirmation", weight: 0.5 }, { kind: "support_conversation", label: "Factual support statement", weight: 0.5 }],
};

export function calculateCustomerCaseEvidenceReadiness(input: { issueType: CustomerIssueType; documentKinds: CustomerDocumentKind[] }) {
  const available = new Set(input.documentKinds);
  const requirements = CUSTOMER_CASE_READINESS_REQUIREMENTS[input.issueType];
  const present = requirements.filter(requirement => available.has(requirement.kind));
  const missing = requirements.filter(requirement => !available.has(requirement.kind));
  const score = Math.round(present.reduce((sum, requirement) => sum + requirement.weight, 0) * 100);
  return { score, required: requirements, present, missing, unrelatedDocumentKinds: Array.from(available).filter(kind => !requirements.some(requirement => requirement.kind === kind)) };
}

type CaseActor = "customer" | "merchant";

type CustomerScopedRecord = {
  merchantOpenId: string;
  buyerOpenId: string | null;
};

/**
 * Defense-in-depth ownership check for buyer-visible records. Database predicates
 * remain mandatory; this prevents an unexpectedly broad adapter result from being
 * treated as belonging to the authenticated Customer Space session.
 */
export function isCustomerScopedRecord(input: {
  record: CustomerScopedRecord;
  merchantOpenId: string;
  buyerOpenId: string;
}) {
  return input.record.merchantOpenId === input.merchantOpenId && input.record.buyerOpenId === input.buyerOpenId;
}

export const CUSTOMER_CASE_GUIDANCE: Record<CustomerIssueType, {
  label: string;
  description: string;
  evidence: string[];
  merchantOnly: string;
}> = {
  product_not_received: {
    label: "Product not received",
    description: "Tell us what was expected, the promised delivery context, and any delivery or support evidence you have.",
    evidence: ["Delivery or tracking evidence", "Support conversation or delivery update"],
    merchantOnly: "Only the merchant can verify fulfilment records and decide a local resolution.",
  },
  partial_delivery: {
    label: "Item missing from delivery",
    description: "Describe what was received, what was missing, and any delivery or packing evidence you have.",
    evidence: ["Delivery or tracking evidence", "Item or packing photo", "Support conversation"],
    merchantOnly: "Only the merchant can compare the order, fulfilment, and packing records before offering a local resolution.",
  },
  damaged_or_wrong_item: {
    label: "Damaged or wrong item",
    description: "Describe the item received and the mismatch or condition issue. Add clear item-condition evidence if available.",
    evidence: ["Item-condition photo or document", "Order or product record", "Delivery or tracking evidence"],
    merchantOnly: "Only the merchant can assess the order record and authorize a return or offer a local resolution.",
  },
  return_request: {
    label: "Return request",
    description: "Describe the return reason and provide truthful item-condition evidence if available.",
    evidence: ["Item-condition photo or document", "Order or support evidence"],
    merchantOnly: "Only the merchant can issue local return instructions or authorize a return.",
  },
  refund_issue: {
    label: "Refund not received",
    description: "State the expected refund context and provide a payment or support record if available.",
    evidence: ["Payment confirmation", "Support conversation"],
    merchantOnly: "Only the merchant can verify a refund record; no refund is issued automatically.",
  },
  wrong_amount: {
    label: "Wrong amount",
    description: "Describe the amount you expected and the amount you believe was charged.",
    evidence: ["Payment confirmation", "Order or invoice record"],
    merchantOnly: "Only the merchant can compare the order and payment records and offer a resolution.",
  },
  duplicate_payment: {
    label: "Duplicate payment",
    description: "Provide the two payment references or a statement showing the suspected duplicate.",
    evidence: ["Payment confirmation", "Transaction reference"],
    merchantOnly: "Only the merchant can verify payment records; no payment is reversed automatically.",
  },
  unauthorized_transaction: {
    label: "Unauthorized transaction",
    description: "Provide a factual statement and any relevant transaction/support evidence. This requires human review.",
    evidence: ["Payment confirmation", "Factual support statement"],
    merchantOnly: "This is routed to a merchant human review; the system does not make a fraud finding or submit a chargeback.",
  },
};

const merchantTransitions: Record<CustomerCaseStatus, Partial<Record<string, CustomerCaseStatus>>> = {
  draft: {},
  evidence_pending: {},
  submitted: { start_review: "merchant_review" },
  customer_action_required: { start_review: "merchant_review" },
  merchant_review: {
    request_evidence: "customer_action_required",
    authorize_return: "return_authorized",
    offer_resolution: "resolution_offered",
    route_policy_review: "local_policy_review",
    close: "closed",
  },
  return_authorized: { offer_resolution: "resolution_offered", close: "closed" },
  return_in_transit: { record_return_received: "return_received" },
  return_received: { offer_resolution: "resolution_offered", close: "closed" },
  resolution_offered: { close: "closed" },
  local_policy_review: { offer_resolution: "resolution_offered", close: "closed" },
  resolved: {},
  closed: {},
  withdrawn: {},
};

const customerTransitions: Record<CustomerCaseStatus, Partial<Record<string, CustomerCaseStatus>>> = {
  draft: { submit: "submitted", withdraw: "withdrawn" },
  evidence_pending: { submit: "submitted", withdraw: "withdrawn" },
  submitted: {},
  customer_action_required: { provide_evidence: "evidence_pending", withdraw: "withdrawn" },
  merchant_review: {},
  return_authorized: { mark_return_in_transit: "return_in_transit" },
  return_in_transit: {},
  return_received: {},
  resolution_offered: { accept_resolution: "resolved" },
  local_policy_review: {},
  resolved: {},
  closed: {},
  withdrawn: {},
};

export function transitionCustomerCase(input: {
  status: CustomerCaseStatus;
  actor: CaseActor;
  action: string;
  issueType: CustomerIssueType;
}): CustomerCaseStatus {
  if (input.actor === "merchant" && input.action === "authorize_return" && !["return_request", "damaged_or_wrong_item"].includes(input.issueType)) {
    throw new Error("A return can only be authorized for a customer return request or a damaged/wrong item case.");
  }
  const transitions = input.actor === "merchant" ? merchantTransitions : customerTransitions;
  const next = transitions[input.status][input.action];
  if (!next) throw new Error(`Action '${input.action}' is not permitted while the case is ${input.status.replaceAll("_", " ")}.`);
  return next;
}

export function customerCaseEvidenceState(input: {
  documentCount: number;
  hasUnreviewedExtraction: boolean;
}): CustomerCaseStatus {
  if (input.documentCount === 0 || input.hasUnreviewedExtraction) return "evidence_pending";
  return "draft";
}
