export function canConfirmRefundFromSignedWebhook(input: { signatureVerified: boolean; eventType: string; requestStatus: string }) {
  return input.signatureVerified && input.eventType === "refund.processed" && input.requestStatus === "merchant_approved";
}
