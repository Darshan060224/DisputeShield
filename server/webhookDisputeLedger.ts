export function buildVerifiedWebhookLedgerValues(input: { eventId: string; eventType: string; merchantOpenId: string; rawMetadata: string; payload: Record<string, any> }) {
  const dispute = input.payload?.payload?.dispute?.entity;
  const payment = input.payload?.payload?.payment?.entity;
  return {
    eventId: input.eventId,
    eventType: input.eventType,
    merchantOpenId: input.merchantOpenId,
    signatureVerified: true,
    rawMetadata: input.rawMetadata,
    disputeId: Number(String(dispute?.notes?.disputeShieldCaseId ?? payment?.notes?.disputeShieldCaseId ?? "").replace("DSP-", "")) || null,
    externalDisputeId: dispute?.id ? String(dispute.id) : null,
    externalReasonCode: dispute?.reason_code ? String(dispute.reason_code) : null,
    externalPhase: dispute?.phase ? String(dispute.phase) : null,
    externalStatus: dispute?.status ? String(dispute.status) : null,
    externalRespondBy: Number(dispute?.respond_by) || null,
    processedAt: new Date(),
  };
}

export function mergeCommandCentreSources<TWebhook extends { externalId: string }, TLocal, TApi extends { externalId: string }>(webhook: TWebhook[], local: TLocal[], api: TApi[]): Array<TWebhook | TLocal | TApi> {
  const verifiedExternalIds = new Set(webhook.map(item => item.externalId));
  return [...webhook, ...local, ...api.filter(item => !verifiedExternalIds.has(item.externalId))];
}
