export type ExternalDisputeControlInput = {
  id: string;
  reason?: string;
  reasonCode?: string;
  status?: string;
  phase?: string;
  respondBy?: number;
  evidence?: Record<string, unknown> | null;
};

const knownPhases = new Set(["fraud", "retrieval", "chargeback", "pre_arbitration", "arbitration"]);

export function externalDisputeEvidencePolicy(reasonCode?: string | null, reason?: string | null) {
  const normalized = `${reasonCode ?? ""} ${reason ?? ""}`.toLowerCase().replace(/[_-]+/g, " ");
  if (/(refund|credit not received)/.test(normalized)) return { family: "refund", requiredKinds: ["Payment", "Refund status", "Customer communication"], evidenceHints: ["Refund reference", "Payment reference", "Customer communication"] } as const;
  if (/(duplicate|charged twice)/.test(normalized)) return { family: "duplicate_payment", requiredKinds: ["Payment", "Order reference", "Payment reconciliation"], evidenceHints: ["Payment references", "Order reference", "Reconciliation record"] } as const;
  if (/(unauthori[sz]ed|fraud|cardholder)/.test(normalized)) return { family: "unauthorized_transaction", requiredKinds: ["Payment", "Checkout authentication", "Merchant record"], evidenceHints: ["Payment reference", "Checkout authentication record", "Customer communication"] } as const;
  if (/(amount|overcharg|incorrect charge)/.test(normalized)) return { family: "wrong_amount", requiredKinds: ["Payment", "Order reference", "Invoice"], evidenceHints: ["Payment reference", "Order reference", "Invoice"] } as const;
  if (/(damaged|wrong item|not as described|partial)/.test(normalized)) return { family: "fulfilment_quality", requiredKinds: ["Payment", "Delivery proof", "Item condition"], evidenceHints: ["Delivery proof", "Item-condition record", "Order reference"] } as const;
  return { family: "delivery_or_service", requiredKinds: ["Payment", "Delivery proof", "Address match"], evidenceHints: ["Payment reference", "Delivery proof", "Address or service record"] } as const;
}

export function humanizeExternalDisputeValue(value?: string | null) {
  if (!value) return "Awaiting Razorpay detail";
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

export function buildExternalDisputeControl(input: ExternalDisputeControlInput, now = Date.now()) {
  const deadlineAt = input.respondBy ? new Date(input.respondBy * 1000) : null;
  const hoursToDeadline = deadlineAt ? Math.round((deadlineAt.getTime() - now) / 3_600_000) : null;
  const evidence = input.evidence ?? {};
  const evidenceFields = Object.entries(evidence)
    .filter(([key, value]) => key !== "amount" && value !== null && value !== undefined && (!Array.isArray(value) || value.length > 0))
    .map(([key]) => humanizeExternalDisputeValue(key));
  const phase = knownPhases.has(input.phase ?? "") ? input.phase! : "unclassified";
  const deadlineState = hoursToDeadline === null ? "deadline_unavailable" : hoursToDeadline < 0 ? "deadline_elapsed" : hoursToDeadline <= 24 ? "urgent" : hoursToDeadline <= 72 ? "watch" : "scheduled";
  const evidencePolicy = externalDisputeEvidencePolicy(input.reasonCode, input.reason);

  return {
    externalId: input.id,
    reason: humanizeExternalDisputeValue(input.reasonCode ?? input.reason),
    reasonCode: input.reasonCode ?? null,
    status: input.status ?? "open",
    phase,
    phaseLabel: humanizeExternalDisputeValue(phase),
    deadlineAt,
    deadlineState,
    deadlineLabel: deadlineAt ? deadlineAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Awaiting Razorpay deadline",
    hoursToDeadline,
    evidenceFields,
    evidencePolicy,
    source: "signed Razorpay webhook or Razorpay API observation",
    sourceBoundary: "bank_initiated_external_dispute",
    safeNextStep: `Review ${evidencePolicy.evidenceHints.join(", ")}. Prepare a packet only after a merchant approves it; no external response is submitted automatically.`,
    blockedActions: ["Create a dispute from Customer Space", "Auto-submit a contest", "Auto-accept or refund", "Infer a bank outcome"],
  } as const;
}
