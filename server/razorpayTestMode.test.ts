import { describe, expect, it } from "vitest";
import { RAZORPAY_TEST_CARD, RAZORPAY_TEST_NETBANKING, RAZORPAY_TEST_UPI, isRazorpayTestKey, paymentAmountMessage } from "../client/src/lib/razorpayTestMode";

describe("Razorpay test-mode merchant guidance", () => {
  it("uses the documented domestic Mastercard fallback and detects test keys", () => {
    expect(RAZORPAY_TEST_CARD.number).toBe("5267 3181 8797 5449");
    expect(RAZORPAY_TEST_CARD.mockOtp).toContain("4 digits");
    expect(RAZORPAY_TEST_NETBANKING.method).toBe("Netbanking");
    expect(RAZORPAY_TEST_UPI.successId).toBe("success@razorpay");
    expect(isRazorpayTestKey("rzp_test_merchant_123")).toBe(true);
    expect(isRazorpayTestKey("rzp_live_merchant_123")).toBe(false);
  });

  it("prevents an invalid merchant amount from opening hosted checkout", () => {
    expect(paymentAmountMessage(1)).toBeNull();
    expect(paymentAmountMessage(5000)).toBeNull();
    expect(paymentAmountMessage(0)).toContain("₹1 and ₹5,000");
    expect(paymentAmountMessage(Number.NaN)).toContain("₹1 and ₹5,000");
  });
});
