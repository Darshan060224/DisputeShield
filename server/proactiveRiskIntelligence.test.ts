import { describe, expect, it } from "vitest";
import { buildProactiveRiskIntelligence } from "./proactiveRiskIntelligence";

describe("proactive risk intelligence", () => {
  const now = new Date("2026-08-25T00:00:00.000Z");
  const baseline = { caseReference: "CASE-1", issueType: "product_not_received" as const, status: "merchant_review" as const, createdAt: new Date("2026-08-20T00:00:00.000Z"), updatedAt: new Date("2026-08-21T00:00:00.000Z"), documentKinds: [] as any[], hasUnreviewedExtraction: true, paymentObservation: "api_observed" as const, fulfilmentState: "delivery_exception" as const, returnReceiptRecorded: false, refundConfirmed: false };
  it("detects fulfilment, evidence freshness, and SLA risk with cited local sources", () => {
    const result = buildProactiveRiskIntelligence([baseline], now);
    expect(result.signals.map(item => item.title)).toContain("Fulfilment Risk Sentinel");
    expect(result.signals.map(item => item.title)).toContain("Evidence Freshness Monitor");
    expect(result.slaBoard[0]).toMatchObject({ level: "elevated", owner: "merchant" });
    expect(result.freshness[0].missing).toContain("delivery or tracking");
  });
  it("builds a source-labelled integrity graph and has no authority over money or external disputes", () => {
    const result = buildProactiveRiskIntelligence([baseline], now);
    expect(result.graph[0].nodes.map(item => item.label)).toEqual(["Order", "Payment", "Fulfilment", "Evidence", "Local resolution"]);
    expect(result.boundary).toContain("cannot deny a case");
    expect(result.outcomeLearning).toMatchObject({ externalOutcomeRecords: 0, status: "awaiting_merchant_confirmed_external_outcomes" });
  });
});
