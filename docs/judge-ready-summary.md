# DisputeShield: Judge-Ready Summary

## Why This Matters

DisputeShield is a **defence-only AI Risk Manager** for Razorpay merchants. It focuses on the operational facts that can increase chargeback exposure before an external dispute arrives: fulfilment gaps, stale evidence, unclear payment provenance, and slow local resolution. Mastercard reports that chargeback handling includes internal and third-party costs, and describes early resolution as a way to reduce chargeback exposure. These figures are global industry context only; DisputeShield does **not** claim an India-specific saving, a merchant ROI, or a prevented chargeback.[1]

> **Product promise:** Make the missing fact visible early, route the next safe operational task, and prepare source-labelled evidence without allowing AI to move money or represent an issuer decision.

## Target Segment and Positioning

DisputeShield is designed first for **Indian D2C catalog merchants with delivery and return-heavy fulfilment operations**, such as apparel, footwear, and home-goods sellers. This is a product focus, not a claim about the prevalence of any reason code in the market. The product concentrates on product-not-received, return, refund-delay, wrong-amount, duplicate-payment, and unauthorized-transaction workflows because each requires a different evidence trail and a merchant-controlled response.

| Position | Operational focus | What DisputeShield deliberately does not do |
| --- | --- | --- |
| Traditional post-dispute automation | Assemble and submit chargeback responses after a dispute arrives. Commercial providers describe end-to-end chargeback automation and recovery services.[4] | DisputeShield does not auto-submit a contest or claim to recover a chargeback. |
| Generic fraud scoring | Predict or classify risky customers or transactions. | DisputeShield does not profile buyers, assign fault, or use fraud labels in its advisory narrative. |
| **DisputeShield** | Surface missing fulfilment, payment-provenance, return, and support facts before or during a merchant-controlled resolution workflow. | It does not convert a local complaint into a bank dispute, payment capture, refund, or issuer outcome. |

This positioning is intentionally narrow. Chargeback-management software can span response automation, alerts, analytics, and fraud controls; DisputeShield differentiates through **pre-dispute evidence-gap prevention with merchant control**, not by claiming superior recovery or win rates.[5]

| Judge question | DisputeShield answer |
| --- | --- |
| What does it prevent? | It flags missing fulfilment and evidence facts while a merchant can still resolve a customer issue locally. It does not claim to stop a bank dispute. |
| What makes it AI? | A server-side, AI-assisted narrative turns structured, merchant-scoped facts into a cited explanation. It is advisory and falls back deterministically if unavailable. |
| What can it automate? | Evidence-gap identification, SLA prioritisation, source labelling, packet preparation, and safe reminders. |
| What remains human-gated? | Refund approval, contest preparation/submission, external response, and all financial or issuer-outcome assertions. |

## The Hero Case

The recommended demonstration is one **scripted local scenario**, labelled synthetic and not submitted: a buyer reports a product not received issue after the merchant has recorded a delivery exception but lacks trusted delivery proof. The fulfilment sentinel and evidence-freshness monitor make the missing tracking fact visible. The merchant can then reconcile fulfilment evidence or resolve the local issue.

| Beat | What is shown | What it proves |
| --- | --- | --- |
| Purchase context | Merchant order and Checkout boundary | An order reference exists; Checkout is controlled by Razorpay. |
| Delivery exception | Merchant fulfilment record | A merchant record is an observation, not carrier proof. |
| Local issue | Customer Space case | A local issue is not an external bank or Razorpay dispute. |
| Risk intervention | Sentinel plus evidence monitor | Missing proof is surfaced as an operations task, not a customer-intent score. |
| Merchant gate | Evidence/review action | A human remains responsible for any resolution or external action. |

> **Counterfactual wording:** Without a task to reconcile the delivery record, the merchant could enter a later external-dispute window with missing proof. DisputeShield does not claim a bank dispute was prevented.

## Truth Chain

The interface repeats the same visual Truth Chain in the hero case and command centre, instead of relying on vague “paid” labels.

| Layer | Status | Meaning |
| --- | --- | --- |
| Order created | Observed | A local merchant order reference exists. |
| Checkout signature | Verified when present | The checkout identity was server-verified; this is not a capture claim. |
| Razorpay API | API observed | The server read a state from Razorpay’s API. |
| Razorpay webhook | Signed verified | A received event passed HMAC verification and is tied to the merchant scope. |
| Issuer outcome | External confirmed | Only a verified external source may confirm an outcome. |

This hierarchy supports reason-code-specific evidence work. Mastercard recommends organising transaction and delivery evidence to address the applicable dispute reason, while the issuer/merchant response process remains distinct from a local customer complaint.[2] [3]

## AI-Assisted Risk Narrative

The **AI Risk Narrative** is available only inside an authenticated merchant’s local case workspace. A merchant explicitly requests it; the model receives only a hashed, strict Case Fact Sheet containing payment state, fulfilment state, present/missing evidence labels, case age, SLA horizon, reason code, deterministic readiness, recommended operational step, and permitted source labels. It does not receive names, free-form customer statements, or monetary values. The output shows its source labels, evidence-readiness progress, fact-sheet hash prefix, recommended operational step, and a prominent safety boundary. Readiness is a deterministic **reason-code-weighted coverage score**, not a document count: for example, a refund-delay case weights payment confirmation and support correspondence separately, while unrelated uploads do not raise the score. If the generated response is malformed, cites an unknown source, contains fraud-adjacent or monetary language, or the model is unavailable, the system retries once and then returns a deterministic fact summary instead.

| Control | Implementation boundary |
| --- | --- |
| Permitted input | Structured tenant-scoped facts only. |
| Citation validation | Every displayed source must be from the supplied fact set. |
| Decision power | None. The narrative cannot deny a case, label fraud, approve/refuse money, contest, submit, or state an external outcome. |
| Failure behaviour | Deterministic, source-cited fallback with a visible reason. |

The in-memory narrative cache is merchant-scoped and keyed by the Case Fact Sheet hash. A fact-sheet change naturally creates a new cache key, while an unchanged case is reused for a short, bounded interval. This controls repeat advisory calls without persisting model output as a decision record.

## Measured Evaluation

The Evaluation Lab runs a reproducible, versioned **24-scenario synthetic held-out regression corpus**. The corpus is separate from merchant records and explicitly does not claim to predict fraud, issuer outcomes, win rates, or money saved. It measures two bounded rule targets: fulfilment-intervention signalling and evidence-gap detection.

| Metric component | Definition |
| --- | --- |
| Positive fixture | The fixed scenario is author-labelled as requiring a fulfilment intervention or an evidence-gap flag. |
| Observed output | The deterministic proactive-risk contract’s sentinel or freshness result. |
| Precision / recall / F1 | Computed at runtime from true positives, false positives, true negatives, and false negatives. |
| Merchant interpretation | Agreement with fixed safety fixtures, not predicted bank behaviour or a promise of loss avoidance. |

## Verified Now and Awaiting Live Proof

| Verified in this build | Awaiting external proof |
| --- | --- |
| Tenant scoping, evidence policies, approval gates, source labels, HMAC-verification code paths, deterministic benchmark execution, and the protected AI-advisory fallback. | A live Sandbox Checkout capture, Razorpay-delivered webhook, real external dispute, refund event, and issuer outcome. These are not claimed until source records exist. |

## Activation Roadmap and Live-Demo Prerequisites

| Priority | Activation requirement | Current boundary |
| --- | --- | --- |
| Carrier tracking evidence | Carrier contract, authentication, tracking-event source, and event-provenance mapping. | The carrier provider remains an inactive placeholder; merchant records are labelled separately. |
| Refund execution | Merchant approval, Razorpay refund capability, and signed refund confirmation. | The product can prepare and gate a refund; it never auto-executes one. |
| External dispute response | Signed dispute intake, reason-code evidence completeness, explicit merchant approval, and provider-confirmed submission state. | Packet preparation is bounded; external submission is not automatic. |
| Public demo link | A saved checkpoint and the user selecting the platform’s Publish control. | Publication is user-controlled and has not been attempted by this implementation pass. |
| Live test-mode payment demonstration | Merchant sign-in, user-controlled hosted Checkout, and a rehearsed success/cancel fallback. | The assistant will not enter payment credentials, OTP, or confirm a financial action. |

The signed Razorpay webhook path rejects oversized raw payloads at **1 MB** before parsing or signature verification, and also has a bounded in-memory burst guard of **120 requests per source IP per rolling minute**, followed by HTTP 429 with `Retry-After`. Signature verification, idempotency, and merchant scoping still apply after the guard permits a request. Because the application uses autoscaling infrastructure, the guard is intentionally treated as local process protection rather than a global distributed quota; a shared store would require separate infrastructure activation. The full upgrade rationale and user-gated proof register are recorded in [`upgrade-audit-2026-08.md`](./upgrade-audit-2026-08.md).

The recommended on-stage path remains the local Hero Case and Evaluation Lab. A live payment or webhook may be shown only as an optional, user-controlled proof step after the safe scripted walkthrough has already demonstrated the product’s value.

## Demonstration Sequence

1. Start at **Reports** to show the Why This Matters panel, synthetic Hero Case, Truth Chain, and compact readiness card.
2. Open **Evaluation Lab** and describe the separate 24-scenario corpus, confusion matrices, and what the metrics do not claim.
3. Open a protected local customer case from **Merchant Home**, then create an AI risk narrative to show cited facts and the no-decision boundary.
4. Open the evidence graph and/or webhook ledger to show that local, API-observed, signed-webhook, and external facts do not collapse into one status.
5. End at the merchant gate: no refund, contest, issuer communication, or outcome is automated.

## References

[1]: https://www.mastercard.com/us/en/news-and-trends/Insights/2025/what-s-the-true-cost-of-a-chargeback-in-2025.html "Mastercard — The true cost of a chargeback"

[2]: https://www.mastercard.com/global/en/news-and-trends/Insights/2024/how-can-merchants-dispute-credit-card-chargebacks.html "Mastercard — How merchants can dispute credit card chargebacks"

[3]: https://corporate.visa.com/en/solutions/acceptance/chargebacks.html "Visa Acceptance Solutions — Chargebacks"

[4]: https://www.chargeflow.io/ "Chargeflow — Chargeback automation platform"

[5]: https://stripe.com/resources/more/chargeback-management-software-how-it-works-and-which-businesses-should-use-it "Stripe — Chargeback management software"
