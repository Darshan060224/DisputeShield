import { describe, expect, it } from "vitest";
import { inventoryReservationOutcome, recommendSellerScenario, scenarioMetadata, sellerRazorpayObservationState, sellerReviewReadiness, uniqueLatestSellerScenarios } from "./sellerSpace";

describe("Seller Space scenario rules", () => {
  it("keeps product not received as the primary evidence-first scenario", () => {
    expect(scenarioMetadata.product_not_received.primary).toBe(true);
    expect(scenarioMetadata.product_not_received.requiredEvidence).toContain("Shipment or delivery proof");
  });

  it("does not recommend contesting a product-not-received scenario without a recorded delivery", () => {
    expect(recommendSellerScenario({ scenarioType: "product_not_received", paymentObserved: true, fulfillmentState: "shipped" }).recommendation).toBe("human_review");
    expect(recommendSellerScenario({ scenarioType: "product_not_received", paymentObserved: true, fulfillmentState: "delivered" }).recommendation).toBe("contest");
  });

  it("keeps only the latest local review for the same order and claim", () => {
    expect(uniqueLatestSellerScenarios([
      { id: 9, sellerOrderId: 4, scenarioType: "product_not_received" },
      { id: 3, sellerOrderId: 4, scenarioType: "product_not_received" },
      { id: 2, sellerOrderId: 4, scenarioType: "refund_issue" },
    ])).toEqual([
      { id: 9, sellerOrderId: 4, scenarioType: "product_not_received" },
      { id: 2, sellerOrderId: 4, scenarioType: "refund_issue" },
    ]);
  });

  it("prioritizes resolution when a merchant records a delivery exception", () => {
    expect(sellerReviewReadiness({ paymentObserved: true, fulfillmentState: "delivery_exception" })).toEqual({
      score: 25,
      state: "delivery_exception",
      nextAction: "Resolve the delivery exception or record the customer outcome before contesting the claim.",
    });
  });

  it("labels a failed Razorpay read as unavailable instead of implying no capture", () => {
    expect(sellerRazorpayObservationState({ razorpayPaymentId: "pay_1", apiAvailable: false, apiCaptured: false })).toBe("api_observation_unavailable");
    expect(sellerRazorpayObservationState({ razorpayPaymentId: "pay_1", apiAvailable: true, apiCaptured: true })).toBe("api_captured");
    expect(sellerRazorpayObservationState({ razorpayPaymentId: "pay_1", apiAvailable: true, apiCaptured: false })).toBe("api_not_captured");
    expect(sellerRazorpayObservationState({ razorpayPaymentId: null, apiAvailable: false, apiCaptured: false })).toBe("no_payment_reference");
  });

  it("models an inventory reservation as all-or-nothing so a final unit cannot be sold twice", () => {
    expect(inventoryReservationOutcome({ availableQuantity: 1, requestedQuantity: 1 })).toEqual({ reserved: true, remainingQuantity: 0 });
    expect(inventoryReservationOutcome({ availableQuantity: 0, requestedQuantity: 1 })).toEqual({ reserved: false, remainingQuantity: 0 });
    expect(inventoryReservationOutcome({ availableQuantity: 2, requestedQuantity: 3 })).toEqual({ reserved: false, remainingQuantity: 2 });
  });
});
