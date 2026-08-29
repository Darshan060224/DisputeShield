import crypto from "node:crypto";

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

type RazorpayError = {
  error?: { code?: string; description?: string; reason?: string };
};

export class RazorpayApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = "RazorpayApiError";
  }
}

export type RazorpayQr = {
  id: string;
  image_url?: string;
  status?: string;
  close_by?: number;
  payment_amount?: number;
  notes?: Record<string, string>;
};

export type RazorpayOrder = { id: string; amount: number; currency: string; receipt?: string; status: string; notes?: Record<string, string> };

type RazorpayCollection<T> = { entity: string; count: number; items?: T[] };
export type RazorpayPayment = { id: string; status: string; amount: number; created_at?: number; order_id?: string; captured?: boolean; method?: string; international?: boolean };
type RazorpayRefund = { id: string; status: string; amount: number; payment_id?: string };
export type RazorpayDispute = { id: string; status?: string; amount?: number; amount_deducted?: number; reason?: string; reason_code?: string; reason_description?: string; payment_id?: string; created_at?: number; respond_by?: number; phase?: string; evidence?: Record<string, unknown> };

function credentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay API credentials are not configured.");
  return Buffer.from(`${keyId}:${keySecret}`).toString("base64");
}

export function getRazorpayCheckoutMode(keyId = process.env.RAZORPAY_KEY_ID): "test" | "live" {
  if (!keyId) throw new Error("Razorpay API credentials are not configured.");
  return keyId.startsWith("rzp_test_") ? "test" : "live";
}

async function razorpayRequest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${RAZORPAY_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${credentials()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    // Dashboard reads must fail fast; the caller renders a conservative unavailable state.
    signal: AbortSignal.timeout(5000),
  });
  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) : {};
  if (!response.ok) {
    const problem = parsed as RazorpayError;
    if (response.status === 404 && path === "/payments/qr_codes") {
      throw new RazorpayApiError(
        "QR evidence is unavailable because Razorpay QR Codes are not enabled for this account. Enable the QR Code API feature in Razorpay before creating QR evidence.",
        response.status,
        path,
      );
    }
    const detail = problem.error?.description ?? problem.error?.reason ?? `Razorpay request failed (${response.status})`;
    throw new RazorpayApiError(detail, response.status, path);
  }
  return parsed as T;
}

export async function listRecentRazorpayPayments() {
  return razorpayRequest<RazorpayCollection<RazorpayPayment>>("/payments?count=1");
}

export async function fetchRazorpayPayment(paymentId: string) {
  return razorpayRequest<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}`);
}

export async function createMerchantPaymentOrder(input: { amountPaise: number; receipt: string; purpose: "merchant_payment" | "evidence_intake"; merchantOpenId: string; sellerOrderReference?: string }) {
  return razorpayRequest<RazorpayOrder>("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: "INR",
      receipt: input.receipt,
      notes: {
        disputeShieldPurpose: input.purpose,
        disputeShieldMerchant: input.merchantOpenId,
        intake: "merchant_controlled",
        ...(input.sellerOrderReference ? { sellerSpaceOrderReference: input.sellerOrderReference } : {}),
      },
    }),
  });
}

export function verifyRazorpayCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }) {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return false;
  const expected = crypto.createHmac("sha256", keySecret).update(`${input.orderId}|${input.paymentId}`).digest("hex");
  if (expected.length !== input.signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(input.signature));
}

export async function getRazorpayAccountSnapshot() {
  const [payments, refunds, disputes] = await Promise.all([
    razorpayRequest<RazorpayCollection<RazorpayPayment>>("/payments?count=100"),
    razorpayRequest<RazorpayCollection<RazorpayRefund>>("/refunds?count=100"),
    razorpayRequest<RazorpayCollection<RazorpayDispute>>("/disputes?count=100"),
  ]);
  const paymentItems = payments.items ?? [];
  const refundItems = refunds.items ?? [];
  const disputeItems = disputes.items ?? [];
  const captured = paymentItems.filter(item => item.status === "captured");
  const processedRefunds = refundItems.filter(item => item.status === "processed");
  const failed = paymentItems.filter(item => item.status === "failed");
  const openDisputes = disputeItems.filter(item => item.status === "open");
  const underReviewDisputes = disputeItems.filter(item => item.status === "under_review");
  return {
    scope: "latest_100_records",
    collectedAmount: captured.reduce((sum, item) => sum + item.amount, 0) / 100,
    capturedPayments: captured.length,
    refundAmount: processedRefunds.reduce((sum, item) => sum + item.amount, 0) / 100,
    processedRefunds: processedRefunds.length,
    disputedAmount: disputeItems.reduce((sum, item) => sum + (item.amount ?? 0), 0) / 100,
    openDisputes: openDisputes.length,
    underReviewDisputes: underReviewDisputes.length,
    failedPayments: failed.length,
  };
}

export async function listLiveProductNotReceivedDisputes() {
  const disputes = await razorpayRequest<RazorpayCollection<RazorpayDispute>>("/disputes?count=100");
  return (disputes.items ?? []).filter(dispute => {
    const reason = `${dispute.reason ?? ""} ${dispute.reason_code ?? ""}`.replace(/[_-]/g, " ").toLowerCase();
    return reason.includes("product not received");
  });
}

export async function listLiveRazorpayDisputes() {
  const disputes = await razorpayRequest<RazorpayCollection<RazorpayDispute>>("/disputes?count=100");
  return disputes.items ?? [];
}

export async function createCaseEvidenceQr(input: { caseId: string; amountRupees: number; orderId: string }) {
  const now = Math.floor(Date.now() / 1000);
  const requestId = crypto.randomUUID();
  return razorpayRequest<RazorpayQr>("/payments/qr_codes", {
    method: "POST",
    body: JSON.stringify({
      type: "upi_qr",
      name: "DisputeShield evidence verification",
      usage: "single_use",
      fixed_amount: true,
      payment_amount: Math.round(input.amountRupees * 100),
      description: `Evidence verification for ${input.caseId}`,
      close_by: now + 3600,
      notes: {
        disputeShieldCaseId: input.caseId,
        disputeShieldOrderId: input.orderId,
        disputeShieldRequestId: requestId,
        purpose: "payment_evidence_verification",
      },
    }),
  });
}

export async function fetchQrEvidence(qrId: string) {
  return razorpayRequest<RazorpayQr>(`/payments/qr_codes/${encodeURIComponent(qrId)}`);
}

export async function fetchQrPayments(qrId: string) {
  return razorpayRequest<{ entity: string; count: number; items: Array<{ id: string; status: string; amount: number }> }>(`/payments/qr_codes/${encodeURIComponent(qrId)}/payments`);
}

export async function fetchRefundEvidence(refundId: string) {
  return razorpayRequest<{ id: string; payment_id: string; amount: number; status: string }>(`/refunds/${encodeURIComponent(refundId)}`);
}
