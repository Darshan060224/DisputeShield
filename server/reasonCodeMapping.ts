import type { CustomerDocumentKind, CustomerIssueType } from "./customerCasePolicy";

export type RazorpayEvidenceField =
  | "shipping_proof"
  | "billing_proof"
  | "cancellation_proof"
  | "customer_communication"
  | "proof_of_service"
  | "explanation_letter"
  | "refund_confirmation"
  | "access_activity_log"
  | "refund_cancellation_policy"
  | "term_and_conditions"
  | "others";

export type NetworkCandidate = {
  network: "Visa" | "Mastercard" | "RuPay";
  code: string;
  label: string;
  confidence: "direct_candidate" | "broad_candidate";
};

export type ReasonCodeMapping = {
  internalReason: CustomerIssueType;
  localLabel: string;
  externalReadiness: "candidate_mapping" | "awaiting_issuer_reason_code" | "local_only";
  networkCandidates: NetworkCandidate[];
  razorpayEvidenceFields: RazorpayEvidenceField[];
  merchantInstruction: string;
  source: "Razorpay dispute evidence documentation";
  boundary: string;
};

const STANDARD_RAZORPAY_FIELDS: RazorpayEvidenceField[] = ["billing_proof", "customer_communication", "explanation_letter", "term_and_conditions"];

export const NETWORK_REASON_MAPPINGS: Record<CustomerIssueType, ReasonCodeMapping> = {
  product_not_received: {
    internalReason: "product_not_received", localLabel: "Product not received", externalReadiness: "candidate_mapping",
    networkCandidates: [
      { network: "Visa", code: "13.1", label: "Merchandise/Services Not Received", confidence: "direct_candidate" },
      { network: "RuPay", code: "1064", label: "Goods/Services Not Received", confidence: "direct_candidate" },
      { network: "Mastercard", code: "4853", label: "Cardholder Dispute", confidence: "broad_candidate" },
    ],
    razorpayEvidenceFields: ["shipping_proof", "proof_of_service", "customer_communication", "term_and_conditions"],
    merchantInstruction: "Prioritize delivery confirmation, tracking or service-completion proof, then customer communication and fulfilment terms.",
    source: "Razorpay dispute evidence documentation",
    boundary: "Use the actual issuer/Razorpay reason code when received. This local mapping only pre-organizes evidence and does not submit a response.",
  },
  partial_delivery: {
    internalReason: "partial_delivery", localLabel: "Item missing from delivery", externalReadiness: "awaiting_issuer_reason_code",
    networkCandidates: [{ network: "Mastercard", code: "4853", label: "Cardholder Dispute", confidence: "broad_candidate" }],
    razorpayEvidenceFields: ["shipping_proof", "billing_proof", "customer_communication", "explanation_letter", "others"],
    merchantInstruction: "Preserve packing, delivery, and order-line evidence; require the issuer-provided reason before selecting a network code.",
    source: "Razorpay dispute evidence documentation",
    boundary: "No exact network subreason is inferred from a local partial-delivery report.",
  },
  damaged_or_wrong_item: {
    internalReason: "damaged_or_wrong_item", localLabel: "Damaged or wrong item", externalReadiness: "candidate_mapping",
    networkCandidates: [
      { network: "Visa", code: "13.3", label: "Not as Described or Defective", confidence: "direct_candidate" },
      { network: "RuPay", code: "1062", label: "Goods/Services Not As Described", confidence: "direct_candidate" },
      { network: "Mastercard", code: "4853", label: "Cardholder Dispute", confidence: "broad_candidate" },
    ],
    razorpayEvidenceFields: ["shipping_proof", "customer_communication", "term_and_conditions", "others"],
    merchantInstruction: "Preserve product description, condition, quality-control, delivery, return-policy, and customer communication records.",
    source: "Razorpay dispute evidence documentation",
    boundary: "Candidate codes do not decide product condition or a merchant response.",
  },
  return_request: {
    internalReason: "return_request", localLabel: "Return request", externalReadiness: "local_only", networkCandidates: [],
    razorpayEvidenceFields: ["shipping_proof", "customer_communication", "refund_cancellation_policy"],
    merchantInstruction: "Keep return authorization, transit, receipt, and local refund-readiness records separate from any later external dispute.",
    source: "Razorpay dispute evidence documentation",
    boundary: "A return request is a local customer-resolution state, not a network dispute code.",
  },
  refund_issue: {
    internalReason: "refund_issue", localLabel: "Refund not received", externalReadiness: "candidate_mapping",
    networkCandidates: [
      { network: "Visa", code: "13.6", label: "Credit Not Processed", confidence: "direct_candidate" },
      { network: "RuPay", code: "1061", label: "Credit Not Processed", confidence: "direct_candidate" },
    ],
    razorpayEvidenceFields: ["refund_confirmation", "customer_communication", "refund_cancellation_policy", "billing_proof"],
    merchantInstruction: "Preserve refund request, Razorpay-confirmed refund reference, matching amount/date, refund policy, and customer communication.",
    source: "Razorpay dispute evidence documentation",
    boundary: "A prepared local refund is not a confirmed credit. Only the verified Razorpay event establishes a refund outcome.",
  },
  wrong_amount: {
    internalReason: "wrong_amount", localLabel: "Wrong amount", externalReadiness: "awaiting_issuer_reason_code", networkCandidates: [],
    razorpayEvidenceFields: ["billing_proof", "explanation_letter", "customer_communication", "term_and_conditions"],
    merchantInstruction: "Reconcile the order, invoice, Razorpay payment amount, currency, and any adjustment before selecting an issuer reason code.",
    source: "Razorpay dispute evidence documentation",
    boundary: "The local report does not safely identify a network processing-error code without the issuer/Razorpay reason.",
  },
  duplicate_payment: {
    internalReason: "duplicate_payment", localLabel: "Duplicate payment", externalReadiness: "awaiting_issuer_reason_code", networkCandidates: [],
    razorpayEvidenceFields: ["billing_proof", "customer_communication", "explanation_letter", "others"],
    merchantInstruction: "Reconcile distinct payment references, order intent, settlement evidence, and any refund before selecting an issuer reason code.",
    source: "Razorpay dispute evidence documentation",
    boundary: "A customer-reported duplicate is not automatically a duplicate payment or a network code.",
  },
  unauthorized_transaction: {
    internalReason: "unauthorized_transaction", localLabel: "Unauthorized transaction", externalReadiness: "awaiting_issuer_reason_code", networkCandidates: [],
    razorpayEvidenceFields: ["billing_proof", "customer_communication", "access_activity_log", "term_and_conditions", "others"],
    merchantInstruction: "Preserve factual transaction, checkout, account-access, and customer-contact records for human review; do not label the buyer or transaction fraudulent.",
    source: "Razorpay dispute evidence documentation",
    boundary: "Only an issuer/Razorpay reason and human review can determine the relevant fraud or authorization workflow.",
  },
};

export function getReasonCodeMapping(issueType: CustomerIssueType): ReasonCodeMapping {
  return NETWORK_REASON_MAPPINGS[issueType];
}

export function razorpayEvidenceExportSkeleton(issueType: CustomerIssueType) {
  const mapping = getReasonCodeMapping(issueType);
  return Object.fromEntries(mapping.razorpayEvidenceFields.map(field => [field, null])) as Record<RazorpayEvidenceField, null>;
}

export type RazorpayEvidenceExportPreview = {
  mode: "merchant_review_preview";
  internalReason: CustomerIssueType;
  actualReasonCode: null;
  fields: Array<{ field: RazorpayEvidenceField; availability: "merchant_document_present" | "merchant_record_present" | "missing"; source: string }>;
  boundary: string;
};

export function buildRazorpayEvidenceExportPreview(input: { issueType: CustomerIssueType; documentKinds: CustomerDocumentKind[]; paymentObservation: string; refundConfirmed: boolean }): RazorpayEvidenceExportPreview {
  const documentKinds = new Set(input.documentKinds);
  const documentForField: Partial<Record<RazorpayEvidenceField, CustomerDocumentKind>> = {
    shipping_proof: "delivery_or_tracking",
    billing_proof: "payment_confirmation",
    customer_communication: "support_conversation",
    proof_of_service: "delivery_or_tracking",
    others: "other",
  };
  const mapping = getReasonCodeMapping(input.issueType);
  return {
    mode: "merchant_review_preview",
    internalReason: input.issueType,
    actualReasonCode: null,
    fields: mapping.razorpayEvidenceFields.map(field => {
      if (field === "refund_confirmation" && input.refundConfirmed) return { field, availability: "merchant_record_present", source: "webhook-verified refund record" };
      if (field === "billing_proof" && ["api_observed", "webhook_verified", "captured"].includes(input.paymentObservation)) return { field, availability: "merchant_record_present", source: input.paymentObservation === "webhook_verified" ? "webhook-verified payment record" : "API-observed payment record" };
      const matchingDocument = documentForField[field];
      if (matchingDocument && documentKinds.has(matchingDocument)) return { field, availability: "merchant_document_present", source: `protected ${matchingDocument.replaceAll("_", " ")} document` };
      return { field, availability: "missing", source: "no matching merchant-scoped source record" };
    }),
    boundary: "Merchant-review preview only. It uses Razorpay field names to organize current source records, leaves actualReasonCode unset, contains no provider credentials or external action, and must be validated against a permitted Razorpay workflow before provider submission.",
  };
}

export const STANDARD_RAZORPAY_EVIDENCE_FIELDS = STANDARD_RAZORPAY_FIELDS;
