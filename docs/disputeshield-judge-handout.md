# DisputeShield Judge Handout

## One-Line Product Definition

> **DisputeShield is a defence-only AI Risk Manager for delivery and return-heavy D2C merchants: it makes missing evidence visible before escalation, keeps local customer cases separate from bank disputes, and prepares merchant-controlled decisions without moving money or inventing external truth.**

This is the **single canonical judge front door**. It contains the timed click order, measured benchmark scope, truth boundaries, and direct links to supporting detail. Use [`disputeshield-a-to-z-definition.md`](./disputeshield-a-to-z-definition.md) as the implementation appendix and [`disputeshield-flow-and-required-actions.md`](./disputeshield-flow-and-required-actions.md) as the detailed actor-by-actor operating appendix; neither supersedes this handout for evaluation.

## The Problem and the Difference

Delivery, return, payment, and customer-support evidence commonly lives in separate places. When a product-not-received issue escalates, a merchant may know that an order exists but still be missing the delivery proof, return receipt, or correspondence needed to respond responsibly.

DisputeShield does **not** claim to predict or win chargebacks. It detects the evidence gap early, makes the proof state explicit, and gives the merchant a safe next task while preserving the boundary between a local issue and an external dispute.

| Typical workflow | DisputeShield workflow |
| --- | --- |
| Issue discovered late, after evidence has fragmented | Delivery and evidence gaps are surfaced as soon as they appear in local operations. |
| One undifferentiated “payment complete” state | Truth Chain distinguishes local order, Checkout signature, Razorpay API observation, and signed webhook verification. |
| Generic checklist | Reason-code-weighted readiness and Razorpay-field mapping make required proof matter more than unrelated document count. |
| Automation risks taking an irreversible action | AI creates a cited advisory; merchant approval remains required for refund or external decision. |
| Small queue with no ownership | Protected Risk Operations search, merchant-owned SLA state, and internal escalation notes make triage accountable without auto-assignment. |

## 90-Second Judge Click Order

| Time | Where to click | What to show | What to say |
| --- | --- | --- | --- |
| 0:00–0:20 | **Reports** → Hero Case | The amber-bordered **SYNTHETIC · LOCAL · NOT SUBMITTED** case. | “This is a clearly synthetic local scenario, not a real bank or Razorpay dispute. It shows the operational gap we solve: missing delivery proof before escalation.” |
| 0:20–0:35 | **Reports** → Counterfactual control + Truth Chain | Toggle the scripted case between **With DisputeShield** and **Without DisputeShield**, then show the four source layers. | “The counterfactual says only that the gap is not routed and merchant action is absent. It does not claim a chargeback occurred.” |
| 0:35–0:50 | **Reports** → Pre-demo readiness + illustrative dispute preview | Stored/session-visible readiness states and a clearly excluded static Razorpay dispute record. | “The preview uses published entity field names but is not a queue item. Actual received `reason_code` and `reason_description` always override a candidate mapping.” |
| 0:50–1:05 | **Evaluation Lab** | Two measured panels with precision, recall, F1, TP/FP/TN/FN. | “This is a fixed synthetic held-out corpus, not a live win-rate claim.” |
| 1:05–1:20 | **Seller Space** | Product, inventory, fulfilment, and merchant record context. | “Seller Space establishes local operational facts. Concurrent checkout inventory is atomically reserved to prevent overselling.” |
| 1:20–1:35 | **Customer Space** | Private catalog/order-token workflow and local issue boundary. | “The buyer can open a local issue and confirm OCR facts. This cannot create a Razorpay or issuer dispute.” |
| 1:35–1:50 | **Disputes** → Risk Operations console | Bounded case search, candidate network evidence field map, manual owner/level/note recording, trends, and usage counts. | “This is operational organization—not automated contesting, a buyer penalty, billing, or a provider call.” |
| 1:50–2:00 | **Webhook Ledger** | Pending/verified/rejected/duplicate provenance language. | “External truth arrives only from Razorpay through a signed, scoped, idempotent event. The ledger makes that proof visible.” |

## The Measured Claim

The Evaluation Lab uses **N = 24 author-labelled synthetic held-out regression scenarios**. The current deterministic result is:

| Measured rule | Precision | Recall | F1 | Confusion matrix |
| --- | ---: | ---: | ---: | --- |
| Fulfilment intervention signal | 100% | 100% | 100% | TP 7 · FP 0 · TN 17 · FN 0 |
| Evidence-gap detection | 100% | 100% | 100% | TP 13 · FP 0 · TN 11 · FN 0 |

> These numbers measure agreement between two deterministic rules and fixed held-out fixtures. They are **not** fraud accuracy, dispute-win probability, customer-intent detection, bank-outcome prediction, merchant ROI, or money saved.

## What the AI Does—and Does Not Do

The Risk Narrative receives a strict **Case Fact Sheet** containing only permitted structured case facts. It generates a source-cited explanation with evidence readiness, missing/conflicting facts, uncertainty, and a recommended operational step. If the model is unavailable or its output fails safety/citation checks, the same request returns a deterministic source-cited fallback.

| The AI/rules can do | The AI/rules cannot do |
| --- | --- |
| Match records, identify evidence gaps, calculate reason-code-weighted readiness, prioritise safe work, explain citations, and prepare draft packet material. | Refund a buyer, accept or contest a dispute, submit an external response, contact an issuer, label a customer fraudulent, or declare an outcome. |

## Reason-Code and Evidence Mapping Boundary

DisputeShield uses a **candidate mapping** from its local issue taxonomy to relevant card/network examples and Razorpay evidence-object field names. The mapping is an evidence-organizing aid: it does not declare that an issuer assigned the code, select a code for an ambiguous report, or submit an evidence packet. Razorpay's Disputes Entity exposes received `reason_code`, `reason_description`, `respond_by`, `phase`, `status`, and documented evidence fields including `shipping_proof`, `customer_communication`, `proof_of_service`, `refund_confirmation`, `refund_cancellation_policy`, `term_and_conditions`, and `others`. [1] [2]

| Local issue | Candidate only, where documented | Initial Razorpay evidence fields | Safety rule |
| --- | --- | --- | --- |
| Product not received | Visa 13.1; RuPay/UPI 1064 | `shipping_proof`, `proof_of_service`, `customer_communication`, `term_and_conditions` | Provider/issuer record supersedes the candidate. |
| Damaged or wrong item | Visa 13.3; RuPay/UPI 1062 | `shipping_proof`, `customer_communication`, `term_and_conditions`, `others` | Candidate is not a product-condition conclusion. |
| Refund issue | Visa 13.6; RuPay/UPI 1061 | `refund_confirmation`, `refund_cancellation_policy`, `customer_communication`, `billing_proof` | Local refund readiness never proves funds moved. |
| Wrong amount, duplicate, or unauthorized report | **Awaiting issuer/Razorpay reason code** | Factual billing, communication, explanation, access, and other records as applicable | No generic code is guessed; an unauthorized report is never labelled as fraud. |

## Operational Ownership and Data Boundaries

The **Risk Operations** console provides bounded case discovery by case/order/buyer label, local issue, readiness, status text, and date range. It also records a merchant-selected owner label, local SLA level, and written escalation note in the tenant's audit history. Setting a case to *elevated* creates an internal in-app notification only; it does not assign a person outside the workspace, send email/SMS, contact a buyer, change a case, refund money, or transmit a provider response.

Buyer-pattern review is intentionally a narrow workload signal: repeated active local product-not-received cases produce a pseudonymous review cue. It is never a fraud, manipulation, abuse, or intent determination; it cannot penalize, block, price, or alter any buyer action. Trend panels aggregate stored case facts, while usage panels show factual order, case, document, and received-webhook counts as **observability—not billing**.

## Safe Product Flow

1. The merchant creates product, inventory, and fulfilment context in **Seller Space**.
2. A buyer uses a private, first-redeemer-bound link in **Customer Space**.
3. The buyer explicitly chooses Razorpay Checkout. The server reserves merchant-recorded stock atomically before creating the Razorpay order.
4. Razorpay controls payment credential entry and authentication. DisputeShield separately labels order created, signature verified, API observed, and webhook verified.
5. The merchant records fulfilment; the buyer can raise a **local** issue, add documents, and confirm OCR candidate facts.
6. DisputeShield calculates readiness, identifies missing proof, and generates the safe AI narrative or deterministic fallback.
7. The merchant reviews and chooses any local resolution. Refund preparation and evidence packets are gated.
8. Only a Razorpay API record or HMAC-verified Razorpay webhook can create an external-dispute state in the command centre.
9. The merchant chooses accept or contest; no submission or external outcome is automated.

## Advisories, Privacy, and Cardholder Data

> **DisputeShield organizes evidence and advisory guidance; the merchant remains responsible for every decision and outcome.**

Customer evidence is protected within the local case-access boundary. When optional document assistance is chosen, extracted content remains candidate information subject to customer confirmation and merchant review. DisputeShield does not collect, store, or process card number, CVV, OTP, or UPI PIN; payment credential entry is hosted by Razorpay Checkout. This describes the product boundary only and **does not claim PCI certification or SAQ-A eligibility**.

## Live-Proof Rehearsal—Separate from the Main Demo

The main demo above is designed to work without a live payment. Rehearse these only when explicitly desired.

| Rehearsal step | Who must act | Safe boundary |
| --- | --- | --- |
| Sign in to merchant workspace | Merchant | Required to access protected local records and the owner-only synthetic seed control. |
| Seed local walkthrough | Merchant | Creates labelled local data only; no payment, refund, bank, carrier, or webhook record. |
| Open Test Mode Checkout | Merchant/buyer | Requires fresh approval. The person using it controls card/UPI/bank credentials and any OTP. |
| Publish and configure Razorpay webhook | Merchant | Use a **separate DisputeShield endpoint**; do not replace the existing IntentLock endpoint. |
| Observe signed webhook | Razorpay | Only Razorpay can deliver this source event. DisputeShield verifies payload size, HMAC, scope, idempotency, and burst limits before persistence. |
| Execute refund or respond to external dispute | Merchant plus external provider | Requires explicit merchant decision and external source confirmation; do not automate for a demo. |

## Judge Questions: Short Answers

| Question | Answer |
| --- | --- |
| “Is this a chargeback bot?” | No. It is an evidence-first risk manager. It prepares merchant-controlled work and maintains clear external boundaries. |
| “How do you know what happened?” | Through source-labelled layers: merchant record, customer local case, Razorpay API observation, HMAC-verified webhook, and external confirmation. |
| “What is actually measured?” | Precision, recall, F1, and confusion matrix for two deterministic rules over 24 fixed synthetic held-out scenarios. |
| “What protects a merchant from unsafe automation?” | Reason-specific evidence policy, fact-cited AI output guards, explicit merchant approval gates, and no automatic financial or external action. |
| “What remains to prove live?” | A user-controlled Test Mode Checkout, published separate webhook delivery, real refund event, external dispute, carrier event, and issuer outcome. |
| “Can the customer trigger a chargeback here?” | No. Customer Space records a local issue or return request. A bank/issuer independently decides whether to raise an external dispute. |
| “Is the reason code shown by the console final?” | No. Candidate mappings are only evidence preparation. A received Razorpay/issuer reason code is authoritative. |

## Final Line

DisputeShield is valuable precisely because it refuses to blur claims: **it makes a merchant faster and better prepared without pretending that a local record is a payment, a browser callback is a webhook, or an AI suggestion is a financial decision.**

## References

[1]: https://razorpay.com/docs/payments/payment-gateway/chargeback/submit-evidence/ "Razorpay — Submit Evidence for Disputes"
[2]: https://razorpay.com/docs/api/payments/disputes/entity/ "Razorpay — Disputes Entity"
