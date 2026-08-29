import { buildProactiveRiskIntelligence, type ProactiveRiskCase } from "./proactiveRiskIntelligence";

type Fixture = ProactiveRiskCase & { expectedFulfilmentIntervention: boolean; expectedEvidenceGap: boolean };
const at = new Date("2026-08-24T00:00:00.000Z");
const scenario = (caseReference: string, issueType: ProactiveRiskCase["issueType"], fulfilmentState: ProactiveRiskCase["fulfilmentState"], documentKinds: ProactiveRiskCase["documentKinds"], expectedFulfilmentIntervention: boolean, expectedEvidenceGap: boolean, ageHours = 12): Fixture => ({ caseReference, issueType, fulfilmentState, documentKinds, expectedFulfilmentIntervention, expectedEvidenceGap, createdAt: new Date(at.getTime() - (ageHours + 3) * 3_600_000), updatedAt: new Date(at.getTime() - ageHours * 3_600_000), status: "merchant_review", hasUnreviewedExtraction: false, paymentObservation: "api_observed", returnReceiptRecorded: false, refundConfirmed: false });

// These scenarios are authored, source-free regression fixtures. They are separate
// from production data and must never be presented as live merchant or bank results.
export const heldOutSyntheticRiskFixtures: Fixture[] = [
  scenario("HO-01", "product_not_received", "delivery_exception", [], true, true), scenario("HO-02", "product_not_received", "unfulfilled", [], true, true), scenario("HO-03", "product_not_received", "delivered", ["delivery_or_tracking", "support_conversation"], false, false), scenario("HO-04", "partial_delivery", "delivery_exception", ["delivery_or_tracking"], true, true),
  scenario("HO-05", "partial_delivery", "delivered", ["delivery_or_tracking", "item_condition"], false, false), scenario("HO-06", "damaged_or_wrong_item", "shipped", ["item_condition"], false, true), scenario("HO-07", "damaged_or_wrong_item", "delivered", ["item_condition", "delivery_or_tracking"], false, false), scenario("HO-08", "return_request", "delivered", [], false, true),
  scenario("HO-09", "return_request", "delivered", ["item_condition"], false, false), scenario("HO-10", "refund_issue", "delivered", ["payment_confirmation"], false, true), scenario("HO-11", "refund_issue", "delivered", ["payment_confirmation", "support_conversation"], false, false), scenario("HO-12", "wrong_amount", "delivered", [], false, true),
  scenario("HO-13", "wrong_amount", "delivered", ["payment_confirmation"], false, false), scenario("HO-14", "duplicate_payment", "packed", [], false, true), scenario("HO-15", "duplicate_payment", "delivered", ["payment_confirmation"], false, false), scenario("HO-16", "unauthorized_transaction", "unfulfilled", ["payment_confirmation"], false, true),
  scenario("HO-17", "unauthorized_transaction", "delivered", ["payment_confirmation", "support_conversation"], false, false), scenario("HO-18", "product_not_received", "shipped", ["delivery_or_tracking"], false, true), scenario("HO-19", "product_not_received", "shipped", ["delivery_or_tracking", "support_conversation"], false, false), scenario("HO-20", "partial_delivery", "packed", [], false, true),
  scenario("HO-21", "damaged_or_wrong_item", "delivery_exception", [], true, true), scenario("HO-22", "return_request", "delivery_exception", ["item_condition"], true, false), scenario("HO-23", "refund_issue", "delivery_exception", ["payment_confirmation", "support_conversation"], true, false), scenario("HO-24", "wrong_amount", "delivery_exception", [], true, true),
];

type Counts = { truePositive: number; falsePositive: number; trueNegative: number; falseNegative: number };
const measure = (predictions: boolean[], expected: boolean[]): Counts => predictions.reduce<Counts>((counts, predicted, index) => { const label = expected[index]; if (predicted && label) counts.truePositive++; else if (predicted) counts.falsePositive++; else if (label) counts.falseNegative++; else counts.trueNegative++; return counts; }, { truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0 });
const score = ({ truePositive, falsePositive, falseNegative }: Counts) => {
  const precision = Math.round((truePositive / Math.max(truePositive + falsePositive, 1)) * 100);
  const recall = Math.round((truePositive / Math.max(truePositive + falseNegative, 1)) * 100);
  const f1 = precision + recall === 0 ? 0 : Math.round((2 * precision * recall) / (precision + recall));
  return { precision, recall, f1 };
};

export function runHeldOutRiskBenchmark() {
  const output = buildProactiveRiskIntelligence(heldOutSyntheticRiskFixtures, at);
  const fulfilmentPredictions = heldOutSyntheticRiskFixtures.map(item => output.signals.some(signal => signal.caseReference === item.caseReference && signal.title === "Fulfilment Risk Sentinel"));
  const evidencePredictions = heldOutSyntheticRiskFixtures.map(item => output.freshness.find(row => row.caseReference === item.caseReference)?.missing.length !== 0);
  const fulfilment = measure(fulfilmentPredictions, heldOutSyntheticRiskFixtures.map(item => item.expectedFulfilmentIntervention));
  const evidenceGap = measure(evidencePredictions, heldOutSyntheticRiskFixtures.map(item => item.expectedEvidenceGap));
  return { corpus: { name: "Synthetic held-out regression corpus", scenarioCount: heldOutSyntheticRiskFixtures.length, version: "2026-08-24.1", status: "synthetic_not_live_not_a_bank_outcome_predictor" as const }, measurements: [{ target: "Fulfilment intervention signal", ...score(fulfilment), confusionMatrix: fulfilment }, { target: "Evidence-gap detection", ...score(evidenceGap), confusionMatrix: evidenceGap }], definition: "Each metric is computed against fixed, author-labelled synthetic scenarios that are excluded from production merchant data. It measures deterministic rule agreement only; it is not a live dispute-wins, fraud, customer-intent, or financial-outcome claim." };
}
