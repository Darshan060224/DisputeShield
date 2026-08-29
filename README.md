# DisputeShield

Defence-only AI Risk Manager for Razorpay merchants. DisputeShield organizes payment, order, fulfilment, return, document, webhook, and dispute evidence so a merchant can see what is known, what is missing, and what requires review before taking a consequential action.

DisputeShield is an evidence-readiness and operations product. It does not decide that a buyer is fraudulent, create a bank dispute, guarantee a dispute outcome, or silently execute a refund or contest. Every external or financial action remains source-labelled, bounded, and merchant-gated.

## Product purpose

Merchants commonly have payment facts in one system, order and delivery records in another, return requests in a third, and supporting documents in email or storage. When a buyer reports an issue—or an issuing bank independently raises a chargeback—the merchant needs a defensible record of the facts and evidence gaps.

DisputeShield connects these records into a review workflow. Its central promise is not artificial certainty. It is evidence readiness with accountable human control: the application identifies records and gaps, explains their source, and prepares review material without turning an AI suggestion or local customer statement into a financial decision.

The primary Track 02 workflow is product/service not received, while the product also models damaged or wrong item, wrong amount, duplicate payment, unauthorised-transaction report, and refund-issue scenarios. These categories are organized as evidence workflows; they are not automatic accusations or provider submissions.

## Core truth boundary

| Source or state | What it means | What it does not prove |
| --- | --- | --- |
| Merchant observed | A merchant-entered product, order, fulfilment, return, or note exists | Payment capture, carrier confirmation, refund, or external dispute |
| Local customer case | A buyer submitted an issue or return inside Customer Space | Issuer involvement, chargeback, or Razorpay dispute |
| Synthetic local | A labelled walkthrough, benchmark, or demo fixture exists | A real buyer, provider, carrier, bank, or financial event |
| Signature verified | A Razorpay Checkout response signature passed server verification | Captured settlement or webhook delivery |
| API observed | Razorpay API returned the named provider record or state | HMAC delivery provenance or issuer outcome |
| Webhook verified | A webhook passed size, HMAC, scope, and idempotency checks | A bank outcome unless supplied by a named source |
| Private integrity anchored | A local record was included in the private database hash chain | Stronger payment truth, public blockchain anchoring, or dispute success |
| Awaiting live proof | The provider, carrier, or external step has not been observed | That the action failed; only that its source fact is absent |

A local case is not a bank dispute. A browser callback is not a captured payment. An AI narrative is not a merchant decision. A private hash anchor is not a public blockchain transaction.

## Product workflows

### Merchant and Seller Space

The merchant creates local product, price, inventory, order, and fulfilment records. Seller Space provides the operational context required to understand a later issue. Inventory reservations are conditional, and buyer-bound access is protected against first-redeemer races. Fulfilment milestones such as unfulfilled, packed, shipped, delivered, and delivery exception remain merchant-observed unless a stronger verified carrier source exists.

The merchant can create a clearly labelled local review for an order and issue type. That local review is useful for resolving a customer request or preparing evidence, but it cannot become a Razorpay dispute merely because it exists in the application.

### Customer Space

Customer Space is a private, buyer-scoped mini-commerce and local-resolution area. A buyer can browse a merchant catalogue, explicitly choose Razorpay Checkout, view permitted order state, report a local issue or return, upload supporting evidence, and review OCR candidate facts.

The buyer journey is:

```
Private merchant link
  -> buyer binding and scoped catalogue access
  -> explicit product selection
  -> server-side Razorpay order creation
  -> Razorpay-hosted Checkout
  -> source-labelled payment observation
  -> local issue or return request
  -> protected document intake and OCR candidates
  -> buyer confirmation of candidate facts
  -> merchant review and local resolution lane
```

Customer Space cannot create an external Razorpay dispute, contact an issuer, submit a contest, or automatically approve a refund. Card numbers, CVV, OTP, UPI PIN, and bank authentication are handled by the hosted Razorpay surface rather than DisputeShield.

## Payment, return, and refund facts

DisputeShield intentionally displays payment progression instead of one ambiguous “paid” label.

| Stage | Source | Interpretation |
| --- | --- | --- |
| Order created | Local record | A Razorpay order setup was requested; it is not proof of payment |
| Checkout signature verified | Server-side signature verification | The checkout response identity passed verification |
| Captured, API observed | Razorpay API | The API returned a captured state; webhook delivery is still separate |
| Captured, webhook verified | Signed Razorpay webhook | The event passed the webhook safety checks |
| Return dispatched or received | Buyer, carrier, or merchant record | A return milestone was recorded with its source |
| Refund prepared | Merchant-approved local process | A local request is ready; funds have not necessarily moved |
| Refund confirmed | Signed provider event | A named provider event reports the refund state |

The app does not infer a refund from a local return, a browser callback, or a button click. No automatic refund, contest, acceptance, issuer communication, or provider submission is enabled by this project boundary.

## External dispute lifecycle

An external dispute starts outside Customer Space when a buyer independently contacts an issuing bank and a provider or network later exposes the resulting record. DisputeShield can observe Razorpay API records and process a configured signed webhook, but it cannot manufacture the external event.

```
Issuer or bank investigates independently
  -> Razorpay exposes a dispute through API or signed webhook
  -> DisputeShield verifies webhook size, HMAC, scope, and idempotency
  -> Webhook Ledger records pending, verified, rejected, or duplicate state
  -> Risk Operations shows reason, deadline, phase, evidence gaps, and readiness
  -> Merchant reviews and may prepare evidence
  -> Merchant approval is required before any export or packet release
  -> No automatic contest, refund, provider write, or outcome claim
```

## Workspaces

| Workspace | Purpose |
| --- | --- |
| Home | Merchant overview, connected-account state, operational KPIs, local handoff, and external-dispute empty/loaded states |
| Disputes / Risk Operations | Merchant-scoped case discovery, reason classification, readiness, SLA ownership, evidence gaps, risk narrative, and review controls |
| Transactions / Payments | Payment-intake and Razorpay-observed payment facts with created, pending, captured, failed, and verification states |
| Seller Space | Local catalogue, inventory, orders, fulfilment milestones, and local review preparation |
| Customer Space | Buyer-scoped browsing, checkout entry, order tracking, issue/return intake, evidence upload, and OCR confirmation |
| Evidence packets | Review-only packet preparation and merchant approval boundary; no automatic provider submission |
| Case timeline | Source-labelled local and provider-linked event chronology |
| Document vault | Protected document references, validation metadata, and private checksum-anchor state |
| Webhook ledger | Signed Razorpay event status, duplicate suppression, reconciliation, and safe verified-webhook linkage |
| Reports | Stored-case workload/readiness facts, counterfactual explanation, benchmark interpretation, and private integrity root summary |
| Evaluation Lab | Synthetic held-out evaluation and transparent benchmark scope |
| Account and settings | Connection state, roles, notices, privacy boundaries, and activation requirements |

The dashboard uses a persistent sidebar and responsive merchant-console layout. Route navigation must remain available from subpages; protected pages show explicit authentication and empty states rather than pretending data exists.

## Architecture

DisputeShield is a full-stack TypeScript application.

```
React 19 + Vite + Tailwind 4
          |
     tRPC client
          |
Express 4 + tRPC 11 server
          |
  Drizzle ORM + MySQL/TiDB
          |
Razorpay API / signed webhook / protected storage / server-side LLM helpers
```

### Repository map

```
client/src/App.tsx                         Route composition and application shell
client/src/components/DashboardLayout.tsx Persistent merchant navigation and auth shell
client/src/pages/OperationsWorkspace.tsx  Merchant operations, reports, vault, ledger
client/src/pages/CustomerSpace.tsx         Buyer-scoped catalogue and local-resolution flow
server/routers.ts                          Main protected tRPC procedures
server/razorpay.ts                         Razorpay API and signed-webhook handling
server/riskNarrative.ts                    Fact-sheet risk narrative and fallback contract
server/ollamaSentiment.ts                  Explicit local sentiment adapter, when enabled
server/privateIntegrity.ts                 Hash-chain, canonicalization, verification, Merkle root
server/privateIntegrityService.ts          Durable serialized anchor appends
server/caseAuditExport.ts                  Redacted merchant-approved audit export builder
server/merchantTeamAccess.ts               Local role and approval evaluator
server/db.ts                               Drizzle database helpers
drizzle/schema.ts                          Database schema
drizzle/*.sql                              Reviewed schema migrations
docs/                                      Source-bound design and validation records
imp/                                        Consolidated implementation documentation
prompt-readme.md                            Reusable Azure migration implementation prompt
azure-openai-migration.md                  Azure deployment and credential guide
```

All normal backend interactions use tRPC. The raw Razorpay webhook route is an intentional exception because signature verification must operate on the raw request body before JSON parsing. Secrets remain server-side.

## AI role

The AI layer is an assistant for interpretation and prioritization, not a transaction authority. The current Risk Narrative flow builds a strict Case Fact Sheet from normalized records and asks a configured server-side LLM helper for a concise structured narrative. It retains the prompt version, fact-sheet hash, readiness, evidence lists, citations, and an explicit boundary statement.

The narrative may explain the supplied payment and fulfilment states, identify missing or conflicting evidence, describe the reason-specific readiness calculation, and state a rules-backed internal next step. The server rejects malformed JSON, invalid citations, excessive prose, monetary language, and fraud-adjacent or unsupported claims. If the model is unavailable, overloaded, malformed, or unsafe, the deterministic fact-cited fallback remains authoritative for the UI.

A separate local Ollama sentiment adapter can provide an explicitly requested language or sentiment hint for a stored statement. It is not evidence of intent, fraud, manipulation, eligibility, fault, or outcome. It cannot deny a case, block a buyer, approve or refuse a refund, or trigger an external action.

The current server helper uses the platform’s server-side LLM gateway and a configured model identifier. The requested Azure deployment migration is documented but is not considered active until its endpoint, deployment, authentication, structured-output support, and smoke test are verified. See [azure-openai-migration.md](azure-openai-migration.md) and [prompt-readme.md](prompt-readme.md).

## Evidence readiness and reason mapping

Readiness is reason-specific. A document count alone cannot make a case ready. The application identifies found, missing, and conflicting requirements with source references. Candidate mappings help organize provider-shaped evidence fields, but an actual received Razorpay reason code takes precedence. A candidate code never becomes an issuer or network fact merely because the UI displays it.

Examples include product-not-received evidence such as shipping proof, proof of service, customer communication, and terms; refund-issue evidence such as refund confirmation, refund policy, communication, and billing proof; and other categories that remain in human review when an official code or sufficient source evidence is unavailable.

## Private evidence integrity

DisputeShield contains a private database-backed cryptographic integrity layer. It is not a public blockchain and does not create wallets, tokens, smart contracts, gas fees, or external chain transactions.

Current integrity behavior includes:

| Surface | Current behavior |
| --- | --- |
| Approved audit export | Merchant-approved redacted export creates an immutable audit_export anchor and a dedicated local timeline event |
| Stored document | A checksum anchor is created only after protected document storage and metadata insertion; the anchor excludes file bytes, storage keys, and content |
| Verified refund webhook | A private anchor is created only when a signature-verified refund confirmation reconciles to a merchant-approved local case/refund request |
| Case timeline | Dedicated private-integrity event and short reference badge are shown separately from payment/provider provenance |
| Document Vault | Merchant-only boolean status distinguishes private checksum anchored from not recorded |
| Risk Operations | Merchant can verify one selected case’s chain on demand |
| Reports | Authenticated merchant sees a current private Merkle-root summary, not a public-chain claim |
| Invalid chain | Forks, cycles, orphans, hash mismatches, and unsupported versions block further append rather than being hidden or rewritten |

Anchors are canonicalized and hashed with SHA-256. Database timestamp precision is normalized to whole seconds before hashing and the exact hashed timestamp is persisted. Per-case head records and transactional locking serialize current appends across concurrent application instances. Duplicate logical source anchors are replay-safe.

The integrity layer proves consistency of selected local records under its contract. It does not upgrade the source hierarchy, prove that a payment was captured, validate an issuer outcome, or make a packet legally sufficient.

## Security and privacy controls

The app applies authenticated merchant and buyer scoping, protected tRPC procedures, server-side input normalization, bounded text and document handling, webhook HMAC verification, duplicate suppression, raw-body size limits, safe parser errors, and role-aware merchant approval controls.

Protected documents are stored as references rather than database blobs. The database retains metadata and integrity information; file bytes are not placed in database columns. Current binary/type/size checks are not a malware quarantine service. Malware scanning, retention/deletion policy, distributed rate limiting, centralized observability, and full role lifecycle remain production hardening requirements.

The application does not collect card number, CVV, OTP, or UPI PIN. Razorpay-hosted Checkout owns credential entry and authentication. This is a product boundary, not a PCI certification claim.

## Automation and approval model

| Category | Description |
| --- | --- |
| Safe automation | Record matching, source labels, readiness calculations, missing/conflicting evidence, deterministic triage, internal SLA notices, structured AI/fallback generation, webhook validation, private integrity append |
| Explicit action still required | Sign-in, private-link redemption, hosted Checkout credentials, fulfilment entry, buyer issue submission, OCR confirmation, merchant resolution, export approval, refund execution, external contest/accept, webhook configuration, publication, and outcome recording |

The application is deliberately defense-only. It does not auto-deny a case, penalize a buyer, classify a customer as fraudulent or manipulative, create a chargeback, submit a response to Razorpay, contact an issuer, or infer that a refund occurred.

## Evaluation and garak testing

The Evaluation Lab uses a versioned synthetic held-out corpus for deterministic rule families such as fulfilment-intervention signals and evidence-gap detection. Recorded metrics describe agreement with that synthetic corpus; they are not fraud accuracy, dispute-win rate, customer-intent accuracy, ROI, or money protected.

Garak testing is separate from application validation. The local target is `pilardi/sentiment-analysis:gemma3`. A compact smoke suite can use exact probe classes such as:

```
probes.promptinject.HijackLongPrompt
probes.latentinjection.LatentInjectionFactSnippetEiffel
probes.encoding.InjectBase64
probes.sysprompt_extraction.SystemPromptExtraction
```

For a small machine, use one probe at a time, `generations: 1`, and a clearly documented `soft_probe_prompt_cap`. A five-prompt run is a smoke test, not a statistically reliable benchmark. Every report must record provider, model, garak version, probe, generation count, prompt cap, date, and whether the result is synthetic, smoke, or reproducible. Never fabricate benchmark results; illustrative images must be prominently labelled as synthetic demos.

Garak tests model behavior. They do not replace the application’s adapter tests for schema validation, citation restrictions, forbidden-language rejection, timeout handling, fallback, and no-secret client exposure.

## Local development

### Prerequisites

Use Node.js, pnpm, and a configured MySQL/TiDB database. The managed environment supplies platform variables such as database connectivity, OAuth, storage, and built-in LLM gateway settings. Do not create a plaintext `.env` file containing production values.

### Install and run

```bash
pnpm install
pnpm dev
```

The development server uses the managed runtime port. Do not hardcode a port in application code. The server starts the Vite client and Express/tRPC backend through `server/_core/index.ts`.

### Quality commands

```bash
pnpm check       # TypeScript, no emit
pnpm test        # Vitest suite
pnpm build       # Vite client and bundled server build
pnpm format      # Prettier
```

The latest recorded full validation baseline for the integrity hardening work is 49 Vitest files / 134 tests, with TypeScript and production build passing. That baseline does not mean Azure inference is active or that post-publish Razorpay delivery has been validated.

### Database changes

Use a schema-first process:

```
Edit drizzle/schema.ts
  -> pnpm drizzle-kit generate
  -> review generated SQL for destructive operations
  -> apply through the managed database migration mechanism
  -> verify the resulting schema and tests
```

Do not insert test data through arbitrary SQL. Existing integrity migrations include the case anchor table and durable per-case head table. Destructive schema changes require explicit review and backup planning.

### Configuration and secrets

The platform injects existing project configuration. Typical server-side variables include database, OAuth, storage, built-in gateway, JWT, and Razorpay settings. New integration variables must be added through the project’s secure secret-management workflow.

For the optional Azure migration, the expected names are:

```
AZURE_OPENAI_ENDPOINT
AZURE_OPENAI_DEPLOYMENT
AZURE_OPENAI_API_VERSION
AZURE_OPENAI_API_KEY       # only when key authentication is used
```

Do not put API keys in React code, URLs, logs, screenshots, garak reports, fixtures, or chat. Prefer Microsoft Entra keyless authentication for production where the Azure resource is configured for it. A model registry URI such as `azureml://...` is not a direct inference endpoint.

## Validation status and known limitations

The current implementation has extensive deterministic coverage for routing, authorization, payment-state semantics, webhook HMAC/idempotency, evidence readiness, approval gates, AI fallback, private-integrity canonicalization, chain tamper detection, forks, timestamp precision, serialized appends, document anchors, verified refund-webhook anchors, and visible protected reflections.

The following are intentionally not claimed as completed production proof:

* A published DisputeShield webhook delivery observed from the live Razorpay dashboard.
* A completed hosted Razorpay test payment and corresponding signed webhook in the published environment.
* A live external contest, refund, issuer communication, or dispute outcome.
* Azure OpenAI authentication and model inference for `gpt-5-6-luna`.
* Malware quarantine, distributed rate limiting, centralized production observability, retention/deletion controls, or full invitation/revocation role lifecycle.
* Public blockchain anchoring or any external ledger transaction.

## Production activation checklist

Before a merchant relies on the system in production, establish separate staging and production database, storage, webhook-secret, Razorpay-key, and URL boundaries. Complete authenticated UAT across merchant, seller, buyer, loading, empty, failure, payment, return, document, and mobile states. Publish only through the platform workflow after review and a current checkpoint.

Configure a separate Razorpay webhook for DisputeShield without changing unrelated webhook destinations. Observe an allowed signed event in the published ledger before relying on delivery status. Validate the exact provider evidence shape under explicit merchant approval before adding any provider write capability. Add distributed operational controls, malware scanning/quarantine, retention and deletion, privacy-safe alerting, cross-browser and accessibility checks, controlled load tests, rollback rehearsal, and peer review.

## Documentation map

| Document | Purpose |
| --- | --- |
| `imp/00_DOCUMENTATION_GUIDE.md` | Documentation navigation |
| `imp/06_COMPLETE_WORKFLOW_AND_FEATURES.md` | Complete actor and feature workflow |
| `imp/09_A_TO_Z_FEATURE_INVENTORY.md` | Alphabetic implementation inventory |
| `imp/03_VALIDATION_AND_SECURITY.md` | Validation and security evidence |
| `imp/04_RAZORPAY_TRUTH_AND_EVIDENCE.md` | Razorpay source and evidence boundaries |
| `imp/05_PRODUCTION_READINESS.md` | Production gates and limitations |
| `docs/private-evidence-integrity-design.md` | Private integrity contract and reflection design |
| `docs/private-evidence-integrity-adversarial-review-2026-08.md` | Verified integrity flaws and remediations |
| `docs/disputeshield-judge-handout.md` | Judge-facing demo and rehearsal guide |
| `azure-openai-migration.md` | Azure endpoint, deployment, secret, and smoke-test guide |
| `prompt-readme.md` | Copy-ready migration prompt |

## License

This repository declares the MIT license in `package.json`. Review all third-party service terms, data-processing terms, Razorpay requirements, and deployment obligations before commercial use.

## References

* Razorpay — Submit Evidence for Disputes
* Razorpay — Disputes API entity
* Microsoft Foundry model endpoints
* Microsoft Foundry model deployments
* Azure Machine Learning registries
* Google Gemini API documentation
