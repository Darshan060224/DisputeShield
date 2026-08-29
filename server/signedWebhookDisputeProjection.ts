export type SignedWebhookDisputeRecord = {
  eventId: string;
  eventType: string;
  merchantOpenId: string;
  signatureVerified: boolean;
  externalDisputeId: string | null;
  externalReasonCode: string | null;
  externalPhase: string | null;
  externalStatus: string | null;
  externalRespondBy: number | null;
  rawMetadata: string;
};

export type SignedWebhookDisputeProjection = SignedWebhookDisputeRecord & {
  dispute: Record<string, unknown>;
  payment: Record<string, unknown>;
};

export function projectLatestSignedWebhookDisputes(records: SignedWebhookDisputeRecord[], merchantOpenId: string): SignedWebhookDisputeProjection[] {
  const latestByDispute = new Map<string, SignedWebhookDisputeProjection>();
  for (const record of records) {
    if (record.merchantOpenId !== merchantOpenId || !record.signatureVerified || !record.eventType.startsWith("payment.dispute.") || !record.externalDisputeId || latestByDispute.has(record.externalDisputeId)) continue;
    let raw: any = {};
    try { raw = JSON.parse(record.rawMetadata); } catch { continue; }
    latestByDispute.set(record.externalDisputeId, { ...record, dispute: raw?.payload?.dispute?.entity ?? {}, payment: raw?.payload?.payment?.entity ?? {} });
  }
  return Array.from(latestByDispute.values());
}
