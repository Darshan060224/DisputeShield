export const OPERATIONAL_TELEMETRY_KINDS = ["ollama_validated", "ollama_fallback", "sla_elevated", "evidence_rejected"] as const;
export type OperationalTelemetryKind = (typeof OPERATIONAL_TELEMETRY_KINDS)[number];

const startedAt = new Date();
const counters = new Map<string, Record<OperationalTelemetryKind, number>>();

function merchantCounters(merchantOpenId: string) {
  const existing = counters.get(merchantOpenId);
  if (existing) return existing;
  const created: Record<OperationalTelemetryKind, number> = { ollama_validated: 0, ollama_fallback: 0, sla_elevated: 0, evidence_rejected: 0 };
  counters.set(merchantOpenId, created);
  return created;
}

export function recordOperationalTelemetry(merchantOpenId: string | undefined, kind: OperationalTelemetryKind) {
  if (!merchantOpenId) return;
  merchantCounters(merchantOpenId)[kind] += 1;
}

export function getOperationalTelemetry(merchantOpenId: string) {
  return {
    startedAt,
    counts: { ...merchantCounters(merchantOpenId) },
    boundary: "These are privacy-safe, merchant-scoped counters for the current application process only. They contain no statement text, buyer identity, document content, or provider event and reset when the process restarts. They are not durable production monitoring or alert delivery.",
  };
}

export function resetOperationalTelemetryForTests() {
  counters.clear();
}
