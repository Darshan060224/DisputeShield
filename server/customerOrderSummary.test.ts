import { describe, expect, it } from "vitest";
import { summarizeBuyerOrders } from "./customerOrderSummary";

const at = new Date("2026-08-23T00:00:00.000Z");

function order(overrides: Partial<{
  id: number; merchantOpenId: string; buyerOpenId: string | null; orderReference: string; paymentObservation: "not_started" | "checkout_opened" | "client_confirmed" | "api_observed" | "webhook_verified" | "failed";
}> = {}) {
  return {
    id: 1,
    merchantOpenId: "merchant-a",
    buyerOpenId: "buyer-a",
    orderReference: "CS-A",
    productName: "Bottle",
    quantity: 1,
    totalAmountPaise: 79900,
    currency: "INR",
    paymentObservation: "checkout_opened" as const,
    fulfillmentState: "unfulfilled" as const,
    createdAt: at,
    ...overrides,
  };
}

describe("buyer order-centre summary", () => {
  it("defense-in-depth filters a mixed order result to the authenticated buyer and bound merchant", () => {
    const result = summarizeBuyerOrders({
      merchantOpenId: "merchant-a",
      buyerOpenId: "buyer-a",
      orders: [
        order({ id: 1, orderReference: "CS-A" }),
        order({ id: 2, buyerOpenId: "buyer-b", orderReference: "CS-B" }),
        order({ id: 3, merchantOpenId: "merchant-b", orderReference: "CS-C" }),
        order({ id: 4, buyerOpenId: null, orderReference: "SS-LEGACY" }),
      ],
      cases: [],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ orderReference: "CS-A", paymentSource: "browser_checkout_opened", fulfillmentSource: "merchant_record", localResolution: null });
  });

  it("attaches only the same buyer and merchant local-resolution summary", () => {
    const result = summarizeBuyerOrders({
      merchantOpenId: "merchant-a",
      buyerOpenId: "buyer-a",
      orders: [order({ id: 9, paymentObservation: "client_confirmed" })],
      cases: [
        { sellerOrderId: 9, merchantOpenId: "merchant-a", buyerOpenId: "buyer-a", caseReference: "CASE-OK", issueType: "product_not_received", status: "merchant_review" },
        { sellerOrderId: 9, merchantOpenId: "merchant-a", buyerOpenId: "buyer-b", caseReference: "CASE-OTHER-BUYER", issueType: "return_request", status: "draft" },
        { sellerOrderId: 9, merchantOpenId: "merchant-b", buyerOpenId: "buyer-a", caseReference: "CASE-OTHER-MERCHANT", issueType: "refund_issue", status: "draft" },
      ],
    });

    expect(result[0]).toMatchObject({ paymentSource: "checkout_signature_verified", localResolution: { caseReference: "CASE-OK", source: "local_customer_case" } });
  });

  it("does not upgrade payment source labels beyond the stored observation", () => {
    const result = summarizeBuyerOrders({
      merchantOpenId: "merchant-a",
      buyerOpenId: "buyer-a",
      orders: [
        order({ id: 1, paymentObservation: "not_started" }),
        order({ id: 2, paymentObservation: "checkout_opened" }),
        order({ id: 3, paymentObservation: "api_observed" }),
        order({ id: 4, paymentObservation: "webhook_verified" }),
      ],
      cases: [],
    });

    expect(result.map(item => item.paymentSource)).toEqual([
      "local_order_created",
      "browser_checkout_opened",
      "razorpay_api_observed",
      "signed_razorpay_webhook_verified",
    ]);
  });
});
