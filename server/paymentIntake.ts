export type PaymentIntakeMetricRow = {
  amountPaise: number;
  status: "created" | "checkout_opened" | "client_confirmed" | "captured" | "failed" | "verification_failed";
};

export type PaymentIntakeStatus = PaymentIntakeMetricRow["status"];

export function summarizeWebhookVerifiedIntakes(rows: PaymentIntakeMetricRow[]) {
  const captured = rows.filter(row => row.status === "captured");
  return {
    verifiedCapturedPayments: captured.length,
    verifiedCollectedAmount: captured.reduce((sum, row) => sum + row.amountPaise, 0) / 100,
  };
}

export function shouldCreatePaymentEvidence(input: { eventType: string; signatureVerified: boolean }) {
  return input.eventType === "payment.captured" && input.signatureVerified;
}

export function checkoutVerificationTransition(signatureVerified: boolean): { status: PaymentIntakeStatus; createsEvidence: false } {
  return { status: signatureVerified ? "client_confirmed" : "verification_failed", createsEvidence: false };
}

export function verifiedWebhookCaptureTransition(input: { eventType: string; signatureVerified: boolean }): { status: PaymentIntakeStatus | null; createsEvidence: boolean } {
  if (!shouldCreatePaymentEvidence(input)) return { status: null, createsEvidence: false };
  return { status: "captured", createsEvidence: true };
}
