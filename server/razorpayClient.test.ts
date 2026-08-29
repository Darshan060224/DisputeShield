import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { createCaseEvidenceQr, createMerchantPaymentOrder, fetchQrEvidence, fetchQrPayments, fetchRefundEvidence, fetchRazorpayPayment, getRazorpayAccountSnapshot, getRazorpayCheckoutMode, listLiveProductNotReceivedDisputes, listRecentRazorpayPayments, verifyRazorpayCheckoutSignature } from "./razorpayClient";

describe("Razorpay API client", () => {
  beforeEach(() => {
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_unit_key");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "test_secret_for_unit_tests");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("creates a single-use QR request carrying a trusted DisputeShield case reference", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "qr_1", status: "active", image_url: "https://example.invalid/qr" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createCaseEvidenceQr({ caseId: "DSP-1048", amountRupees: 2499, orderId: "ORD-90821" });

    expect(result.id).toBe("qr_1");
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.razorpay.com/v1/payments/qr_codes");
    expect(request.method).toBe("POST");
    const body = JSON.parse(String(request.body));
    expect(body).toMatchObject({ type: "upi_qr", usage: "single_use", fixed_amount: true, payment_amount: 249900 });
    expect(body.notes.disputeShieldCaseId).toBe("DSP-1048");
    expect(body.notes.disputeShieldOrderId).toBe("ORD-90821");
  });

  it("uses encoded read-only endpoints for QR and refund evidence retrieval", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ id: "resource" }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    await fetchQrEvidence("qr/one");
    await fetchQrPayments("qr/one");
    await fetchRefundEvidence("rfnd/one");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.razorpay.com/v1/payments/qr_codes/qr%2Fone",
      "https://api.razorpay.com/v1/payments/qr_codes/qr%2Fone/payments",
      "https://api.razorpay.com/v1/refunds/rfnd%2Fone",
    ]);
  });

  it("retrieves a payment by encoded ID for read-only ledger reconciliation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "pay_1", status: "captured", captured: true, amount: 100 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchRazorpayPayment("pay/one")).resolves.toMatchObject({ status: "captured", captured: true });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.razorpay.com/v1/payments/pay%2Fone");
  });

  it("returns a safe all-zero snapshot when Razorpay sends empty collections without items", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ entity: "collection", count: 0 }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getRazorpayAccountSnapshot()).resolves.toMatchObject({ collectedAmount: 0, capturedPayments: 0, refundAmount: 0, processedRefunds: 0, disputedAmount: 0, openDisputes: 0, underReviewDisputes: 0, failedPayments: 0 });
    await expect(listLiveProductNotReceivedDisputes()).resolves.toEqual([]);
  });

  it("surfaces a Razorpay API rejection for the dashboard attention state", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { description: "Authentication failed" } }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listRecentRazorpayPayments()).rejects.toThrow("Authentication failed");
  });

  it("explains an unavailable QR capability without exposing a misleading route-not-found error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { description: "The requested URL was not found on the server." } }), { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createCaseEvidenceQr({ caseId: "DSP-live-123", amountRupees: 2499, orderId: "order_live_123" })).rejects.toThrow("Razorpay QR Codes are not enabled for this account");
  });

  it("creates a merchant-controlled Razorpay order with trusted intake notes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "order_1", amount: 12500, currency: "INR", status: "created" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const order = await createMerchantPaymentOrder({ amountPaise: 12500, receipt: "ds_receipt_1", purpose: "merchant_payment", merchantOpenId: "merchant_1" });

    expect(order).toMatchObject({ id: "order_1", amount: 12500, currency: "INR" });
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.razorpay.com/v1/orders");
    expect(request.method).toBe("POST");
    expect(JSON.parse(String(request.body))).toMatchObject({ amount: 12500, currency: "INR", receipt: "ds_receipt_1", notes: { disputeShieldPurpose: "merchant_payment", disputeShieldMerchant: "merchant_1", intake: "merchant_controlled" } });
  });

  it("accepts only a valid server-side Razorpay checkout signature", () => {
    const secret = process.env.RAZORPAY_KEY_SECRET!;
    const orderId = "order_1";
    const paymentId = "pay_1";
    const signature = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
    expect(verifyRazorpayCheckoutSignature({ orderId, paymentId, signature })).toBe(true);
    const invalidSignature = `${signature[0] === "0" ? "1" : "0"}${signature.slice(1)}`;
    expect(verifyRazorpayCheckoutSignature({ orderId, paymentId, signature: invalidSignature })).toBe(false);
  });

  it("identifies test and live Razorpay public keys for merchant checkout guidance", () => {
    expect(getRazorpayCheckoutMode("rzp_test_checkout_123")).toBe("test");
    expect(getRazorpayCheckoutMode("rzp_live_checkout_123")).toBe("live");
  });
});
