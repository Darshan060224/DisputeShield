export function pendingWebhookAction(type?: string, signatureVerified?: boolean) {
  if (!type || !signatureVerified) return "Await a signed Razorpay delivery";
  if (type === "payment.captured") return "Reconcile capture to payment intake";
  if (type === "refund.processed") return "Reconcile refund outcome";
  if (type.startsWith("payment.dispute.")) return "Review evidence before packet preparation";
  return "Review event provenance";
}
