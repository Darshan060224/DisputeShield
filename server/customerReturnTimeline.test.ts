import { describe, expect, it } from "vitest";
import { buildCustomerReturnTimeline } from "../client/src/lib/customerReturnTimeline";

describe("customer return and refund timeline", () => {
  it("labels an unsigned merchant receipt without claiming a verified carrier event", () => {
    const facts = buildCustomerReturnTimeline({ returnReceipt: { carrierName: "Carrier", trackingReference: "RET-1", sourceKind: "merchant_confirmed_mobile_record", signatureVerified: false } });
    expect(facts).toEqual([expect.objectContaining({ key: "return_receipt", source: "Merchant-confirmed delivery-partner record" })]);
  });

  it("keeps prepared and merchant-approved refunds local with no money-moved claim", () => {
    for (const status of ["prepared", "merchant_approved"] as const) {
      const fact = buildCustomerReturnTimeline({ refundRequest: { status, amountPaise: 79900 } })[0];
      expect(fact.source).toContain("no money moved");
      expect(fact.detail).toContain("₹799");
    }
  });

  it("labels a confirmed refund as a signed Razorpay webhook fact", () => {
    const fact = buildCustomerReturnTimeline({ refundRequest: { status: "razorpay_confirmed", razorpayRefundId: "rfnd_1" } })[0];
    expect(fact).toMatchObject({ key: "refund_confirmed", source: "Signed Razorpay refund.processed webhook" });
    expect(fact.detail).toContain("rfnd_1");
  });
});
