import { describe, expect, it } from "vitest";
import { heldOutSyntheticRiskFixtures, runHeldOutRiskBenchmark } from "./riskBenchmark";

describe("held-out risk benchmark", () => {
  it("computes transparent metrics from 24 fixed scenarios and never presents them as live outcomes", () => {
    const result = runHeldOutRiskBenchmark();
    expect(heldOutSyntheticRiskFixtures).toHaveLength(24);
    expect(result.corpus.status).toBe("synthetic_not_live_not_a_bank_outcome_predictor");
    expect(result.measurements).toHaveLength(2);
    expect(result.measurements.every(metric => metric.precision >= 0 && metric.precision <= 100 && metric.recall >= 0 && metric.recall <= 100)).toBe(true);
    expect(result.measurements.every(metric => metric.f1 >= 0 && metric.f1 <= 100)).toBe(true);
    expect(result.definition).toContain("not a live dispute-wins");
  });
});
