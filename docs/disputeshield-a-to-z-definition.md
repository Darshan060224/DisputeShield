# DisputeShield: A-to-Z Definition

> **One-line definition:** DisputeShield is a defence-only AI Risk Manager for Razorpay merchants that makes the evidence needed to resolve customer problems visible early, keeps local customer cases separate from bank disputes, and prepares merchant-controlled evidence decisions without moving money or asserting external outcomes.

## Product at a Glance

DisputeShield is built for delivery and return-heavy D2C merchants. Its central job is not to “win every chargeback.” Its job is to identify missing fulfilment, payment, return, support, and evidence facts while the merchant can still resolve the customer issue locally or prepare a factual response to a verified external dispute.

| Question | DisputeShield answer |
| --- | --- |
| What problem does it solve? | Unclear evidence, fragmented order/payment/fulfilment records, slow local resolution, and unprepared merchant response work. |
| Who uses it? | Merchants in Seller Space, Merchant Home, and operational workspaces; buyers in a private Customer Space. |
| What is the AI role? | Explain structured facts, identify evidence gaps, and prioritise safe operational tasks. |
| What remains human-controlled? | Payment method authentication, refunds, accept/contest decisions, external submissions, bank communication, and outcome claims. |
| How is truth established? | By source labels: local merchant record, buyer local case, Razorpay API observation, HMAC-verified webhook, or externally confirmed outcome. |

## A–Z Product Dictionary

| Letter | Definition |
| --- | --- |
| **A — Advisory AI** | A merchant may request a fact-cited Risk Narrative. It sees a strict Case Fact Sheet, not free-form personal data, and has no decision or money-moving authority. |
| **B — Boundaries** | A local issue is not a bank dispute; a browser callback is not a captured payment; an AI output is not a financial decision. |
| **C — Customer Space** | A buyer-private workflow for catalog access, bound orders, local issue/return intake, document evidence, OCR confirmation, and resolution tracking. |
| **D — Data provenance** | Every important record names its source: merchant, customer, Razorpay API, signed webhook, or external confirmation. |
| **E — Evidence** | Reason-specific evidence requirements identify what is present, missing, conflicting, or still awaiting customer confirmation; network candidates map only to documented Razorpay evidence fields until an actual received reason code is available. |
| **F — Fulfilment** | Seller Space records local fulfilment milestones and delivery exceptions. Merchant-entered delivery is useful but never presented as verified carrier proof. |
| **G — Gates** | Explicit merchant gates protect refunds, packet release, contest decisions, external response, and any irreversible action. |
| **H — Hero Case** | A clearly synthetic local “product not received” story shows a delivery exception, missing proof, AI/rule intervention, and a merchant-controlled next step. |
| **I — Integrity graph** | The Evidence Integrity Graph connects order, payment, fulfilment, document, return, and webhook facts as verified, observed, or missing. |
| **J — Judge story** | Reports combines why-it-matters context, the Hero Case, Truth Chain, real-versus-simulated status, and deterministic evaluation. |
| **K — Key metrics** | The system reports evidence readiness, case age/SLA work, fulfilment sentinel signals, stored-case trends, and factual record counts; it does not predict money saved or create a bill. |
| **L — Local resolution** | Customer problems are handled locally first through evidence collection, merchant review, returns, and resolution offers. No button creates a Razorpay dispute. |
| **M — Merchant workspace** | Merchant Home, Disputes, Payments, Settlements, Reports, Evidence Packets, Timeline, Vault, Ledger, Evaluation, and Settings are dedicated route surfaces. |
| **N — Narrative safety** | Generated text must cite only permitted fact-sheet sources; prohibited fraud, money-movement, and outcome language triggers a deterministic fallback. |
| **O — OCR confirmation** | OCR produces candidate document facts only. The buyer confirms, corrects, or rejects them before they influence local case review. |
| **P — Payments** | A merchant explicitly creates a Razorpay order and opens official Razorpay Checkout. Signature and later API/webhook evidence are labelled separately. |
| **Q — Quality evaluation** | Evaluation Lab runs a fixed, versioned 24-scenario synthetic held-out corpus measuring deterministic fulfilment-intervention and evidence-gap rules. |
| **R — Razorpay integration** | Razorpay API reads and signed webhooks provide stronger external facts. The app never calls a live action merely because a browser rendered a checkout page. |
| **S — Security** | Merchant scoping, authentication, protected document metadata, HMAC verification, duplicate suppression, 1 MB raw webhook limit, and burst protection are enforced. |
| **T — Truth Chain** | Order created → Checkout signature verified → Razorpay API observed → signed webhook verified → external outcome confirmed. Each layer proves a different fact. |
| **U — Uncertainty** | Missing, conflicting, local, API-observed, signed, and external states remain visibly different instead of being collapsed into “complete.” |
| **V — Validation** | The latest safe-roadmap validation passed 47 test files / 128 tests, TypeScript, a production build, and responsive non-mutating entry-state checks. Earlier provider read-only checks and a 13-route review remain separately documented. |
| **W — Webhook Ledger** | The ledger classifies pending, verified, rejected, and duplicate-suppressed deliveries and highlights the merchant’s next safe action. |
| **X — Exclusions** | No automatic refund, contest, accept decision, issuer communication, fraud label, fabricated evidence, or customer profiling. |
| **Y — Yet-to-prove items** | A published webhook delivery, user-completed hosted Checkout, refund event, external dispute, carrier event, and issuer outcome require real source records. |
| **Z — Zero invented claims** | The product is designed to say “awaiting live proof” rather than imply a provider event, payment capture, refund, or chargeback result that has not occurred. |

## End-to-End Operating Flow

### 1. Merchant creates context

In **Seller Space**, a merchant adds a local product with a SKU, price, inventory, and description. The merchant can create a buyer-specific catalog token. The token is private and buyer-bound; simply browsing the catalog does not create an order or a payment.

### 2. Buyer chooses a product and Checkout is explicit

The buyer uses **Customer Space** to open the private catalog, chooses quantity, and explicitly selects Razorpay Checkout. The server creates a Razorpay order only after that action. Razorpay—not DisputeShield—owns payment method entry, card details, bank authentication, and OTP.

### 3. Payment facts are strengthened progressively

DisputeShield records several different payment facts. A created order proves only that an order exists. A Checkout callback can contain a response, and a server-verified signature strengthens payment identity, but neither alone proves capture. A Razorpay API observation or HMAC-verified `payment.captured` webhook is shown as a stronger, separately labelled capture fact.

| Payment layer | Meaning | What it does **not** prove alone |
| --- | --- | --- |
| Local order created | Merchant/buyer transaction context exists | Payment collection |
| Checkout opened | Hosted checkout was launched | Payment success |
| Signature verified | Server verified the Checkout response identity | Captured settlement |
| API observed | Razorpay API returned a payment state | Webhook delivery provenance |
| Webhook verified | Received event passed HMAC, scope, and idempotency checks | Issuer or bank outcome |

### 4. Merchant records fulfilment facts

Seller Space lets the merchant record `unfulfilled`, `packed`, `shipped`, `delivered`, or `delivery_exception`. These are merchant records. They create useful operational context but are never silently converted into carrier proof. A delivery exception or absent fulfilment record can trigger a proactive operational task.

### 5. Buyer opens a local issue or return

When something goes wrong, the buyer chooses an issue type such as product not received, damaged/wrong item, return request, refund issue, duplicate payment, wrong amount, or unauthorised transaction. The buyer may add documents and receive optional OCR candidate facts. The buyer must confirm any OCR output. The resulting object is a **local customer case**, not a chargeback.

### 6. Rules and AI organise the evidence work

DisputeShield derives the required evidence from the issue/reason category. A product-not-received review prioritises delivery and support evidence. A duplicate-payment review prioritises payment and order reconciliation. A refund-delay review weights payment confirmation and correspondence. The readiness score is **reason-code-weighted**: unrelated document uploads cannot artificially raise it. A separate standards-referenced mapping pre-organises candidate network evidence fields, but never replaces Razorpay's actual received `reason_code` or `reason_description`.

The AI Risk Narrative generates a cited operational explanation from permitted structured facts. It displays present/missing facts, a fact-sheet hash prefix, readiness, uncertainty, recommended operational step, and a no-decision safety boundary. If the model response is unavailable or unsafe, the same request deterministically returns a source-cited fallback.

### 7. Merchant resolves locally or prepares evidence

The merchant can review evidence, request missing proof, authorise a local return, record a local resolution, prepare a refund request, or prepare an evidence packet. A refund remains gated by capture evidence, return/receipt requirements where relevant, and explicit merchant approval. Packet preparation does not submit an external response.

### 8. External disputes arrive only from an external source

If a customer separately contacts the issuing bank and an external dispute reaches Razorpay, DisputeShield accepts it only through a source-labelled Razorpay API observation or a signed webhook. The signed webhook route enforces raw-payload size limits, HMAC verification, merchant scoping, and duplicate suppression before projecting the event into the merchant command centre.

### 9. Merchant makes the final decision

For a verified external dispute, the system presents the reason, deadline, evidence gaps, and packet readiness. The merchant—not the AI—chooses whether to accept or contest. The system does not auto-submit a response, issue a refund, communicate with the issuer, or declare a win/loss.

## Workspaces and Their Job

| Workspace | Main job | Safety boundary |
| --- | --- | --- |
| Home | Universal command centre for high-level risk, local cases, and external status | Data is merchant scoped; local and external paths remain separate. |
| Seller Space | Product, order, fulfilment, and local review context | Merchant fulfilment is labelled as merchant evidence. |
| Payments | Merchant-created Razorpay order and hosted Checkout launch | No capture/refund/dispute fact is inferred from the browser. |
| Customer Space | Private catalog, bound orders, issue/return intake, evidence, OCR | Buyer cannot see other orders or create an external dispute. |
| Disputes | External command centre | Only Razorpay/API or signed external facts can create trusted external state. |
| Settlements | Return/refund readiness | Local preparation is distinct from signed refund confirmation. |
| Evidence Packets | Prepare factual packet material | No external packet submission occurs from this view. |
| Case Timeline | Immutable local case events | Shows who/what/source, not a guessed outcome. |
| Document Vault | Protected document metadata and integrity graph | Evidence is scoped and source-labelled. |
| Webhook Ledger | Delivery verification and event health | Pending delivery is not proof of a source event. |
| Evaluation Lab | Held-out benchmark and learning boundary | Synthetic metric is not a bank-outcome predictor. |
| Reports | Hero Case, Truth Chain, risk context, capability status | Clearly separates verified code paths from awaiting-live-proof items. |
| Risk Operations console | Search, candidate evidence mapping, owner/level/note escalation, local trends, triage, and factual usage counts | Merchant-scoped organization only; it cannot penalize buyers, send external messages, issue a bill, move money, or submit a dispute response. |
| Account & Settings | Connection readiness and inactive integration registry | Browser never receives payment or webhook secrets. |

## Evaluation and Validation

The Evaluation Lab’s current benchmark is a **24-scenario synthetic held-out regression corpus**. It calculates precision, recall, F1, and the confusion-matrix cells for two bounded rules: fulfilment intervention and evidence-gap detection. The current corpus result is **100% precision, 100% recall, and 100% F1** for both rules across **N = 24** authored fixtures; this means the deterministic rule implementation agrees with those fixtures. It is **not** a prediction of fraud, bank results, customer intent, merchant ROI, or money saved.

The current safe-roadmap validation record includes **47 test files and 128 tests**, TypeScript, a production build, source-boundary tests, and responsive non-mutating entry-state checks for the registered Reports and Disputes operations routes. This pass adds regression coverage for merchant-team permission ordering, redacted audit export hashing, and bounded local case pagination alongside the prior buyer-scoped rate limiting, plain-text normalization, factual rolling reports, non-submitting Razorpay evidence preview, and Risk Narrative prompt versioning. Earlier evidence includes a Razorpay read-only credential check, a bounded Gemini server request, and all 13 public route entry states at desktop/mobile. Live payment completion, webhook delivery, refunds, external disputes, issuer outcomes, and authenticated browser mutations remain separately user-gated. The evidence is recorded in [`safe-roadmap-implementation-validation-2026-08.md`](./safe-roadmap-implementation-validation-2026-08.md), [`comprehensive-safe-validation-2026-08.md`](./comprehensive-safe-validation-2026-08.md), [`exhaustive-safe-validation-2026-08.md`](./exhaustive-safe-validation-2026-08.md), [`risk-operations-production-readiness-roadmap.md`](./risk-operations-production-readiness-roadmap.md), and [`master-build-prompt-reconciliation.md`](./master-build-prompt-reconciliation.md).

## What Is Working Now vs. What Requires Live Proof

| Working and validated in the build | Requires a real source record or user action |
| --- | --- |
| Tenant-scoped local cases, policy gates, candidate evidence mapping, reason-code readiness, audit trail, protected AI fallback, HMAC/duplicate/payload/burst webhook guards, merchant-owned SLA state, safe triage/trends/usage, benchmark, and judge-facing story | Merchant-authenticated completion of protected flows, a user-controlled Test Mode Checkout, published endpoint, Razorpay-delivered signed webhook, real refund event, external dispute, carrier event, Razorpay evidence export validation, or issuer outcome |

## Final Safety Promise

DisputeShield automates **matching, source labelling, evidence-gap detection, freshness checks, SLA prioritisation, risk explanation, and packet preparation**. It does not automate **money movement, final merchant decisions, external submissions, bank communication, customer fraud claims, or outcome declarations**.

That boundary is the product’s core: it helps merchants act earlier with better facts, while preserving the difference between what the application knows, what Razorpay has observed, what a signed webhook confirms, and what only an external institution can decide.
