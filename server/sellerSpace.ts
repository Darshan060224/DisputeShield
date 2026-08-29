export const SELLER_SCENARIOS = [
  "unauthorized_transaction",
  "product_not_received",
  "wrong_amount",
  "duplicate_payment",
  "refund_issue",
] as const;

export type SellerScenarioType = (typeof SELLER_SCENARIOS)[number];

export type SellerRazorpayObservationState = "no_payment_reference" | "api_observation_unavailable" | "api_not_captured" | "api_captured";

export function sellerRazorpayObservationState(input: {
  razorpayPaymentId: string | null;
  apiAvailable: boolean;
  apiCaptured: boolean;
}): SellerRazorpayObservationState {
  if (!input.razorpayPaymentId) return "no_payment_reference";
  if (!input.apiAvailable) return "api_observation_unavailable";
  return input.apiCaptured ? "api_captured" : "api_not_captured";
}

export const scenarioMetadata: Record<SellerScenarioType, { label: string; primary: boolean; claim: string; requiredEvidence: string[] }> = {
  unauthorized_transaction: {
    label: "Unauthorized transaction",
    primary: false,
    claim: "I did not make this payment.",
    requiredEvidence: ["Payment reference", "Customer authentication/support record", "Fulfillment status"],
  },
  product_not_received: {
    label: "Product/service not received",
    primary: true,
    claim: "Payment was made, but the product or service was not delivered.",
    requiredEvidence: ["Payment reference", "Shipment or delivery proof", "Address match", "Refund status"],
  },
  wrong_amount: {
    label: "Wrong amount",
    primary: false,
    claim: "I was charged an incorrect amount.",
    requiredEvidence: ["Product price", "Order total", "Razorpay amount"],
  },
  duplicate_payment: {
    label: "Duplicate payment",
    primary: false,
    claim: "I was charged more than once for the same transaction.",
    requiredEvidence: ["Order reference", "Payment references", "Duplicate-payment comparison"],
  },
  refund_issue: {
    label: "Refund issue",
    primary: false,
    claim: "I expected a refund but have not received it.",
    requiredEvidence: ["Refund request", "Refund reference", "Refund status"],
  },
};

export function recommendSellerScenario(input: { scenarioType: SellerScenarioType; paymentObserved: boolean; fulfillmentState: "unfulfilled" | "packed" | "shipped" | "delivered" | "delivery_exception" }) {
  if (!input.paymentObserved) return { recommendation: "human_review" as const, reason: "Payment confirmation is still missing." };
  if (input.scenarioType === "product_not_received") {
    if (input.fulfillmentState === "delivered") return { recommendation: "contest" as const, reason: "Payment and merchant-recorded delivery evidence are available for review." };
    if (input.fulfillmentState === "delivery_exception") return { recommendation: "do_not_contest" as const, reason: "Merchant delivery evidence records an exception; resolve the customer outcome first." };
    return { recommendation: "human_review" as const, reason: "A delivery scan or proof is still required before contesting a product-not-received claim." };
  }
  return { recommendation: "human_review" as const, reason: "This demonstration scenario requires merchant review of the listed evidence sources." };
}

export function uniqueLatestSellerScenarios<T extends { id: number; sellerOrderId: number; scenarioType: string }>(scenarios: T[]) {
  const seen = new Set<string>();
  return scenarios.filter(scenario => {
    const key = `${scenario.sellerOrderId}:${scenario.scenarioType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function sellerReviewReadiness(input: { paymentObserved: boolean; fulfillmentState: "unfulfilled" | "packed" | "shipped" | "delivered" | "delivery_exception" }) {
  if (!input.paymentObserved) return { score: 0, state: "payment_pending" as const, nextAction: "Confirm the Razorpay payment before reviewing a merchant loss claim." };
  if (input.fulfillmentState === "delivery_exception") return { score: 25, state: "delivery_exception" as const, nextAction: "Resolve the delivery exception or record the customer outcome before contesting the claim." };
  if (input.fulfillmentState !== "delivered") return { score: 25, state: "delivery_proof_missing" as const, nextAction: "Record a delivery milestone and attach the merchant fulfillment note before contesting." };
  return { score: 75, state: "evidence_ready" as const, nextAction: "Review refund status and merchant approval before exporting a response packet." };
}

export function inventoryReservationOutcome(input: { availableQuantity: number; requestedQuantity: number }) {
  if (!Number.isInteger(input.availableQuantity) || !Number.isInteger(input.requestedQuantity) || input.requestedQuantity < 1) {
    return { reserved: false as const, remainingQuantity: input.availableQuantity };
  }
  if (input.availableQuantity < input.requestedQuantity) {
    return { reserved: false as const, remainingQuantity: input.availableQuantity };
  }
  return { reserved: true as const, remainingQuantity: input.availableQuantity - input.requestedQuantity };
}
