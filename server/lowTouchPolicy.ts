export type LowTouchInput = {
  source: "customer_local_case" | "signed_webhook_verified" | "razorpay_api_observed" | "merchant_record";
  evidenceComplete: boolean;
  ocrNeedsConfirmation: boolean;
  paymentTrusted: boolean;
  externalDispute: boolean;
  refundRequested: boolean;
};

export type LowTouchOutput = {
  automatedSteps: string[];
  exceptionQueue: string[];
  humanGates: string[];
  canPreparePacket: boolean;
};

export function evaluateLowTouchWorkflow(input: LowTouchInput): LowTouchOutput {
  const automatedSteps = [
    "Match the case to the merchant order and payment reference",
    "Classify the issue reason and source provenance",
    "Detect missing evidence and update the exception queue",
  ];
  const exceptionQueue: string[] = [];
  const humanGates: string[] = [];

  if (input.ocrNeedsConfirmation) humanGates.push("Customer must confirm or reject OCR candidate facts");
  if (!input.evidenceComplete) exceptionQueue.push("Evidence packet incomplete");
  if (!input.paymentTrusted) exceptionQueue.push("Trusted Razorpay payment fact required");
  if (input.externalDispute && input.source !== "signed_webhook_verified") exceptionQueue.push("Signed Razorpay dispute event required before external packet preparation");
  if (input.externalDispute) humanGates.push("Merchant must review and approve any external dispute response");
  if (input.refundRequested) humanGates.push("Merchant must approve any refund action; no automatic refund");

  if (input.evidenceComplete && input.paymentTrusted && (!input.externalDispute || input.source === "signed_webhook_verified")) {
    automatedSteps.push("Prepare a verified-facts-only evidence packet for merchant review");
  }

  return {
    automatedSteps,
    exceptionQueue: Array.from(new Set(exceptionQueue)),
    humanGates: Array.from(new Set(humanGates)),
    canPreparePacket: input.evidenceComplete && input.paymentTrusted && (!input.externalDispute || input.source === "signed_webhook_verified"),
  };
}
