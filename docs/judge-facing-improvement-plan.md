# DisputeShield Judge-Facing Improvement Plan

## Executive Diagnosis

The attached critique is directionally correct: **DisputeShield’s truth boundaries are unusually strong**, but a first-pass judge could mistake the product for a compliance dashboard unless the demo makes the AI advisory work, prevention value, and measurable validation unmistakable.

The core product already has the right foundation: local customer cases are separated from bank disputes; Checkout callbacks are separated from captured-payment facts; external disputes require Razorpay API or signed-webhook provenance; and monetary/external actions remain merchant-gated. This is not a weakness. It is the reason the product is credible for a risk-management track.

The improvement objective is therefore **not** to make DisputeShield more aggressive. It is to make its existing intelligence easier to see, easier to evaluate, and easier to remember.

> **Positioning statement:** DisputeShield prevents avoidable chargeback loss by surfacing missing fulfilment and evidence facts while the merchant can still resolve the customer’s problem locally, then converts verified external disputes into reason-code-specific, merchant-approved evidence work.

## Why the Problem Matters

Chargeback handling is expensive because it combines lost revenue, internal operational work, and third-party costs. Mastercard reports average merchant internal costs of $82 and average external costs of $46 per chargeback in its 2026 research, for an average $128 in non-transaction costs. Mastercard also states that catching disputes earlier, before a formal chargeback, is the most effective way to reduce those costs.[1]

This supports DisputeShield’s prevention thesis. The product should not claim an India-specific saving figure unless it has a reliable India-specific source. Instead, it should say that these figures are **global industry benchmarks** and use them only to frame the operational stakes.[1]

| Judge question | Credible DisputeShield answer |
|---|---|
| Why act before the dispute? | Earlier local resolution can avoid formal chargeback cost and evidence deadline pressure.[1] |
| Why track evidence by reason? | Merchant evidence should directly address the network/acquirer reason code; delivery claims need delivery evidence, for example.[2] |
| Why not automate the contest? | The issuer makes the final decision, and weak evidence or missed deadlines can lose a case by default.[2] |
| Why model operational risk? | Fulfilment gaps, stale evidence, and slow local resolution are prevention signals, not customer fraud conclusions. |

## Current Strengths to Lead With

### 1. Truth hierarchy

The strongest DisputeShield concept is the **truth hierarchy**. It distinguishes created order, Checkout opened, signature verified, API observed, and signed-webhook verified payment states. This is much stronger than a generic “paid/unpaid” label because it tells a merchant what the fact actually proves.

**Demo placement:** Put a compact “Truth Chain” visual directly under the hero-case payment card:

```text
Order created → Checkout signature verified → Razorpay API observed → Signed webhook verified
     request              payment identity              capture observation           delivery provenance
```

### 2. Source-labelled evidence

The Evidence Integrity Graph—Order → Payment → Fulfilment → Evidence → Local Resolution—makes an otherwise dense audit trail visual and demoable. Keep each node labelled as `verified`, `observed`, or `missing`; never colour a missing node as a customer failure.

### 3. Local resolution versus external dispute separation

The product correctly refuses to create a bank dispute from Customer Space. This precisely matches the actual card-dispute flow: the customer contacts an issuing bank, the issuer investigates, the merchant is notified through its acquiring/payment path, and the merchant may then provide evidence.[3]

### 4. Proactive Risk Intelligence

The fulfilment sentinel, evidence-freshness monitor, and SLA recovery board make the product proactive. They should be described as **merchant operations risk signals** rather than “fraud scores.”

## Gaps and Exact Improvements

| Priority | Gap | Improvement | Evidence required | Safety boundary |
|---|---|---|---|---|
| P0 | AI may not be visibly legible to a judge | Add an AI-assisted, fact-cited risk narrative per case | Input facts and each cited source displayed beside output | Advisory only; cannot decide refund/contest/fraud |
| P0 | Feature-tour demo lacks a memorable story | Use one scripted hero case with a counterfactual outcome | Clearly labelled local/synthetic scenario and source state | Never claim a bank dispute was prevented unless proven |
| P1 | Benchmark metrics need a live interpretation | Run a deterministic hold-out evaluation against a documented fixture set | Fixture definitions, exact counts, confusion matrix | Do not fabricate precision/recall |
| P1 | Dense rules hide the product value | Place Truth Chain and Evidence Integrity Graph earlier in the demo | Source labels visible in UI | No unsupported fact claims |
| P2 | Config/limitations may dominate the pitch | Move detailed registry and full flows to appendix; retain one “Verified / awaiting live proof” card | Current integration readiness | Do not hide limitations |

## P0: AI-Assisted Risk Narrative

### Product requirement

For every merchant-visible case, generate a short, plain-language narrative from structured facts already present in DisputeShield:

- Payment state and source.
- Fulfilment state and source.
- Missing evidence.
- Case age / SLA level.
- Refund or return facts.
- External-dispute provenance, if it exists.

### Required output format

```text
AI-assisted summary of verified facts — not a decision

Case <reference> has <payment state/source>, <fulfilment state/source>, and is missing <evidence list>.
The recommended operational next step is <action> because <fact-cited rationale>.

Sources: <source 1> · <source 2> · <source 3>
```

### Non-negotiable controls

1. AI may only use the structured facts supplied to it.
2. Every generated statement must cite the underlying source label.
3. If facts are missing or conflicting, the narrative must say so.
4. It cannot use language such as “fraudulent customer,” “definitely delivered,” “approve refund,” or “contest automatically.”
5. If the AI call is unavailable, the deterministic explanation remains visible and the UI says `AI narrative unavailable; deterministic evidence summary retained`.

This enhancement is suitable for Gemini because the output is explanatory prose, not a financial action. It must be explicitly labelled **AI-assisted** and remain advisory.

## P0: Scripted Hero Case

The best demo is not a nine-tab tour. It is one clear operational story.

### Hero case: missing delivery proof before escalation

| Beat | What the judge sees | Product message |
|---|---|---|
| 1. Purchase | Buyer selects product and official Checkout is opened | Payment is explicit and Razorpay-controlled |
| 2. Delivery problem | Merchant records delivery exception / no trusted tracking proof | A merchant record is not falsely treated as a carrier proof |
| 3. Local issue | Buyer creates local “product not received” case | Local issue is not a bank dispute |
| 4. Sentinel | Reports flags fulfilment risk and evidence freshness gap | System catches the gap while resolution is still possible |
| 5. Evidence graph | Delivery node is missing; payment is observed/verified | Source hierarchy is visual, not hidden in prose |
| 6. Merchant action | Merchant uploads/records the missing factual evidence or resolves locally | Merchant stays in control |
| 7. Counterfactual | Explain that without the evidence task, the merchant would enter any later dispute window with a missing delivery record | A risk prevention claim, not a fabricated saved chargeback |

### Correct final line

> “DisputeShield did not claim to stop a bank dispute. It made the missing delivery fact visible early enough for the merchant to resolve the customer issue or prepare defensible evidence before an external dispute arrived.”

## P1: Measured Evaluation

Do not publish a metric until it is measured from a documented set. The Evaluation Lab should contain:

1. **Scenario count:** number of fixed cases evaluated.
2. **Positive definition:** what counts as a missing-evidence / SLA-risk condition.
3. **Expected result:** source-labelled ground truth in each fixture.
4. **Observed result:** sentinel output.
5. **Confusion matrix:** true positives, false positives, true negatives, false negatives.
6. **Merchant interpretation:** for example, “This metric measures whether the evidence-freshness monitor flags a known missing-evidence fixture before the SLA threshold; it does not predict a bank outcome.”

The current deterministic test suite provides a base, but a separate hold-out fixture corpus is necessary before publishing precision/recall. It must be intentionally authored and versioned; it must not reuse the exact cases used to write the rules.

## P1: Visual Truth Chain

Replace repeated prose warnings with one consistent visual component in the hero case and command centre.

| Layer | Badge | Meaning |
|---|---|---|
| Customer claim | Local | Customer reports an issue; not external proof |
| Merchant record | Observed | Merchant recorded fulfilment/return fact |
| Razorpay API | API observed | Server read-back reports state |
| Razorpay webhook | Signed verified | HMAC/provenance boundary passed |
| Issuer outcome | External confirmed | Only after a verified external source confirms it |

This directly supports Mastercard’s recommendation to organise relevant transaction and delivery evidence in advance and to address the reason code with the right facts.[2]

## Pitch Information Architecture

### Main demo / judge document

1. **Why This Matters:** one industry-benchmark sentence with citation.
2. **Hero case:** the before/after local-resolution story.
3. **Truth Chain:** what each source state proves.
4. **AI-assisted Risk Narrative:** visible, cited, and advisory.
5. **Evidence Integrity Graph:** missing proof becomes obvious.
6. **Merchant control gate:** no automatic money, contest, or bank action.
7. **Verified now / awaiting live proof:** one compact honesty card.

### Appendix

- Complete navigation map.
- Full reason-code evidence matrix.
- Refund and return state machine.
- Webhook replay method.
- Environment and placeholder registry.
- Test inventory and validation evidence.

## What Not to Do

1. Do not create an “automatic chargeback prevention” claim.
2. Do not label a local customer as manipulative or fraudulent.
3. Do not show fake customer reviews, fake win rates, fake Razorpay disputes, or fake money recovered.
4. Do not call a synthetic signed webhook a live Razorpay delivery.
5. Do not publish benchmark numbers without a reproducible fixture corpus.
6. Do not let an LLM issue a refund, approve evidence, submit a contest, or make the external outcome claim.

## Recommended Build Order

1. Implement AI-assisted fact-cited risk narrative with deterministic fallback and safety tests.
2. Add the fixed hold-out evaluation corpus and measure its metrics.
3. Add a single Hero Case view/mode with the Truth Chain and Evidence Integrity Graph.
4. Add a compact judge-facing “verified versus awaiting live proof” card.
5. Update the A-to-Z guide so main pitch content comes first and dense engineering detail follows in appendices.

## References

[1]: https://www.mastercard.com/us/en/news-and-trends/Insights/2025/what-s-the-true-cost-of-a-chargeback-in-2025.html "Mastercard — The true cost of a chargeback"
[2]: https://www.mastercard.com/global/en/news-and-trends/Insights/2024/how-can-merchants-dispute-credit-card-chargebacks.html "Mastercard — How merchants can dispute credit card chargebacks"
[3]: https://corporate.visa.com/en/solutions/acceptance/chargebacks.html "Visa Acceptance Solutions — Chargebacks"
