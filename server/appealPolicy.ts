import type { EvidenceRow } from "./disputeEngine";

export const APPEAL_CLAIM_TYPES = [
  "unauthorized_transaction",
  "product_not_received",
  "wrong_amount",
  "duplicate_payment",
  "refund_issue",
] as const;

export type AppealClaimType = (typeof APPEAL_CLAIM_TYPES)[number];

type PolicyResult = {
  score: number;
  rawScore: number;
  conflictPenalty: number;
  decision: "prepare_contest" | "prepare_customer_resolution" | "human_review";
  reason: string;
  automatedSteps: string[];
  blockedExternalActions: string[];
  approvalRequired: true;
  missingEvidence: string[];
};

const claimRequirements: Record<AppealClaimType, { required: Array<{ kind: string; weight: number }>; threshold: number }> = {
  product_not_received: { required: [{ kind: "Payment", weight: 35 }, { kind: "Delivery proof", weight: 40 }, { kind: "Address match", weight: 25 }], threshold: 80 },
  unauthorized_transaction: { required: [{ kind: "Payment", weight: 40 }, { kind: "Customer authentication", weight: 35 }, { kind: "Fulfillment status", weight: 25 }], threshold: 85 },
  wrong_amount: { required: [{ kind: "Product price", weight: 30 }, { kind: "Order total", weight: 30 }, { kind: "Payment", weight: 40 }], threshold: 85 },
  duplicate_payment: { required: [{ kind: "Order reference", weight: 20 }, { kind: "Payment references", weight: 45 }, { kind: "Duplicate-payment comparison", weight: 35 }], threshold: 90 },
  refund_issue: { required: [{ kind: "Refund request", weight: 25 }, { kind: "Refund reference", weight: 35 }, { kind: "Refund status", weight: 40 }], threshold: 85 },
};

function rowFor(claims: EvidenceRow[], kind: string) {
  return claims.find(claim => claim.kind.toLowerCase() === kind.toLowerCase());
}

export function evaluateAppealPolicy(input: { claimType: AppealClaimType; claims: EvidenceRow[]; fulfillmentState?: string }): PolicyResult {
  const policy = claimRequirements[input.claimType];
  const missingEvidence = policy.required.filter(requirement => !rowFor(input.claims, requirement.kind)?.verified).map(requirement => requirement.kind);
  const rawScore = policy.required.reduce((total, requirement) => total + (rowFor(input.claims, requirement.kind)?.verified ? requirement.weight : 0), 0);
  const conflicts = input.claims.filter(claim => claim.kind.toLowerCase().includes("conflict") || claim.claim.toLowerCase().includes("conflict"));
  const conflictPenalty = Math.min(40, conflicts.length * 20);
  const score = Math.max(0, rawScore - conflictPenalty);
  const conflict = conflicts[0];
  const fullRefund = input.claims.find(claim => claim.kind === "Refund" && claim.verified && claim.claim.toLowerCase().includes("full"));
  const deliveryException = input.claimType === "product_not_received" && input.fulfillmentState === "delivery_exception";
  const automatedSteps = ["Refresh linked Razorpay facts", "Collect available merchant evidence", "Prepare a verified-facts-only draft", "Create merchant review task"];
  const blockedExternalActions = ["Submit a dispute response", "Issue or approve a refund", "Send an external appeal"];

  if (fullRefund) return { score, rawScore, conflictPenalty, decision: "prepare_customer_resolution", reason: "A verified full refund is present; prepare a customer-resolution review instead of contesting.", automatedSteps, blockedExternalActions, approvalRequired: true, missingEvidence };
  if (deliveryException) return { score, rawScore, conflictPenalty, decision: "prepare_customer_resolution", reason: "A merchant delivery exception is recorded; resolve the customer outcome before considering a contest.", automatedSteps, blockedExternalActions, approvalRequired: true, missingEvidence };
  if (conflict) return { score, rawScore, conflictPenalty, decision: "human_review", reason: `Conflicting evidence applied a ${conflictPenalty}-point policy penalty. Automation can prepare the packet, but a merchant must resolve the conflict.`, automatedSteps, blockedExternalActions, approvalRequired: true, missingEvidence };
  if (score >= policy.threshold) return { score, rawScore, conflictPenalty, decision: "prepare_contest", reason: "Required evidence meets the policy threshold. A contest packet may be prepared, but merchant approval is still mandatory.", automatedSteps, blockedExternalActions, approvalRequired: true, missingEvidence };
  return { score, rawScore, conflictPenalty, decision: "human_review", reason: "Required evidence is incomplete. Automation will collect and prepare facts only; it will not submit or resolve the case.", automatedSteps, blockedExternalActions, approvalRequired: true, missingEvidence };
}

export function canReleaseAppealPacket(policy: PolicyResult) {
  return policy.decision === "prepare_contest" && policy.missingEvidence.length === 0 && policy.approvalRequired;
}
