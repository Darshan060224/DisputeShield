export type CustomerReturnTimelineInput = {
  returnReceipt?: {
    carrierName?: string | null;
    trackingReference?: string | null;
    sourceKind?: string | null;
    signatureVerified?: boolean | null;
    receivedAt?: Date | string | null;
  } | null;
  refundRequest?: {
    status?: "prepared" | "merchant_approved" | "razorpay_confirmed" | string | null;
    amountPaise?: number | null;
    currency?: string | null;
    razorpayRefundId?: string | null;
    preparedAt?: Date | string | null;
    approvedAt?: Date | string | null;
    confirmedAt?: Date | string | null;
  } | null;
};

export type CustomerReturnTimelineFact = {
  key: "return_receipt" | "refund_prepared" | "refund_approved" | "refund_confirmed";
  title: string;
  detail: string;
  source: string;
  at: Date | string | null;
};

const humanize = (value: string | null | undefined) => (value || "unknown").replaceAll("_", " ");

export function buildCustomerReturnTimeline(input: CustomerReturnTimelineInput): CustomerReturnTimelineFact[] {
  const facts: CustomerReturnTimelineFact[] = [];
  const receipt = input.returnReceipt;
  if (receipt) {
    const source = receipt.signatureVerified || receipt.sourceKind === "verified_carrier_event"
      ? "Verified carrier event"
      : "Merchant-confirmed delivery-partner record";
    facts.push({
      key: "return_receipt",
      title: "Return receipt recorded",
      detail: `${receipt.carrierName || "Carrier"} · ${receipt.trackingReference || "tracking reference unavailable"} · ${humanize(receipt.sourceKind)}`,
      source,
      at: receipt.receivedAt ?? null,
    });
  }

  const refund = input.refundRequest;
  if (!refund?.status) return facts;
  const amount = typeof refund.amountPaise === "number" ? `₹${(refund.amountPaise / 100).toLocaleString("en-IN")}` : "The local amount";
  if (refund.status === "prepared") {
    facts.push({ key: "refund_prepared", title: "Local refund request prepared", detail: `${amount} is awaiting the required merchant approval phrase; no Razorpay refund was initiated.`, source: "Local merchant workflow · no money moved", at: refund.preparedAt ?? null });
  } else if (refund.status === "merchant_approved") {
    facts.push({ key: "refund_approved", title: "Merchant approved local refund request", detail: `${amount} approval is recorded locally; external confirmation is still pending.`, source: "Merchant approval · no money moved", at: refund.approvedAt ?? null });
  } else if (refund.status === "razorpay_confirmed") {
    facts.push({ key: "refund_confirmed", title: "Razorpay refund confirmed", detail: refund.razorpayRefundId ? `Refund ${refund.razorpayRefundId} was confirmed.` : "A refund was confirmed.", source: "Signed Razorpay refund.processed webhook", at: refund.confirmedAt ?? null });
  }
  return facts;
}
