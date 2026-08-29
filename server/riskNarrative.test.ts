import { describe, expect, it } from "vitest";
import { buildCaseFactSheet, deterministicRiskNarrative, hashCaseFactSheet, RISK_NARRATIVE_PROMPT_VERSION } from "./riskNarrative";

describe("risk narrative safety", () => {
  const input = buildCaseFactSheet({ caseReference: "CASE-HERO-01", paymentState: "Razorpay API observed", fulfilmentState: "delivery exception", evidencePresent: ["support conversation"], evidenceMissing: ["delivery or tracking"], caseAgeHours: 52, slaDeadlineHours: 20, reasonCode: "product_not_received", readinessScore: 40, recommendedOperationalStep: "Request delivery tracking from the merchant record owner.", sourceLabels: ["Razorpay API / payment reference", "Merchant fulfilment / order reference"] });
  it("keeps deterministic fallback fact-cited and non-decisive", () => {
    const narrative = deterministicRiskNarrative(input, "AI unavailable");
    expect(narrative.mode).toBe("deterministic_fallback");
    expect(narrative.citations).toEqual(["Merchant fulfilment / order reference", "Razorpay API / payment reference"]);
    expect(narrative.boundary).toContain("deny a case");
    expect(narrative.summary).toContain("delivery exception");
    expect(narrative.factSheetHash).toBe(hashCaseFactSheet(input));
    expect(narrative.promptVersion).toBe(RISK_NARRATIVE_PROMPT_VERSION);
    expect(input.readinessScore).toBe(40);
    expect(narrative.readinessScore).toBe(40);
    expect(narrative.evidenceMissing).toEqual(["delivery or tracking"]);
  });
});
