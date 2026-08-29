# Master Build Prompt Reconciliation

## Scope Decision

This document reconciles the user-provided Master Build Prompt with the current DisputeShield codebase. Its non-negotiable truth and safety boundaries govern every implementation decision in this pass. Conflicting requests are resolved in favor of the stricter existing product boundary: no feature may move money, submit a response, create an external event, penalize a buyer, or turn a demonstration into a source-of-truth record.

## Initial Contract Audit

| Master Build Prompt requirement | Current verified state | Reconciliation decision |
| --- | --- | --- |
| Structured AI fact sheet with low-creativity summary, allowed facts, validation, hash-aware cache, and fallback | `buildCaseFactSheet`, hash-based scoped cache, structured Gemini output, two-attempt validation, and deterministic fallback are implemented. The current output guard already rejects fraud-adjacent and money language and restricts citations to declared sources. | **Implemented; retain and test.** The brief's “temperature” parameter is not exposed by the managed model helper, so the existing structured schema, short token limit, locked instruction, and validation provide the corresponding bounded-generation control. |
| Held-out benchmark with sample size and real metrics | A versioned 24-scenario synthetic corpus computes precision, recall, F1, and confusion matrices. Metrics are labelled as deterministic rule agreement, not outcomes. | **Implemented; retain.** |
| Weighted readiness on every case and in fact sheet | Reason-specific weighted readiness is implemented and sent to the fact sheet. | **Implemented; retain.** |
| Owner-only idempotent local seed data | Local labelled demo seeding exists and is disabled in production. | **Safely amended.** A synthetic signed-webhook replay cannot be seeded as a real external event; it remains restricted to deterministic regression fixtures or a separately invoked signed-webhook test route. |
| Truth badges, counterfactual, illustrative dispute preview, source labels, runbook, and readiness | These are now implemented on Reports/Risk Operations, with an illustrative record structurally excluded from queries and metrics. | **Implemented; retain.** |
| PCI statement claiming SAQ-A eligibility | The app states that it does not collect/store/process card number, CVV, OTP, or UPI PIN and Razorpay Checkout hosts credential entry. | **Safely amended.** Do not claim SAQ-A eligibility or certification without qualified assessment. |
| “Orders protected”/ROI statement | The product reports factual order exposure, record counts, and synthetic benchmark results. | **Safely amended.** No unproven “protected” or savings amount will be displayed. |
| Buyer-facing endpoint rate limits | Authenticated buyer-scoped fixed-window limits now protect catalog redemption, local case creation, and document upload. | **Implemented with an explicit process-local boundary.** A distributed limiter remains a production-release requirement for autoscaling. |
| Native Razorpay evidence export | A merchant-review-only evidence-object preview now maps source availability into published Razorpay field names and explicitly leaves the actual reason code unset. | **Implemented preview; provider submission/export compatibility remains an activation prerequisite.** |
| Prompt version control | Risk Narrative outputs now return a visible prompt-version identifier beside the fact-sheet hash. | **Implemented baseline.** Production promotion workflow, persisted evaluation history, and rollback governance remain roadmap items. |
| Plain-text workflow input safety | Customer statements and merchant SLA owner/note fields are normalized server-side before persistence; React text rendering does not inject HTML. Existing protected document upload validates declared type, byte size, and binary signature. | **Implemented for the current buyer-statement and SLA input surfaces.** Malware scanning/quarantine requires a production scanning service and remains roadmap-only. |

## Dependency-Audit Finding

The current production dependency audit reports **0 critical**, **17 high**, **47 moderate**, and **8 low** advisories. The prior direct tRPC and AWS S3 SDK remediations removed critical findings. This pass intentionally does not perform blanket dependency upgrades: remaining advisory paths require source tracing, compatibility testing, and a separate controlled upgrade plan. The audit result is an engineering control observation, not a claim that all runtime risk is eliminated.
| Malware scanning, external notifications, RBAC, production separation, partner API | These require contracts, infrastructure, policy, and verification. | **Roadmap-only.** No inactive integration will be represented as active. |

## Source and Terminology Rules

All new language uses the established truth vocabulary: **merchant record**, **local customer case**, **API-observed**, **webhook-verified**, **evidence readiness**, **SLA priority**, and **reason code**. New UI must place provenance adjacent to each fact and must preserve the documented hierarchy: local record < signature-verified < API-observed < webhook-verified.

The next audit steps will inspect seed controls, badge coverage, buyer-facing router procedures, evidence export, input handling, and front-door documentation before changing code.

## Proactive Risk and Rolling Report Finding

The existing Proactive Risk Intelligence contract derives evidence freshness and SLA priority strictly from stored local cases. The rolling report added in this pass therefore aggregates the same stored set: total cases, active cases, locally resolved cases, elevated SLA cases, and active cases needing evidence review. It has an explicit reporting period derived from record timestamps and a negative boundary that rules out avoided-loss, order-protection, provider-outcome, and customer-intent claims. This satisfies the useful recurring operational view without inventing a monetary ROI figure.

## Tier 1 Completion Audit

The Merchant Home `merchantRiskExposure` contract already aggregates stored order amounts linked to active local cases by currency and explicitly excludes predicted loss, reserve, refund, and external-dispute-total claims. It therefore satisfies the requested money-at-risk rollup as a factual operational exposure figure; the new rolling report deliberately does not repeat this figure as a protection or ROI claim.

The owner-only demo seed remains idempotent, tagged with `demoSeedBatchId`, and disabled in production. It seeds only structurally local merchant/customer records. The Master Build Prompt's request to insert a “synthetic signed-webhook replay” is not implemented as seed data because it would contradict the prompt's own prohibition on simulating a real external event. Deterministic signed-webhook fixtures remain confined to regression testing, while a real external event requires Razorpay API observation or an HMAC-verified delivery.

## Tier 1 Surface Audit

The shared `SourceTruthBadge` is used in the Hero Case, Truth Chain, illustrative preview, readiness checks, external dispute queue, Risk Operations rows, rolling report, and evidence-export preview. The Risk Narrative labels generated output as **AI-generated** and presents the versioned prompt identifier plus fact-sheet hash. Existing Customer Space, Seller Space, Payments, and Home pages retain their narrower source wording. Extending identical visual badges to every legacy display is a presentation-wide refactor rather than a prerequisite to correctness, and must not replace already explicit textual source labels while those routes are stabilized.

## Canonical Judge Front Door

[`disputeshield-judge-handout.md`](./disputeshield-judge-handout.md) is the single canonical judge front door. It contains the timed click order, truth hierarchy, benchmark claim, evidence-mapping boundary, privacy/advisory statement, and user-gated live rehearsal. The A-to-Z definition is an implementation appendix; the flow-and-actions document is a supporting operating appendix. This avoids competing source-of-truth material while preserving detail for technical review.

## Responsive, Non-Mutating Visual Check

Reports, Disputes, Customer Space, and Merchant Home were captured at desktop and mobile entry states without authentication or mutation. The canonical Reports surface preserved its synthetic/local/not-submitted boundary, counterfactual, readiness, illustrative preview, advisory/privacy statement, and capability table. The protected Disputes route correctly withheld merchant records before sign-in. Customer Space retained the bound-order, no-payment-on-browse, and no-external-dispute boundaries at both breakpoints. Authenticated-only results, live checkout, document upload, refund, webhook delivery, and provider submission were intentionally not attempted.

## Validation Result

The latest safe-roadmap implementation pass completed with **47 Vitest files / 128 tests**, TypeScript, and a production build passing. Newly covered contracts include internal merchant-role ordering, redacted local audit-export hashing, bounded case-result pagination, authenticated-buyer request throttling, plain-text normalization, factual rolling reporting, a non-submitting Razorpay evidence preview, and Risk Narrative prompt-version tracing. The production build retains a bundle-size warning; it does not prevent the build and should be addressed through deliberate code splitting rather than by weakening features or safety checks.
