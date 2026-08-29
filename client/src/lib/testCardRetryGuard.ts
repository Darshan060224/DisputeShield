export type RazorpayCheckoutFailure = {
  error?: { reason?: string; description?: string };
};

const CARD_FAILURE_REASONS = new Set([
  "international_transaction_not_allowed",
  "otp_verification_failed",
  "authentication_failed",
]);

export function shouldLockTestCardRetries(failure: RazorpayCheckoutFailure) {
  return Boolean(failure.error?.reason && CARD_FAILURE_REASONS.has(failure.error.reason));
}

export function testCardRetryLockMessage(failure: RazorpayCheckoutFailure) {
  const reason = failure.error?.reason;
  if (reason === "international_transaction_not_allowed") return "Razorpay rejected this card as international. Continue the same test order with Netbanking instead.";
  if (reason === "otp_verification_failed") return "Razorpay locked card OTP retries for this test order. Continue the same order with Netbanking instead.";
  return "Card retries are paused for this test order. Continue it with Netbanking instead.";
}
