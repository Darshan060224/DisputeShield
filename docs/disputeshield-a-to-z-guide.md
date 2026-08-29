# DisputeShield: A-to-Z Project Guide

## 1. What DisputeShield Is

**DisputeShield** is a Track 02 **AI Risk Manager** for Razorpay merchants. Its job is to reduce chargeback, return, fulfilment, refund, and evidence loss through explainable operational controls. It is a **defence-only** system: it helps the merchant verify facts, organise evidence, prioritise unresolved cases, and prepare a human decision. It does not generate fraudulent claims, impersonate a bank, manufacture a Razorpay dispute, or automatically move money.

The central design rule is simple:

> A local customer issue is not a bank dispute. A browser callback is not a captured payment. A merchant record is not a signed external event. A model output is not a financial decision.

| Item | What DisputeShield does | What it does not do |
|---|---|---|
| Customer problem | Creates a local case and evidence trail | Creates a bank chargeback or Razorpay dispute |
| Payment | Creates a Razorpay order and verifies Checkout signature | Treats a page callback as a captured payment |
| Refund | Prepares a local request after factual gates | Automatically issues or claims a refund |
| External dispute | Ingests Razorpay API or signed webhook facts | Manufactures a dispute, contest, or outcome |
| AI | Summarises triage signals and evidence gaps | Decides fraud, denies customers, or moves money |

---

## 2. Users and Workspaces

DisputeShield has two primary operating perspectives.

| User | Workspace | Purpose |
|---|---|---|
| Merchant | Merchant Home, Seller Space, Payments, Dispute Operations, Reports, Account & settings | Collect payment, fulfil order, inspect risk, prepare evidence, and make merchant-controlled decisions |
| Buyer / customer | Customer Space | Browse a private merchant catalog, purchase through Razorpay Checkout, view a bound order, open a local issue, upload evidence, and track a local resolution |

### Merchant workspace

The merchant sees the **Universal Dispute Command Centre**. It aggregates distinctly labelled sources:

1. **External Razorpay disputes** appear only after Razorpay API observation or a HMAC-verified webhook event.
2. **Local customer cases** originate in Customer Space and remain explicitly labelled `local customer case`.
3. **Merchant fulfilment facts** come from Seller Space records.
4. **Payment facts** come from signed Checkout verification, Razorpay API read-back, or signed webhooks.

### Buyer workspace

Customer Space is a protected mini-commerce and resolution surface. It uses order/catalog access binding so a customer cannot browse unrelated merchant orders. A buyer can:

- Open a private merchant catalog token.
- Select a product and quantity.
- Explicitly start official Razorpay Checkout.
- View only buyer-bound orders.
- Create a factual local issue or return request.
- Attach a document, request optional OCR candidate facts, and confirm or reject those candidates.
- Follow a local return/refund timeline.
- Read guidance on contacting an issuing bank outside the application.

The buyer cannot create a bank dispute, force a refund, edit merchant evidence, or see other customers’ cases.

---

## 3. Fixed Navigation Map

The full DisputeShield navigation stays visible on the left for desktop routes and is available through the mobile menu. It is not a decorative sidebar: each item opens a dedicated workspace with an access boundary, live/empty/error state, or source-labelled data.

| Navigation item | Purpose | Data boundary |
|---|---|---|
| Home | Universal command centre and high-level risk status | Merchant dashboard facts |
| Disputes | External dispute queue | Signed Razorpay/API facts only |
| Transactions | Razorpay payment intake and collection workflow | Merchant payment records |
| Settlements | Refund/return readiness | Local request vs signed refund confirmation |
| Reports | Operational metrics and proactive risk intelligence | Merchant-scoped aggregates |
| Evidence packets | Packet readiness for a verified dispute | No external submission |
| Case timeline | Immutable local customer-case events | Merchant-scoped case records |
| Document vault | Protected evidence metadata and graph | Originals remain protected |
| Webhook ledger | Signed/rejected/duplicate incoming delivery state | Webhook provenance |
| Evaluation lab | Held-out evaluation and outcome-learning boundary | Benchmark and recorded facts |
| Customer Space | Buyer catalog, order, local issue, evidence, returns | Buyer-bound access only |
| Account & settings | Razorpay readiness and inactive configuration registry | Secrets never shown in browser |

---

## 4. Product and Seller Space Flow

Seller Space is the merchant’s local fulfilment and order-truth layer.

### 4.1 Product lifecycle

1. A merchant adds a local product record with name, SKU, stock, description, and INR amount.
2. The product becomes available to a buyer only through a private catalog access token.
3. The buyer chooses quantity and explicitly selects **Buy with Razorpay**.
4. A buyer order is created locally and linked to the merchant/product context.
5. The merchant records fulfilment stages such as `unfulfilled`, `packed`, `shipped`, `delivered`, or `delivery_exception`.
6. Each merchant fulfilment action becomes a source-labelled audit event.

### 4.2 Fulfilment truth

Seller Space does not claim carrier integration unless one is independently verified. Current fulfilment states are marked as merchant records. This distinction matters because a merchant-reported delivery entry is useful evidence, but it is not equivalent to a signed carrier event or card-network decision.

| Fulfilment state | Meaning | Risk use |
|---|---|---|
| Unfulfilled | No fulfilment record exists | Important for non-delivery local cases |
| Packed | Merchant prepared the order | Early operational record |
| Shipped | Merchant recorded dispatch | Requires tracking evidence for stronger support |
| Delivered | Merchant recorded delivery | Still distinguished from signed carrier proof |
| Delivery exception | Merchant recorded a problem | Raises proactive fulfilment sentinel signal |

---

## 5. Payment and Razorpay Checkout Flow

Payments is not a fake card form. It uses official Razorpay Checkout and preserves the payment truth chain.

### 5.1 Payment intake steps

1. Merchant enters a valid INR amount and selects a purpose: payment collection or evidence-linked intake.
2. Server creates a Razorpay order.
3. Merchant explicitly opens Razorpay Checkout.
4. Razorpay handles payment method selection, card/OTP/bank authentication, and payment collection.
5. Checkout returns payment/order/signature fields.
6. Server verifies the Razorpay Checkout signature.
7. Razorpay API and/or a signed `payment.captured` webhook supplies the stronger capture confirmation.
8. The intake ledger shows source-labelled state, including API-observed capture and webhook-pending situations.

### 5.2 Payment state hierarchy

| State | Meaning | Can it prove capture? |
|---|---|---|
| Created | Razorpay order exists | No |
| Checkout opened | Checkout was launched | No |
| Client confirmed | Browser received Checkout response | No, on its own |
| Signature verified | Server validated Checkout signature | Stronger payment identity proof, but not final capture proof alone |
| API observed | Razorpay API reports payment state | Yes, source-labelled API observation |
| Webhook verified | HMAC-verified webhook was accepted | Yes, signed delivery provenance |

### 5.3 Test mode boundary

The application may display test-mode guidance where Razorpay itself supports it, but the payment credential, OTP, bank selection, and sensitive Checkout actions remain inside Razorpay Checkout and user-controlled. DisputeShield never stores card data or OTP.

---

## 6. Customer Space: Local Issue and Return Flow

Customer Space is designed for **early local resolution** so a merchant can fix a real customer issue before it reaches an issuing bank.

### 6.1 Local issue flow

1. Buyer opens an order bound to their authenticated identity.
2. Buyer chooses an issue type: product not received, partial delivery, damaged/wrong item, return request, refund issue, wrong amount, duplicate payment, or unauthorised transaction.
3. Buyer writes a factual statement.
4. For return/damage flows, buyer adds a concise return or condition reason.
5. The system creates a **local customer case**, not a Razorpay dispute.
6. Buyer uploads supporting documents.
7. Optional OCR provides candidate facts only.
8. Buyer confirms, rejects, or requests correction of OCR output.
9. Merchant reviews facts and may request evidence, authorise a return, record a local resolution offer, or close the local case.

### 6.2 Return and local refund readiness

For a return request, the system follows a controlled chain:

1. Merchant authorises a local return.
2. Customer can mark the authorised return in transit.
3. Merchant records a return receipt with carrier name, tracking reference, source type, and note.
4. DisputeShield checks for a Razorpay API-observed captured payment.
5. Only then can it prepare a **local refund request**.
6. A merchant must provide the explicit approval phrase before a refund execution path can be considered.
7. Only a signed Razorpay `refund.processed` outcome can label the refund externally confirmed.

The local customer case never becomes a bank chargeback just because the customer clicks a button.

---

## 7. Real External Dispute Flow

The correct external dispute chain is:

```text
Customer contacts issuing bank
        ↓
Issuing bank investigates
        ↓
Bank / payment network raises an external dispute
        ↓
Razorpay receives the dispute
        ↓
Razorpay API or signed webhook reaches DisputeShield
        ↓
DisputeShield verifies provenance and merchant scope
        ↓
Merchant reviews evidence and makes a controlled decision
```

### 7.1 External dispute truth rules

- A Customer Space case cannot create an external dispute.
- A local merchant scenario cannot be shown as a bank dispute.
- A webhook must pass HMAC validation before it affects trusted external state.
- Duplicate events are suppressed.
- Merchant scope is checked so one merchant/project cannot contaminate another merchant’s case queue.
- A response packet can be prepared but is not automatically submitted.

### 7.2 Merchant decision gate

When a genuine external dispute arrives, the merchant sees a source-labelled decision path.

| Merchant path | What DisputeShield prepares | What remains gated |
|---|---|---|
| Accept / do not contest | Evidence and decision context | Any money action remains separately verified |
| Contest | Reason-code evidence checklist and packet readiness | Merchant must approve; no automatic response submission |
| Evidence incomplete | Missing-facts list and review recommendation | No contest is released |
| Outcome pending | Status and deadline tracking | No win/loss is claimed |

---

## 8. Reason-Code Risk and Evidence Logic

DisputeShield uses deterministic reason-specific evidence requirements. It does not use a generic “AI vibe” to decide a dispute.

| Issue / reason family | High-value evidence |
|---|---|
| Product not received | Delivery/tracking evidence and support conversation |
| Partial delivery | Delivery/tracking and item-condition evidence |
| Damaged or wrong item | Item-condition and delivery/tracking evidence |
| Return request | Item-condition evidence and receipt workflow |
| Refund issue | Payment confirmation and support conversation; signed refund result if relevant |
| Wrong amount / duplicate payment | Payment confirmation and order/payment reconciliation |
| Unauthorised transaction | Payment context and human merchant review; no automatic fraud label |

For each case, the system can show:

- Missing evidence.
- Unreviewed OCR candidate facts.
- Payment observation status.
- Fulfilment status.
- Return receipt status.
- Refund confirmation status.
- Recommended next factual step.
- Actions the system always blocks.

---

## 9. AI and Automation Boundary

The product uses AI only where its uncertainty is visible and where outputs can remain advisory.

| Capability | Appropriate use | Hard boundary |
|---|---|---|
| Document OCR | Extract candidate facts from a customer-selected document | Customer must confirm/correct; original document remains authoritative |
| Customer statement signals | Triage language and uncertainty hints | Never labels manipulation, fraud, or intent |
| Resolution intelligence | Combines trusted facts, evidence gaps, and timing into next-best-action advice | Cannot deny, refund, contest, or submit externally |
| Proactive risk intelligence | Detects operational fulfilment/evidence/SLA risk from case facts | Cannot profile a customer or take financial action |

### Current local-model placeholder status

The Account & settings workspace deliberately shows **Local model runtime** as an **inactive placeholder**. No model interpreter, artifact path, timeout, or managed environment value is guessed. Until a verified runtime is deliberately activated, the application must not claim model-backed inference.

---

## 10. Proactive Risk Intelligence Layer

This is the added prevention layer. It turns DisputeShield from chargeback paperwork support into a proactive merchant risk manager.

### 10.1 Fulfilment Risk Sentinel

The sentinel looks for operational patterns such as:

- An active product-not-received case with no fulfilment record.
- A merchant-recorded delivery exception while the case remains active.
- Return workflow friction.

It generates an explainable merchant task such as: **reconcile fulfilment, tracking, and customer-contact facts**. It does not say that the customer is dishonest or that delivery legally occurred.

### 10.2 Evidence Freshness Monitor

The freshness monitor compares the local case’s required evidence to documents currently present. It can flag:

- Missing delivery/tracking evidence.
- Missing support conversation evidence.
- Missing payment confirmation.
- Unreviewed OCR candidate output.
- An active case with old untouched updates.

The output contains a source, missing item, next action, and a boundary statement. It does not fabricate a document or submit evidence.

### 10.3 Merchant SLA Recovery Board

The SLA board ranks active local cases by elapsed time since update. It communicates:

- Case reference.
- Age in hours.
- Priority: watch, review, or elevated.
- Current owner: merchant or customer.
- Next factual action.

It does not automatically contact the customer, grant a refund, or escalate to a bank.

### 10.4 Evidence Integrity Graph

For each local case, the graph links:

```text
Order → Payment → Fulfilment → Evidence → Local resolution
```

Each node is marked `verified`, `observed`, or `missing` and includes a source label. This helps a judge or merchant see which facts are recorded, which facts are incomplete, and how the packet hangs together.

### 10.5 Outcome Learning Loop

The Evaluation Lab reports recorded local resolution totals and waits for merchant-confirmed external outcome records before learning from win/loss outcomes. It explicitly avoids a false claim such as “this model guarantees a win.”

---

## 11. Webhook Ledger and Security

The webhook endpoint is designed for Razorpay event intake.

### 11.1 Webhook safety chain

1. Raw event body is received.
2. HMAC signature is verified with the configured webhook secret.
3. Invalid signatures are rejected.
4. Merchant scope and event provenance are checked.
5. Event is persisted with ledger state.
6. Duplicate event identifiers are suppressed.
7. The dashboard projects only verified events into trusted external facts.

### 11.2 Webhook state labels

| Label | Meaning |
|---|---|
| Pending delivery | No verified receipt yet / waiting for source confirmation |
| Verified delivery | Signature and provenance checks passed |
| Rejected delivery | Signature or validation boundary failed |
| Duplicate suppressed | Repeated event cannot overwrite state |

The system has a synthetic signed webhook replay path for safe local validation. That is a test tool, not a claim that Razorpay itself delivered the event in production.

---

## 12. Audit Trail and Exports

Every important process is designed to be explainable.

| Audit element | Example content |
|---|---|
| Source | Razorpay API, signed webhook, merchant record, customer local case, customer document |
| Event | Payment observed, order linked, fulfilment updated, evidence uploaded, receipt recorded |
| Actor | Customer, merchant, system, Razorpay |
| Boundary | What the record proves and what it does not prove |
| Decision gate | Why a refund, contest, or external response remains blocked |

Case-level JSON audit exports are intended to preserve evidence/decision provenance for review.

---

## 13. Evaluation Lab and Quality Evidence

The Evaluation Lab separates benchmark evaluation from a real live outcome.

| Metric | Meaning |
|---|---|
| Precision | How often a positive model/rule recommendation was correct in the held-out benchmark |
| Recall | How many relevant cases the benchmark captured |
| Evidence accuracy | Accuracy of evidence/fact classification in the benchmark |
| Recommendation accuracy | Accuracy of suggested next-step classification in the benchmark |
| Unsupported claim rate | Rate at which the system produces unsupported factual claims |

These metrics are not a promise that a specific card-network or bank dispute will be won.

---

## 14. Placeholder and Configuration Registry

Account & settings contains a visible **Inactive Configuration Registry**. This is intentional and safer than guessing missing settings.

| Placeholder | Current status | What is required before activation |
|---|---|---|
| Local model runtime | Inactive placeholder | Verified interpreter, model artifacts, and memory/time budget |
| Published Razorpay webhook delivery | Awaiting live proof | Published endpoint and separately configured signed Razorpay webhook |
| Carrier fulfilment integration | Inactive placeholder | Verified carrier provider, authorised event contract, and merchant scope |
| Razorpay refund execution | Merchant-gated | Captured payment, prepared request, merchant approval, signed outcome |
| External dispute response | Merchant-gated | Signed dispute, complete evidence, explicit merchant decision |

No configuration value is guessed or exposed in the browser.

### 14.1 Environment Configuration Inventory

DisputeShield must treat all real environment configuration as **server-managed**. A browser page may show readiness, but must never show a secret value, a webhook secret, a payment key, a session signing value, or a private artifact path.

| Variable / group | Classification | Used for | Browser exposure | Current treatment |
|---|---|---|---|---|
| `RAZORPAY_KEY_ID` | Secret-managed payment configuration | Server-side Razorpay order/API calls | Never | Existing managed integration setting |
| `RAZORPAY_KEY_SECRET` | Secret | Razorpay API authentication | Never | Existing managed integration setting |
| `RAZORPAY_WEBHOOK_SECRET` | Secret | HMAC verification of Razorpay webhook payloads | Never | Existing managed integration setting |
| `GEMINI_API_KEY` | Secret | Optional server-side OCR candidate-fact assistance | Never | Existing managed integration setting |
| `DATABASE_URL` | Secret-managed platform setting | Database access | Never | Platform-provided; not displayed or copied into documentation |
| `JWT_SECRET` | Secret | Session integrity | Never | Platform-provided; not displayed or copied into documentation |
| `OAUTH_SERVER_URL`, `VITE_APP_ID`, `VITE_OAUTH_PORTAL_URL` | Platform/OAuth configuration | Merchant and buyer sign-in flow | Public client identifiers only where required | Platform-managed; do not replace with guessed values |
| `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` | Platform integration configuration | Built-in platform services | Key never | Platform-managed |
| `VITE_FRONTEND_FORGE_API_URL`, `VITE_FRONTEND_FORGE_API_KEY` | Browser integration configuration | Approved frontend platform services | Only platform-approved frontend value | Platform-managed |
| `VITE_ANALYTICS_ENDPOINT`, `VITE_ANALYTICS_WEBSITE_ID` | Optional analytics configuration | Usage analytics | Endpoint/ID may be browser-visible | Managed if enabled; inactive if absent |
| `VITE_APP_TITLE`, `VITE_APP_LOGO` | Public branding configuration | Application branding | Yes | Managed public project settings |

### 14.2 Inactive Environment Placeholders

The following names are **documentation placeholders only**. They deliberately have no values, are not read by the current runtime, and must remain inactive until the corresponding implementation and deployment verification exist.

| Placeholder name | Do not set until | Safe state now |
|---|---|---|
| `LOCAL_MODEL_RUNTIME` | A verified local interpreter/runtime is packaged and capacity-tested | No local model runtime claim |
| `LOCAL_MODEL_ARTIFACT_PATH` | Model artifacts are verified, available locally, and access-controlled | No guessed artifact path |
| `LOCAL_MODEL_TIMEOUT_MS` | A real model benchmark establishes an appropriate bounded timeout | No guessed timeout |
| `CARRIER_PROVIDER_URL` | A carrier provider and event contract are selected and authorised | Merchant fulfilment records only |
| `CARRIER_WEBHOOK_SECRET` | A real carrier webhook integration exists | No carrier webhook accepted |
| `EXTERNAL_DISPUTE_RESPONSE_ENDPOINT` | Razorpay/provider response API and merchant authorisation are verified | No automated external response |
| `REFUND_EXECUTION_MODE` | Merchant approval, capture proof, and Razorpay refund execution policy are verified | Local preparation only; no automatic refund |

> **Activation rule:** A placeholder does not enable a feature. Before any placeholder is converted into a real managed environment value, the project needs a documented source, an owner, a validation test, a secret-handling decision, and a rollback plan.

---

## 15. What Is Verified Locally

The following capabilities have been covered by local code, type, build, browser, or regression validation during development:

- Route navigation and persistent sidebar behavior.
- Product-bound and guided demo checkpoint gating.
- Local customer case creation and policy transitions.
- Buyer-bound order/catalog access boundaries.
- Payment order creation and Checkout signature verification logic.
- Webhook HMAC rejection and signed-event projection logic.
- Local versus external dispute separation.
- Refund preparation/approval gating and signed-outcome requirements.
- Evidence requirements, freshness, proactive risk sentinel, SLA board, and integrity graph logic.
- Razorpay credential read-access contract where configured.
- Production build and TypeScript compilation at recorded checkpoints.

---

## 16. What Is Not Yet Proven Live

The following must remain labelled **unproven** until an authorised published round trip happens:

1. A real hosted Razorpay Test Mode Checkout completion by a user.
2. A real Razorpay `payment.captured` signed webhook arriving at the published endpoint.
3. A bank-originated external dispute arriving through Razorpay.
4. A real authorised Razorpay refund execution and corresponding signed refund event.
5. A verified carrier integration event.
6. A verified local model runtime, if the inactive placeholder is activated later.

This honesty is a product strength: DisputeShield does not claim external proof it does not have.

---

## 17. Demo Story: Five-Minute Version

1. Open **Seller Space** and show a local product and fulfilment record.
2. Open **Customer Space**, browse a private catalog, choose a product, and explain that Checkout is explicit and Razorpay-controlled.
3. Open a buyer-bound local issue, upload evidence, and show OCR is a candidate requiring confirmation.
4. Open **Reports** and show Fulfilment Risk Sentinel, Evidence Freshness, and SLA Recovery tasks.
5. Open **Document vault** and show the Evidence Integrity Graph.
6. Open **Disputes** and explain that only Razorpay API/signed webhook facts create an external case.
7. Open **Evidence packets** and explain merchant approval is required; nothing is automatically submitted.
8. Open **Webhook ledger** and show verified, rejected, and duplicate-suppressed provenance concepts.
9. Open **Evaluation lab** and show quality metrics and the honest Outcome Learning boundary.
10. Open **Account & settings** and show unverified integrations remain inactive placeholders, not fake capability.

---

## 18. Final Safety Promise

DisputeShield is deliberately designed so the most sensitive actions remain human-controlled:

- No automatic refund.
- No automatic contest or accept decision.
- No automatic external dispute submission.
- No automatic bank communication.
- No customer fraud/manipulation label.
- No invented evidence.
- No use of browser callback alone to prove captured payment.
- No local customer case presented as a bank/Razorpay dispute.

The product automates **collection, matching, classification, freshness checking, explanation, prioritisation, and packet preparation**. It leaves **money movement, final dispute decisions, external submissions, and outcome claims** to verified sources and the merchant.
