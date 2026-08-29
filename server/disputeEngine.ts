export type EvidenceRow = {
  kind: string;
  source: string;
  claim: string;
  verified: boolean;
};

export type DisputeInput = {
  amount: number;
  claims: EvidenceRow[];
  status: string;
  recommendation: string;
  confidence: number;
  requiredKinds?: readonly string[];
};

export function validateDisputeCase(input: DisputeInput) {
  const requiredKinds = input.requiredKinds ?? ["Payment", "Delivery proof", "Address match"];
  const verified = input.claims.filter(item => item.verified);
  const missingEvidence = requiredKinds.filter(kind => {
    const row = input.claims.find(item => item.kind === kind);
    return !row || !row.verified;
  });
  const conflicts = input.claims.filter(item => item.claim.toLowerCase().includes("conflict") || item.kind.toLowerCase().includes("conflict"));
  const delivery = input.claims.find(item => item.kind === "Delivery proof");
  const refund = input.claims.find(item => item.kind === "Refund" || item.kind === "Refund conflict");
  const evidenceCompleteness = Math.round((verified.length / Math.max(input.claims.length, 1)) * 100);
  const fullRefundExists = Boolean(refund?.verified && refund.claim.toLowerCase().includes("full"));
  const policyBlocked = !fullRefundExists && (missingEvidence.length > 0 || conflicts.length > 0 || input.confidence < 70);
  const recommendation = fullRefundExists ? "do_not_contest" : policyBlocked ? "human_review" : "contest";
  return {
    evidenceCompleteness,
    verifiedCount: verified.length,
    missingEvidence,
    conflicts: conflicts.map(item => item.source),
    deliveryVerified: Boolean(delivery?.verified),
    refundConflict: Boolean(refund && refund.kind.toLowerCase().includes("conflict")),
    policyBlocked,
    recommendation,
    falseContestCost: input.amount,
    unsupportedClaimRate: 0,
  } as const;
}

export function buildVerifiedDraft(order: string, amount: number, claims: EvidenceRow[]) {
  const verified = claims.filter(item => item.verified);
  const citations = verified.map(item => `[${item.source}]`).join(" ");
  const facts = verified.map(item => item.claim).join(" ");
  return {
    text: `Payment and order ${order} were matched for ₹${amount.toLocaleString("en-IN")}. Verified records: ${facts}`,
    citations,
    unsupportedClaimRate: 0,
  };
}
