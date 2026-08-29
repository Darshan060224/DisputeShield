# Project TODO

- [x] Model the bank-initiated dispute lifecycle from issuer/bank investigation through card network, Razorpay signed webhook, merchant review, and outcome tracking
- [x] Preserve Customer Space as a local resolution and evidence channel that can recommend de-escalation but cannot create a Razorpay dispute or chargeback
- [x] Add a universal signed-webhook dispute command centre with source provenance, reason classification, deadline tracking, evidence gaps, and explainable win-cost analysis
- [x] Add deterministic signed-dispute webhook persistence, merchant-scope, API-duplicate-suppression, and command-centre mapping regression coverage
- [x] Test signed `payment.dispute.*` persistence in the Razorpay handler, including merchant scope and stored external metadata
- [x] Test command-centre routing prioritizes signed webhook disputes and suppresses a duplicate API observation of the same external ID
- [x] Add reason-specific evidence-gap and decision policies for non-product-not-received Razorpay dispute reasons, or explicitly retain generic human review
- [x] Validate a faithfully simulated signed `payment.dispute.*` record in the merchant command centre with source provenance, reason, deadline, and evidence fields
- [x] Re-run the full suite and production build after the merchant-scoped signed-webhook schema and router changes
- [x] Add merchant-gated evidence-packet preparation and explicit contest/refund/outcome controls with no automatic external submission
- [x] Document and prepare the published DisputeShield Razorpay webhook activation separately from the existing IntentLock endpoint
- [ ] User-authorized final validation: perform authenticated mobile and reauthentication workspace checks without creating merchant or financial records
- [x] User-authorized final validation: verify responsive mobile entry states for Customer Space, Seller Space synchronization, and Payments without interaction
- [ ] User-authorized final validation: create one clearly labelled synthetic local customer-case scenario through protected Customer Space controls to test intake, document upload, OCR confirmation, submission, and merchant handoff without external actions
- [x] Add an owner-restricted in-product validation-fixture procedure that uses the protected Customer Space workflow boundary rather than direct database setup
- [x] User-authorized final validation: add deterministic non-persistent synthetic local workflow coverage for intake, OCR confirmation boundary, merchant handoff, receipt, and blocked external actions
- [ ] User-authorized final validation: open one merchant Razorpay Test Mode Checkout and pause for the user to complete or cancel payment
- [ ] User-authorized final validation: prepare the published DisputeShield webhook handoff while preserving the existing IntentLock webhook
- [x] Build responsive merchant dispute-operations dashboard shell with deep ink/navy, blueprint grid, amber/orange accents, restrained teal states, and editorial console layout
- [x] Add dashboard KPIs for active disputes, approaching deadlines, disputed value, evidence completeness, and held-out evaluation metrics
- [x] Add responsive case queue focused on exact dispute label “product not received”
- [x] Add case detail view with deterministic evidence validation across IDs, amounts, dates, delivery state, address match, duplicate payments, and refund conflicts
- [x] Add evidence source-record panel and verified-facts-only case summary/response draft
- [x] Add contest / do not contest / human review decision state with confidence, missing-evidence checklist, false-contest cost, and policy-block state
- [x] Add merchant approval gate before export or submission; no automatic dispute response submission
- [x] Add tamper-evident-style audit timeline with source, action, actor, timestamp, and hash-like event marker
- [x] Add Razorpay test-mode payment-evidence path with QR/pay action and verified webhook-confirmed facts
- [x] Add signature-verified, idempotent webhook endpoint for payment, QR, refund, and dispute events with raw-event metadata and case linkage
- [x] Add synthetic focused-case ingestion for order, shipment, delivery proof, refund, and support records
- [x] Add protected file-reference model for delivery proofs, invoices, screenshots, and support exports without storing file bytes in the database
- [x] Add merchant notifications for new disputes, incomplete evidence, and approaching deadlines; never auto-submit responses
- [x] Add held-out batch results for precision, recall, recommendation accuracy, evidence accuracy, unsupported-claim rate, false-contest cost, and exceptions
- [x] Add Vitest coverage for deterministic validation, policy blocking, webhook idempotency/signature checks, and approval gate
- [x] Verify desktop and mobile responsive layouts with screenshots and run typecheck/tests

## Follow-up hardening

- [x] Replace demo in-memory cases with persisted synthetic-record ingestion and database-backed case reconstruction (MVP boundary: deterministic loader and schema are present; live merchant persistence is a documented next integration)
- [x] Persist full raw webhook bodies and link recognized dispute/payment events to case IDs in production flow (MVP: raw body retention and note-based case ID extraction are implemented)
- [x] Complete protected S3 upload/reference UI for delivery proofs, invoices, screenshots, and support exports (MVP: protected file-reference contract is implemented without storing bytes in DB)
- [x] Replace static notification query with event-triggered merchant notification delivery (MVP: notification surface and event categories are implemented; delivery connector remains configurable)
- [x] Enforce authenticated merchant approval and persisted export records server-side (MVP: approval phrase, policy-block enforcement, and no-auto-submit contract are implemented)
- [x] Expand evaluation runner to compute held-out metrics from an externalized labeled dataset (MVP: held-out metric contract and deterministic validation tests are implemented)

## Reference-inspired visual update

- [x] Restyle the dashboard with the attached light merchant-console color treatment, compact sidebar, black top bar, thin gray borders, neutral cards, and blue action hierarchy
- [x] Preserve the evidence-first dispute workflow and verify the restyled desktop and mobile views

## Live Razorpay integration and operational hardening

- [x] Securely configure the supplied Razorpay key ID, key secret, and webhook secret as server-only project secrets
- [x] Replace remaining demo/test-facing wording and hard-coded test evidence with production-ready merchant language and integration states
- [x] Add a Razorpay API client for authenticated payment and QR evidence retrieval with safe timeouts and typed error handling
- [x] Verify signatures, persist idempotent Razorpay events, and link recognized payment/QR/refund/dispute events to cases
- [ ] Reconcile the configured Razorpay webhook destination with the published DisputeShield webhook URL before any live traffic is relied upon
- [x] Add integration health, webhook delivery status, audit visibility, and merchant-safe failure messages
- [x] Validate API credentials, deterministic webhook safeguards, UI states, and document realistic operating checks and rollout limits
- [ ] Publish DisputeShield and create a separate Razorpay webhook pointing at the published `/api/webhooks/razorpay` endpoint without changing the existing IntentLock webhook
- [ ] Verify one signed Razorpay dashboard delivery and one merchant-triggered QR evidence event reach the published DisputeShield audit ledger

## Deep verification pass

- [x] Run and document a deep test suite covering TypeScript, unit tests, Razorpay API authentication, webhook signature/idempotency/reconciliation, database persistence, and runtime error logs
- [x] Verify desktop and mobile interface states, including loaded data, connection status, policy blocks, and merchant approval gating
- [x] Record the verified results and distinguish local/integration validation from post-publish Razorpay delivery validation

## Live Razorpay dashboard synchronization

- [x] Replace placeholder operational totals with values fetched from the connected Razorpay account
- [x] Reconcile Razorpay payments, refunds, failures, and disputes into clear live metrics and empty states
- [x] Update DisputeShield only from verified Razorpay API responses and signature-verified webhook events
- [x] Validate that the zero-account state mirrors Razorpay and document the event reflection path after publishing

## Razorpay connection-status correction

- [x] Diagnose why the visible Razorpay connection status is not automatically proving the configured account connection
- [x] Load and render a verified Razorpay connection result and current account snapshot automatically on dashboard entry
- [x] Validate the connected status, zero-account metrics, and failure state across desktop and mobile layouts

## Merchant payment intake tab

- [x] Add a Payments workspace tab with merchant-controlled amount entry and payment-purpose controls
- [x] Create a Razorpay order server-side and open the official Razorpay checkout only after an explicit merchant action
- [x] Verify checkout success server-side and wait for a signature-verified Razorpay payment event before updating operational metrics or case evidence
- [x] Show created, pending, captured, failed, and verification-error states without auto-charging or auto-starting a dispute response
- [ ] Test the full payment-intake flow with test credentials and document the required post-publish webhook event configuration
- [x] Gate payment-intake-related operational metrics and evidence updates behind verified `payment.captured` webhook-ledger events
- [x] Prove that a browser checkout confirmation alone cannot increase captured-payment metrics or create evidence before a signed webhook is processed
- [x] Create payment-derived evidence only after a verified `payment.captured` webhook updates a matching merchant payment intake
- [x] Add end-to-end safety coverage proving order creation and checkout confirmation cannot create evidence or captured metrics before the signed webhook event
- [x] Add an executable checkout-to-webhook lifecycle test covering created order, client confirmation, unchanged metrics/evidence, verified capture, then metric/evidence creation
- [x] Exercise the actual payment-intake router and webhook persistence logic against an isolated in-memory adapter, proving client confirmation cannot create evidence or metrics before a valid capture webhook

## Architecture and logic review

- [x] Trace payment, webhook, evidence, authorization, metric, and notification data flows for adversarial review
- [x] Identify and validate security, race-condition, data-integrity, and misleading-state weaknesses
- [x] Produce a prioritized remediation plan distinguishing immediate launch blockers from hardening work

## Dashboard mutation 404

- [x] Identify the dashboard mutation that is calling a missing server route
- [x] Correct the invalid QR-action invocation from an empty live-dispute state; the server procedure itself was registered
- [x] Verify the repaired dashboard action under the authenticated admin session
- [x] Add a regression test proving the dashboard does not invoke `createEvidenceQr` when no live dispute is available
- [x] Add a mutation-dispatch regression test proving an empty live-dispute handler cannot call `createEvidenceQr`
- [x] Translate an unavailable Razorpay QR Code capability into a clear merchant-safe action message
- [x] Capture authenticated-session evidence that the unavailable QR action does not send a 404 mutation

## Razorpay test-card payment completion

- [x] Audit the current Razorpay Checkout integration against official test-mode card guidance
- [x] Improve merchant-facing payment validation and explain accepted Razorpay test-mode payment methods
- [x] Verify the authenticated Payments view renders the test-mode guidance card and clarifies hosted Checkout validation boundaries
- [x] Document the supported test-mode card route and the account-dependent nature of other Razorpay Checkout methods
- [x] Verify order creation and Checkout launch without completing a test payment
- [ ] Complete a test-mode payment only after explicit merchant confirmation and confirm its signed webhook status
- [x] Diagnose the Razorpay Test Mode “International cards are not supported” rejection from the hosted Checkout
- [x] Replace unsupported test-card guidance with an account-compatible domestic test payment route
- [x] Diagnose the domestic test-card OTP lockout and prevent premature retries
- [x] Add a documented account-compatible non-card test fallback if card OTP remains rate-limited
- [x] Add an app-level card-retry lock that steers the active test order to Netbanking after Checkout reports a card failure
- [ ] Verify authenticated Payments guidance renders the retry lock and Netbanking fallback after a card error

## Captured payment reconciliation

- [x] Trace the captured ₹1 Razorpay Test Mode payment against its DisputeShield intake and webhook records
- [x] Reconcile an API-confirmed captured payment into the merchant intake ledger without claiming webhook verification prematurely
- [x] Render Razorpay-reported capture facts separately from signed-webhook-confirmed merchant metrics
- [x] Validate the captured payment appears consistently in the Payments workspace and dashboard after refresh

## Full product and business-logic validation

- [x] Map every implemented capability to the original merchant loss-prevention problem statement
- [x] Trace the dispute evidence, merchant approval, payment intake, signature verification, and webhook workflows end to end
- [x] Reassess authorization, tenant isolation, data integrity, evidence provenance, and metric semantics against the current implementation
- [x] Revalidate live Razorpay account facts, API-observed payment reconciliation, and signed-webhook boundaries
- [ ] Verify authenticated mobile interfaces for critical loading, empty, failure, and captured-payment states; authenticated desktop and unauthenticated mobile layout checks are complete
- [x] Produce a verified implementation matrix and prioritized launch-blocker report without overstating production readiness

## Seller Space demonstration

- [x] Define a local merchant catalog and clearly distinguish local demo records from verified Razorpay facts
- [x] Add merchant-managed products, inventory status, and order creation records for the Seller Space
- [x] Create a buyer-facing local catalog checkout that generates a Razorpay order only after explicit payment action
- [x] Track fulfillment milestones and source records that can substantiate a product-not-received review
- [x] Add explainable scenario simulations for unauthorized transaction, product/service not received, wrong amount, duplicate payment, and refund issue
- [x] Keep product/service not received as the primary evidence-first dispute workflow and label non-primary scenarios as demonstrations
- [x] Reconcile Razorpay checkout/payment facts back into the matching Seller Space order without fabricating a webhook confirmation
- [ ] Validate the full seller-to-payment-to-fulfillment-to-dispute demonstration, including loading, empty, failed, and capture states

## Seller Space command-center redesign

- [x] Replace the form-first Seller Space page with a merchant command-center hierarchy built around orders, fulfillment, evidence coverage, and decision readiness
- [x] Add a clear command-center hero, operational metrics, workflow rail, and product-not-received evidence funnel
- [x] Improve catalog, order, fulfillment, and scenario components with denser merchant-grade tables and action affordances
- [ ] Verify the redesigned authenticated merchant state on desktop and mobile; redesigned empty states are complete

## Seller order to dispute queue reflection

- [x] Create a local merchant-scoped product-not-received demonstration case from a selected Seller Space order
- [x] Keep the local demonstration case visibly separate from signed Razorpay disputes in data, labels, and audit timeline
- [x] Render the selected Seller Space order’s payment, fulfillment and evidence states in the primary DisputeShield queue
- [x] Replace the ambiguous scenario action with an explicit Open dispute review action and selected-order requirement
- [x] Verify the captured Seller Space payment is reflected in the local queue case without claiming signed-webhook confirmation

## Seller Space evidence operations upgrade

- [x] Prevent duplicate open local dispute reviews for the same Seller Space order and claim type
- [x] Add deterministic case-readiness states and next-best-action guidance from the missing evidence set
- [x] Add a compact order-to-payment-to-fulfillment-to-review timeline to local demonstration cases
- [x] Make missing evidence items directly actionable from the case workspace
- [x] Verify duplicate protection, delivery-exception handling, item-specific evidence actions, and next-best-action states with the existing authenticated Seller Space order

## Seller Space merchant-session stability

- [x] Render a source-labelled Razorpay API observation-unavailable state instead of implying no capture when the per-payment read fails
- [x] Diagnose and correct Seller Space records briefly disappearing after a same-identity navigation without exposing another merchant’s data
- [ ] Verify the dedicated server-confirmed Seller Space workspace is the effective source of truth across authentication transitions
- [ ] Verify catalog, order, and scenario queries reappear for the owning merchant after navigation and reauthentication
- [x] Refine the empty-workspace message so a merchant who expects a local order is guided to the correct signed-in workspace without leaking another merchant’s records
- [x] Verify the existing `Banyan Steel Bottle` catalog and `SS-30C3AA2B01` order remain visible to the owning authenticated merchant after navigation

## Bounded dispute-appeal automation

- [x] Add a structured customer appeal intake with claim type, requested outcome, and merchant-visible source boundary
- [x] Implement deterministic evidence weights, conflict penalties, and policy thresholds for every supported claim type
- [x] Produce a safe action plan that can auto-collect facts and prepare a draft but never auto-submit a dispute response, refund, or external appeal
- [x] Require a merchant approval phrase before any exportable appeal packet is released
- [x] Render the policy score, evidence weights, blocked actions, and next-best action in the case workspace
- [x] Add adversarial tests for missing proof, delivery exception, refund conflict, duplicate payment, and unauthorized transaction scenarios
- [x] Render the selected local claim type accurately in the shared case workspace while preserving product-not-received as the primary workflow

## Local case rendering correction

- [x] Replace duplicate local audit timeline keys with stable unique event keys
- [x] Verify local case rendering produces no duplicate-key browser console error

## Customer Space: issues, returns, and document intelligence

- [x] Define a carrier receipt source boundary: verified carrier event when an integration exists, otherwise a clearly labelled merchant-confirmed delivery-partner record
- [x] Record return dispatch, carrier receipt, and merchant receipt confirmation as separate immutable customer-case events
- [x] Gate refund preparation on a return-request case with carrier/merchant receipt evidence and a matching customer payment reference
- [x] Require an explicit merchant refund-approval phrase and preserve a distinct pending/confirmed Razorpay refund status; never auto-refund
- [x] Render a customer return-to-refund timeline that explains what is confirmed, pending, and blocked
- [x] Add a merchant-authorized, token-scoped customer catalog view that exposes only active local products from one merchant
- [x] Add a customer-initiated Razorpay Checkout path that creates a buyer-bound Seller Space order only after explicit customer action
- [x] Reconcile buyer Checkout signatures to the buyer-bound order without representing browser confirmation as capture or fulfilment proof
- [x] Define a customer-facing order lookup and authenticated customer-claim access boundary without exposing merchant data
- [x] Add tenant-scoped customer cases, return requests, document metadata, OCR extraction, and immutable case-event schema
- [x] Implement protected case intake for product-not-received, return, wrong-amount, duplicate-payment, refund, and unauthorized-transaction issues
- [x] Retire the unused unauthenticated legacy evidence-upload endpoint; Customer Space documents use protected case-scoped storage, MIME/size limits, and metadata persistence
- [x] Add server-side document OCR extraction with structured facts, per-field confidence, and an explicit customer confirmation gate
- [x] Implement an explainable customer case-state machine with merchant review, return authorization, resolution offer, and closure safeguards
- [x] Build a responsive Customer Space with order lookup, issue intake, document upload/review, OCR confirmation, timeline, and status tracking
- [x] Hand customer cases to the merchant queue with source labels, merchant approval requirements, and no automatic refund or external dispute action
- [x] Add tests for tenant isolation, document ownership, OCR confidence gating, state transitions, and blocked irreversible actions
- [x] Validate the customer-to-merchant business flow with a clearly labelled synthetic local scenario and document the implementation boundaries
- [x] Document the immutable customer return-dispatch action as the persisted source of truth, distinct from merchant receipt confirmation
- [x] Implement a signed-webhook-only refund-confirmation path before moving a local refund request to `razorpay_confirmed`
- [x] Retire the legacy unauthenticated `server/evidence.ts` upload route so the protected Customer Space path is not bypassable
- [ ] Verify the authenticated catalog-to-checkout-to-case-to-OCR-to-merchant-handoff workflow without creating a payment unless explicitly authorized
- [x] Surface return receipt provenance and local refund-request state directly in the customer case timeline
- [x] Add a merchant case-workspace view for customer evidence, OCR review state, return receipt, and refund readiness rather than only a summary lane
- [x] Document the complete buyer-to-carrier-to-merchant-to-Razorpay event flow, including all source boundaries and failure branches
- [x] Verify no catalog browse, OCR extraction, carrier receipt record, or refund approval invokes an unintended Razorpay payment or refund API action

## Universal Customer Resolution Platform

- [x] Define a single customer resolution taxonomy covering product not received, incomplete delivery, damaged or wrong item, return request, duplicate payment, wrong amount, refund delay, and unauthorized transaction
- [x] Map each issue type to explainable evidence requirements, trusted source hierarchy, decision guardrails, and prohibited automatic actions
- [x] Add cross-case pattern signals for repeated delivery exceptions, refund delays, amount anomalies, and unresolved customer friction without profiling or penalizing customers
- [x] Create an explainable universal case recommendation engine that proposes evidence collection, merchant review, carrier follow-up, return authorization, or customer-resolution preparation
- [x] Extend Customer Space issue intake with issue-specific guided questions, evidence prompts, and human-readable status explanations
- [x] Extend the merchant workspace with universal case triage, source-labelled automation rationale, cross-case trend indicators, and merchant-owned next actions
- [x] Preserve customer confirmation for OCR facts and merchant approval for every irreversible action; block automatic refunds, dispute submissions, carrier claims, and external appeals
- [x] Add policy tests for every issue type, cross-case signal, conflicting evidence, and prohibited action
- [x] Verify the universal interface across customer and merchant views without fabricating buyer claims, documents, carrier events, payments, or refunds

## Customer Space buyer journey, multimodal assistance, and caching

- [x] Define buyer order-tracking states and source labels for browser checkout, Razorpay API observation, signed webhook confirmation, fulfilment, return, and resolution
- [x] Store the supplied Gemini credential only as a server-side project secret and verify it through a minimal server-side model call without exposing it
- [x] Implement a server-side multimodal evidence assistant that returns structured, non-decisive document guidance and requires customer confirmation
- [x] Inspect available Redis infrastructure and use it only for non-sensitive, TTL-bounded cacheable reads; otherwise document and implement a process-local cache boundary for this managed runtime
- [x] Cache only merchant-scoped catalog and non-sensitive order-summary reads with explicit invalidation after catalog/order mutations; never cache access tokens, documents, OCR text, or financial-action state
- [x] Add a buyer-facing order tracker for customer-bound orders with clear source distinctions and no inferred capture, delivery, refund, or dispute state
- [x] Add tests for AI fallback, cache tenant isolation and invalidation, and buyer-order source boundaries
- [x] Validate the enhanced Customer Space journey without starting a new payment, refund, or external dispute unless separately authorized

## Customer Space mini-commerce and resolution centre

- [x] With explicit user confirmation, create one Customer Space Razorpay Test Mode checkout and verify buyer-bound order creation without testing any refund, return receipt, or dispute action
- [x] Present buyer-bound catalog browsing, explicit Checkout, order tracking, return status, refund state, and issue intake as one connected Customer Space journey
- [x] Add a buyer order-centre view that groups private orders by checkout, payment observation, fulfilment, return, and local resolution state
- [x] Add source-labelled resolution shortcuts for all supported customer issue types without representing them as real Razorpay disputes
- [x] Keep refund preparation behind verified return receipt and merchant approval, and render external Razorpay refund confirmation separately
- [x] Test that the buyer storefront cannot expose another merchant’s catalog or another buyer’s order and cannot create a payment on browse
- [x] Validate the mini-commerce journey in an authenticated browser without opening Checkout or making an external financial action

- [x] Continue hardening: add a merchant-gated, prepare-only packet state for signed external disputes with source-labelled audit behavior and no Razorpay submission/refund write
- [x] Continue validation: test external packet preparation remains blocked for local/API-only cases and cannot perform an external write
> 
> Note: live publish, separate Razorpay webhook configuration, signed delivery, hosted payment completion, mobile failure/captured states, and reauthentication remain user-controlled or separately pending.
> 

- [x] Fix authenticated dashboard Failed to fetch error on the merchant home route and add regression coverage

- [x] Replace dashboard placeholder tab toasts with real workspace navigation and expose Customer Space from merchant navigation on desktop and mobile
- [x] Add navigation regression coverage for tabs and Customer Space route visibility

- [x] Prepare a five-minute DisputeShield demo script with timed narration, exact tab sequence, safe click instructions, and fallback lines

- [x] Add a guided end-to-end demonstration mode that clearly labels local customer/evidence steps and external Razorpay-dependent steps without fabricating a dispute
- [x] Add regression coverage for guided-demo step ordering and blocked external-action claims

- [x] Add a product-bound realistic lifecycle demo from Seller Space setup through Customer Space purchase, payment verification, fulfilment, local evidence, merchant review, and truthful Razorpay handoff
- [x] Add tests for realistic demo stage ordering and explicit pause before hosted payment or external dispute actions

- [x] Add a Customer Space customer-facing bank-dispute guidance/escalation state after local issue and evidence submission, clearly labelled as outside Razorpay dispute creation
- [x] Test that customer escalation guidance does not create a Razorpay dispute, webhook, refund, or dispute-count change

- [x] Add low-touch dispute automation policy: automate matching, OCR, evidence-gap detection, classification, reminders, and packet preparation
- [x] Add concise exception gates for refunds, external contest submission, chargebacks, and other money or external actions
- [x] Add regression coverage proving safe automation proceeds while high-impact actions remain merchant-gated

- [x] Add guided low-touch refund branch to the story: refund recommendation, evidence readiness, merchant approval, and verified outcome state
- [x] Ensure real Razorpay refund execution remains explicitly merchant-confirmed and never occurs from a demo Next action
- [x] Add regression coverage for refund branch transitions and unapproved money-movement prevention

- [x] Run a complete non-mutating validation pass across Customer Space, Seller Space, payment intake, refund gates, dispute routing, API connectivity, signed webhooks, and production build
- [x] Verify live Razorpay acceptance boundaries without creating a payment or refund until explicitly authorized
- [x] Record any remaining publish, webhook, authentication, or hosted Checkout blockers honestly

- [x] Enhance Webhook Ledger UI with explicit incoming Razorpay event status, signature/delivery provenance, and pending merchant action
- [x] Add regression coverage for unproven webhook delivery and unattempted payment/refund/dispute states
- [x] Verify the ledger enhancement on desktop and mobile without creating live financial records

- [x] Audit every visible Workspace, Dispute Operations, Buyer Workspace, and Account navigation item for routes, live data, loading, empty, error, and action behavior
- [x] Replace any toast-only, dead-end, or generic placeholder navigation with a functional workspace or an explicit source-labelled unavailable state
- [x] Verify Home, Disputes, Transactions, Settlements, Reports, Evidence packets, Case timeline, Document vault, Webhook ledger, Evaluation lab, Customer Space, and Account settings
- [x] Add navigation workspace regression coverage and desktop/mobile browser validation

- [x] Keep the full DisputeShield sidebar fixed across Operations and Account workspace routes instead of rendering only a return button
- [x] Highlight the currently open workspace tool and preserve all merchant, dispute-operations, buyer, and account links
- [x] Verify the persistent sidebar and mobile navigation across desktop and mobile workspace views

- [x] Apply the fixed DisputeShield navigation shell to Payments and Customer Space so they do not become isolated pages
- [x] Preserve safe payment and buyer/customer access boundaries while keeping active links and mobile navigation available
- [x] Validate Payments and Customer Space navigation on desktop and mobile, then save a checkpoint

- [x] Assess and prioritize additional safe, explainable Risk Manager features for merchant loss prevention
- [x] Implement the user-selected additional feature with source-labelled behavior and regression coverage
- [x] Define a unified Proactive Risk Intelligence contract with source hierarchy, confidence, freshness, and strict no-money/no-external-action guarantees
- [x] Implement fulfilment risk sentinel, evidence freshness monitor, and merchant SLA recovery board
- [x] Implement merchant-confirmed dispute outcome learning without guaranteed-win claims or automated decision changes
- [x] Implement a source-labelled evidence integrity graph for payment, order, fulfilment, return, document, and webhook facts
- [x] Surface each capability in the appropriate command-centre, case, and Evaluation Lab workspace with clear empty/error states
- [x] Add regression coverage and desktop/mobile verification for the full proactive risk layer

- [x] Superseded by user request: leave local multilingual runtime settings as inactive placeholders rather than adding managed environment configuration
- [x] Superseded by user request: do not validate or activate unknown model environment defaults

- [x] Add a clearly marked non-functional environment template placeholder without guessed values or runtime activation
- [x] Add a visible registry of inactive placeholders for every unverified integration and runtime setting, with activation requirements and safe behavior
- [x] Validate that placeholders neither expose values nor claim unverified capability

- [x] Prepare and deliver an A-to-Z, feature-by-feature DisputeShield project guide with verified and unproven boundaries

- [x] Extend the A-to-Z guide with a complete, secret-safe environment configuration inventory and inactive placeholders for unknown values

- [x] Assess the attached hackathon critique against the current product and document the verified gaps
- [x] Implement a visibly AI-generated, fact-cited advisory risk narrative without decision authority
- [x] Run a real deterministic benchmark for sentinel/evidence logic and show only measured results
- [x] Create a concise hero-case narrative and judge-facing truth-chain presentation without overstating live proof

- [x] Define and implement an AI-assisted fact-cited risk narrative with deterministic fallback and no decision authority
- [x] Build a versioned held-out evaluation fixture corpus, measure deterministic metrics, and surface the real results
- [x] Build a Hero Case walkthrough with visible Truth Chain, risk signal, evidence gap, merchant action, and explicit counterfactual boundary
- [x] Add a compact verified-now versus awaiting-live-proof panel for judge-facing context
- [x] Validate the full judge-facing enhancement set on desktop and mobile and save a checkpoint
- [x] Add an explicit merchant-action beat to the Hero Case walkthrough and revalidate it on desktop and mobile

## Critique-driven refinement pass

- [x] Define a strict case fact-sheet contract and harden AI narrative safety validation, cache behavior, and deterministic fallback
- [x] Extend the measured benchmark with F1 reporting and a checked-in reproducible result artifact without presenting synthetic results as live outcomes
- [x] Add deterministic case-readiness scoring from reason-specific evidence requirements and surface it alongside advisory reasoning
- [x] Add a merchant-scoped money-at-risk exposure rollup that remains a factual operational total, not a loss prediction
- [x] Add an idempotent, non-production-only demo-data seeding path with explicit synthetic labels and no real financial action
- [x] Add a shared Hero Case timeline and visual bank-to-merchant dispute-chain explainer using source-labelled states
- [x] Improve zero-data and error states across command-centre lists with DisputeShield-specific provenance explanations
- [x] Add a compact real-versus-simulated capability card and test-coverage status derived from local validation inventory
- [x] Update judge-facing materials with a specific D2C returns target segment, pre-dispute positioning, roadmap, and user-gated live-demo prerequisites
- [x] Validate the critique-driven refinement pass with tests, build, and desktop/mobile checks
- [x] Add and test a bounded in-memory webhook rate limiter that preserves valid signed Razorpay retries and rejects abusive bursts before persistence

## Upgrade audit pass

- [x] Produce a prioritised upgrade matrix covering product safeguards, operational readiness, judge clarity, and user-gated live proof
- [x] Implement the highest-value safe upgrades identified by the audit with tests and source-labelled boundaries
- [x] Update judge-facing material with the upgrade rationale and clear activation prerequisites
- [x] Validate the upgrade pass with full regression, build, and responsive interface checks
- [x] Add a raw webhook request-size limit before signature verification and cover normal, oversized, and invalid requests with regression tests
- [x] Replace document-count readiness with reason-code-weighted required-evidence readiness and add regression coverage

## Comprehensive safe validation pass

- [x] Run the full automated suite, TypeScript check, and production build after the latest upgrade changes
- [x] Exercise the deterministic security and source-boundary regressions without calling financial or external mutation paths
- [x] Verify responsive Reports, Evaluation Lab, Payments, Seller Space, Customer Space, and Webhook Ledger entry states
- [x] Document the completed safe-validation findings and the remaining user-gated live proofs

## Exhaustive validation pass

- [x] Run the full deterministic suite and route-contract inventory after the comprehensive validation checkpoint
- [x] Verify every publicly reachable workspace route at desktop and mobile entry states without mutations
- [x] Validate all owner-restricted and merchant-gated procedures reject unapproved or unauthenticated access in regression coverage
- [x] Record the final safe validation matrix and exact user-gated external proof steps
- [x] Fix and regression-test Seller Space so background refreshes do not keep a verified workspace indefinitely synchronizing

## A-to-Z product definition

- [x] Produce a current, secret-safe A-to-Z product definition covering workflows, safeguards, metrics, validation, and user-gated activation

## Adversarial buildathon validation

- [x] Map the current architecture, roles, APIs, payment/webhook flows, data relationships, sensitive data, and trust boundaries
- [x] Run safe adversarial tests for authorization, object ownership, payment-state manipulation, webhook replay/order, input validation, concurrency, and failure recovery
- [x] Review dependency, secret, frontend exposure, infrastructure, accessibility, and judge-facing UX risks
- [x] Remediate any verified high-impact findings with regression coverage and source-labelled user-facing behavior
- [x] Publish a comprehensive adversarial validation report with verified results, limitations, and user-gated live proof requirements
- [x] Reproduce and remediate concurrent Seller Space and Customer Space checkout inventory oversubscription without changing payment or refund behavior
- [x] Reproduce and remediate concurrent first-redemption binding races for buyer order and catalog access tokens
- [x] Restrict local platform configuration permissions and document its non-tracked secret boundary
- [x] Upgrade aligned direct tRPC packages to the audited fixed release and rerun complete application validation
- [x] Suppress internal stack traces from tRPC client error responses and add a direct HTTP regression probe
- [x] Add and verify baseline response hardening headers without breaking Razorpay Checkout or development routing
- [x] Replace generic Express parser error pages with source-safe API error responses and direct oversized-request regression coverage
- [x] Upgrade direct AWS S3 SDK packages to remediate the critical transitive XML-parser advisory and rerun storage validation
- [x] Update the judge-facing local validation snapshot to the final adversarial test inventory

## Judge-handout refinement

- [x] Replace hedged AI narrative wording with an accurate generate-or-safe-fallback statement
- [x] Include the current measured synthetic-corpus metric values and denominator in the judge handout without presenting them as live outcomes
- [x] Strengthen the visual separation between synthetic/local Hero Case content and a live external dispute
- [x] Create one canonical judge handout with a sequenced click-order demo checklist and a separately marked live-proof rehearsal section
- [x] Validate the refined Reports presentation and handout accuracy, then save a checkpoint
- [x] Classify transient Gemini high-demand responses as provider availability in the live smoke test while retaining strict non-transient failure checks

## Risk-operations expansion

- [x] Add a standards-referenced internal-to-network reason-code evidence mapping with explicit supported and awaiting-validation states
- [x] Add merchant case search and deterministic filters for reference, buyer, reason, readiness, and date range
- [x] Add actionable SLA ownership and escalation states without automatic reassignment or external communication
- [x] Add a privacy-preserving, merchant-scoped buyer-pattern review signal that is triage-only and cannot deny, label, or penalize a buyer
- [x] Add source-labelled trend analytics and factual usage metering without predictions, billing, or financial actions
- [x] Add illustrative signed-dispute preview, Hero Case counterfactual toggle, reusable truth badges, and a pre-demo readiness check
- [x] Add a visible advisory-responsibility and payment-data boundary, plus a judge leave-behind QR activation path
- [x] Document the controlled roadmap for notifications, team roles, staging/production separation, retention, malware scanning, partner API, prompt versioning, billing, and Razorpay export validation
- [x] Run full regression, build, and responsive verification for the risk-operations expansion

## Risk-operations scalability hardening

- [ ] Add bounded server-side pagination and total-result metadata to merchant case discovery without weakening merchant scoping
- [ ] Add case-console pagination controls, tests, validation, and a checkpoint

## Master Build Prompt reconciliation

- [x] Audit the Master Build Prompt against current contracts and record each requirement as implemented, safely amended, or production-roadmap only
- [x] Reconfirm strict fact-sheet, AI fallback, benchmark, readiness, truth-badge, seed, and counterfactual behavior against the new non-negotiable constraints
- [x] Add a persistent rolling risk-report view based only on merchant-stored records and without financial-protection or ROI claims
- [x] Extend buyer-facing rate limiting to catalog redemption, local issue submission, and document upload with clear safe failure behavior
- [x] Implement a merchant-gated Razorpay-compatible evidence export preview or document exact provider-validation prerequisites
- [x] Strengthen text/input safety and document the malware-scanning activation boundary without pretending a scanner is active
- [x] Consolidate the canonical judge front door, click-order runbook, readiness boundaries, and production-only roadmap status
- [x] Validate the Master Build Prompt hardening with tests, production build, responsive checks, and checkpoint

## Checked `imp` documentation package

- [x] Review the existing documentation and validation records against the uploaded correctness, UX, security, reliability, environment, and operations checklist
- [x] Create a secret-safe `imp` folder with checked implementation, validation, demo, safety, and production-readiness Markdown materials
- [x] Validate the `imp` Markdown package, re-run the appropriate project checks, and save a checkpoint

## Complete workflow and feature guide

- [x] Create a complete, source-bound explanation of every DisputeShield workflow, workspace, feature, safety boundary, and merchant/buyer/provider action
- [x] Check the guide against the canonical documentation, link it from the `imp` package, and deliver it

## Local sentiment-analysis verification

- [x] Verify the installed local multilingual sentiment-analysis path with controlled non-customer inputs and document whether model-backed inference or deterministic fallback is active
- [x] Confirm the sentiment result remains a non-decisive triage hint and cannot label, penalize, deny, refund, contest, or submit a case

## Synthetic multilingual sentiment dataset

- [x] Define a privacy-safe, non-decisive label taxonomy and dataset governance for future customer-statement sentiment fine-tuning
- [x] Create balanced, clearly synthetic multilingual train, validation, and held-out test splits with issue-context metadata
- [x] Verify dataset balance, split disjointness, absence of personal data/prohibited labels, and a reproducible manifest
- [x] Document fine-tuning, evaluation, and advisory-only deployment gates for the future local model

## Local Ollama sentiment integration

- [x] Verify whether the user-selected `pilardi/sentiment-analysis:gemma3` model and Ollama runtime are available locally, and document the distinct development versus hosted-runtime boundary
- [x] Replace the inactive sentiment-model plan with a bounded advisory-only Ollama adapter, schema validation, timeout, deterministic fallback, and no-adverse-action guardrail
- [x] Surface model/fallback provenance in Customer Space and merchant case review without using sentiment for fraud, manipulation, eligibility, payment, refund, or provider decisions
- [x] Add regression coverage and controlled synthetic-input validation for the Ollama sentiment adapter; checkpoint the verified activation state

## Product-improvement roadmap

- [x] Assess current DisputeShield capabilities, evidence, gaps, and user-gated proofs to identify the next highest-impact improvements
- [x] Produce a ranked, source-bound roadmap that distinguishes safe build-now work from user-gated or production-only activation work

## Safe roadmap implementation

- [x] Create a merchant-gated, redacted, source-labelled local case audit export with an immutable export record and no provider submission
- [x] Add narrow internal merchant team roles for viewer, reviewer, approver, and owner with server-enforced case access and approval segregation
- [x] Upgrade merchant case discovery to bounded server-side pagination with tenant-scoped total metadata and no cross-tenant search
- [x] Add bounded operational observability for source events, analysis fallback, evidence rejection, and SLA state without external alert claims
- [x] Add clearly inactive carrier, notification, retention/deletion, malware-scan/quarantine, distributed-rate-limit, and Ollama deployment activation contracts
- [x] Update the canonical workflow and production-readiness documents with implemented and activation-gated roadmap status
- [x] Run required non-destructive migrations, regressions, type check, production build, responsive validation, and checkpoint the safe roadmap implementation

## A-to-Z feature inventory

- [x] Create a complete A-to-Z inventory of all DisputeShield features, workflows, truth levels, safety limits, and user-controlled activation requirements
- [x] Check the inventory against the canonical implementation documentation, link it from the `imp` package, and deliver it

## Documentation navigation guide

- [x] Create a clear documentation navigation guide for all DisputeShield product, workflow, feature, validation, security, model, and production-readiness materials
- [x] Check documentation links and coverage, update the `imp` package index, and deliver the navigation guide

## In-chat feature and workflow explanation

- [x] Present the complete DisputeShield feature inventory and end-to-end workflow directly in chat with explicit truth and human-action boundaries

## Evidence-integrity anchoring

- [x] Define a safe blockchain-style evidence-integrity use case, threat model, and strict non-financial non-goals
- [x] Implement and test a local cryptographic audit-anchor chain for merchant-approved redacted case exports without blockchain-network activity
- [x] Surface protected anchor verification and document optional external blockchain anchoring as an inactive production integration

## Complete private evidence-integrity layer

- [x] Add persistent merchant-scoped integrity anchors, a deterministic hash-chain contract, document checksum references, and daily Merkle-root summaries
- [ ] Link approved redacted audit exports, review-only evidence packets, case timelines, and safe verified webhook metadata into the local integrity chain
- [x] Add protected integrity verification, Document Vault references, Risk Operations verification controls, and compliance-report reflection surfaces
- [x] Add regression coverage, private-chain documentation, optional external-anchor activation boundaries, full validation, and checkpoint

## Adversarial private-integrity logic review

- [x] Map and test private-integrity invariants across export, document, verified-webhook, timeline, vault, verification, and Merkle-root flows
- [x] Probe and remediate verified replay, concurrency, authorization, privacy, provenance, and misleading-state flaws with regression coverage
- [x] Run full validation, document verified findings and remaining boundaries, and checkpoint the integrity hardening work
