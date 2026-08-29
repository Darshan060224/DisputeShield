import { describe, expect, it, beforeEach } from "vitest";
import { getOperationalTelemetry, recordOperationalTelemetry, resetOperationalTelemetryForTests } from "./operationalTelemetry";

describe("operational telemetry", () => {
  beforeEach(resetOperationalTelemetryForTests);

  it("keeps process-local operational counters merchant-scoped and content-free", () => {
    recordOperationalTelemetry("merchant-a", "ollama_fallback");
    recordOperationalTelemetry("merchant-a", "sla_elevated");
    recordOperationalTelemetry("merchant-a", "evidence_rejected");
    recordOperationalTelemetry("merchant-b", "ollama_validated");
    expect(getOperationalTelemetry("merchant-a").counts).toEqual({ ollama_validated: 0, ollama_fallback: 1, sla_elevated: 1, evidence_rejected: 1 });
    expect(getOperationalTelemetry("merchant-b").counts).toEqual({ ollama_validated: 1, ollama_fallback: 0, sla_elevated: 0, evidence_rejected: 0 });
    expect(getOperationalTelemetry("merchant-a").boundary).toMatch(/reset when the process restarts/i);
  });
});
