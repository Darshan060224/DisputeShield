# DisputeShield Upgrade Audit

## Decision Standard

The best remaining upgrades are those that improve **evidence integrity, operational safety, or judge comprehension** without turning a local case into an external dispute, an AI suggestion into a decision, or a test-mode integration into an unproven production claim. This audit treats payment, refund, publication, bank communication, and live webhook delivery as separate user-gated proof steps.

## Upgrade Matrix

| Priority | Upgrade | Value | Current status | Next action |
| --- | --- | --- | --- | --- |
| P0 | Cap raw webhook request size before it enters verification | Prevents memory pressure from oversized inbound payloads while preserving HMAC verification and idempotency | Not yet bounded at raw-body collection | Add a strict body-size guard with regression tests. |
| P0 | Bound and source-label AI narrative generation | Prevents unsupported claims while making advisory reasoning inspectable | Implemented: Case Fact Sheet, citations, hash, cache, fallback, output guard | Maintain with regression coverage. |
| P1 | Per-case evidence readiness and reason-code requirements | Lets a merchant see exactly what is missing before choosing a local resolution or packet action | Implemented in the advisory and deterministic policy paths | Surface in protected case review; verify after merchant sign-in. |
| P1 | Operational exposure rollup | Gives the merchant a factual workload total without predicting loss | Implemented as active-local-case linked stored order total | Verify with authenticated synthetic local demo data. |
| P1 | Demo reproducibility | Gives judges a safe, non-financial walkthrough path | Implemented as owner-only, non-production synthetic seed control | Seed only after merchant authentication; no external record will be created. |
| P1 | Evidence integrity and external-boundary visuals | Makes the product story memorable without fabricating a result | Implemented: Hero Case, Truth Chain, seven-step flow, real-versus-simulated table | Keep Reports as the first demo surface. |
| P2 | Carrier tracking integration | Would improve delivery-proof provenance | Placeholder by design | Needs selected provider, contract/authentication, event schema, and merchant approval. |
| P2 | Distributed webhook quota | Would provide global abuse protection across autoscaled instances | Current in-memory per-process burst guard is implemented | Needs a managed shared store and explicit activation decision. |
| P2 | Live checkout, webhook, refund, dispute proof | Provides real integration proof | Not attempted in this pass | Requires user sign-in, fresh consent for hosted Checkout, publication, webhook endpoint configuration, and provider delivery. |

## Recommended Build Sequence

1. **Safe hardening now:** enforce a raw webhook request-size limit before parsing, with explicit 413 behaviour and no persistence.
2. **Authenticated proof next:** sign in as merchant; seed the labelled local walkthrough; inspect Seller Space, Customer Space, Reports, and the protected advisory view on desktop and mobile. This does not require a payment.
3. **Optional live proof later:** after publishing and configuring a separate Razorpay webhook destination, run one user-controlled Test Mode Checkout and inspect the signed ledger. Never automate card, CVV, OTP, refund, or issuer communication.
4. **External integrations last:** choose a carrier only after its tracking event semantics and authentication are known; use a shared rate-limit store only after an infrastructure decision.

## Upgrade Acceptance Rules

| Category | Acceptance rule |
| --- | --- |
| Evidence integrity | A new source state must name its source and must not imply a stronger fact than it records. |
| AI assistance | The model receives only structured case facts and cannot perform a financial, merchant, or external decision. |
| Demo data | Every record is labelled synthetic/local and cannot appear as a live Razorpay or bank event. |
| Webhook security | Rejected, oversized, invalid-signature, duplicate, and valid events each have a tested, distinct outcome. |
| Metrics | A metric must state its fixture/data population and must not imply bank outcomes, fraud detection, or money saved unless independently proven. |

## User-Gated Proof Register

The following are intentionally not automated: merchant authentication, production publishing, Razorpay dashboard webhook changes, hosted Checkout completion, card/CVV/OTP entry, refund execution, external-dispute submission, and issuer outcome confirmation. Each requires a fresh user action or a recorded external source event.
