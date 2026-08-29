export type EventFamily = "payment" | "qr" | "refund" | "dispute";

type RazorpayPayload = Record<string, any>;

function notesFrom(payload: RazorpayPayload, family: EventFamily) {
  const entity = family === "payment"
    ? payload?.payload?.payment?.entity
    : family === "qr"
      ? payload?.payload?.qr_code?.entity
      : family === "refund"
        ? payload?.payload?.refund?.entity
        : payload?.payload?.dispute?.entity;
  return entity?.notes ?? {};
}

export function eventFamily(eventType: string): EventFamily | null {
  if (eventType.includes("qr_code")) return "qr";
  if (eventType.includes("refund")) return "refund";
  if (eventType.includes("dispute")) return "dispute";
  if (eventType.includes("payment")) return "payment";
  return null;
}

export function reconcileCaseReference(eventType: string, payload: RazorpayPayload) {
  const family = eventFamily(eventType);
  if (!family) return null;
  const notes = notesFrom(payload, family);
  const caseReference = notes.disputeShieldCaseId ?? notes.caseId ?? notes.dispute_case_id;
  if (typeof caseReference !== "string" || !/^DSP-\d+$/.test(caseReference)) return null;
  return { caseReference, family } as const;
}
