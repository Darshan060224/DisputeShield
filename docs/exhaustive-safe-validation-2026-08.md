# Exhaustive Safe Validation Matrix

## Validation Rule

This matrix covers every application route and deterministic protection that can be evaluated without completing a payment, entering payment credentials, creating a refund, changing provider configuration, or claiming an external outcome. **A green safe check is not a claim of live bank, carrier, Razorpay webhook, refund, or issuer proof.**

## Build and Contract Results

| Layer | Coverage | Result |
| --- | --- | --- |
| Deterministic regressions | Policies, lifecycle gates, navigation, tenant boundaries, evidence readiness, webhook ledger, signed webhook projection, benchmark, narrative fallback, cache isolation, synthetic workflow, and card-retry policy | **38 test files / 103 tests passed** |
| Static types | Client, server, router, and shared contracts | Passed |
| Production build | Vite client and bundled Node server | Passed |
| Read-only provider credential checks | Razorpay payment-listing authentication and bounded Gemini server request | Passed |
| Financial/external mutations | Payment, refund, external dispute submission, webhook destination change, and issuer outcome | Not attempted by design |

## Source and Security Boundaries

| Control | Safe validation result |
| --- | --- |
| Raw webhook payload limit | A payload over 1 MB returns 413 before parse, signature verification, or persistence. |
| Webhook signature | An invalid HMAC signature is rejected before parsing/persistence. |
| Webhook idempotency | An already-recorded event is returned as a duplicate without a second write. |
| Webhook burst guard | Per-source-IP in-memory guard accepts normal traffic, rejects a burst, and resets after its configured window. |
| Checkout evidence | A browser callback/signature can never create captured metrics or evidence before a signed capture event. |
| Local customer issue | Customer Space cannot create a Razorpay dispute, bank chargeback, refund confirmation, or payment capture. |
| AI narrative | Uses strict structured facts, permitted citations, language guardrails, bounded cache, and deterministic fallback. |
| Evaluation metrics | Fixed synthetic held-out corpus is visibly labelled and remains separate from merchant/bank data. |

## Route Matrix

Every listed route was captured at **desktop and mobile** entry states without clicking a payment, refund, packet-release, or external-action control.

| Route | Safe entry-state result | Boundary observed |
| --- | --- | --- |
| `/` | Merchant home rendered with source-labelled operational summary | No external state inferred from browser actions. |
| `/operations/disputes` | Protected dispute workspace rendered an authentication boundary when session was absent | Merchant evidence was not exposed. |
| `/payments` | Merchant payment-intake screen rendered amount, intent, and hosted-Checkout boundary | Checkout was not opened. |
| `/operations/settlements` | Protected settlement entry state rendered | No refund action was invoked. |
| `/operations/reports` | Hero Case, Truth Chain, capability status, and real-versus-simulated boundaries rendered | Synthetic narrative did not claim a prevented dispute. |
| `/operations/evidence-packets` | Protected entry state rendered | No packet was released or submitted. |
| `/operations/case-timeline` | Protected entry state rendered | No merchant events were exposed without authentication. |
| `/operations/document-vault` | Protected entry state rendered | No documents were read or uploaded. |
| `/operations/webhook-ledger` | Protected entry state rendered | No delivery was claimed. |
| `/operations/evaluation-lab` | Versioned synthetic benchmark snapshot rendered on both breakpoints | Metrics were not presented as bank outcomes. |
| `/customer-space` | Token-gated buyer/local-case entry state rendered | No order, payment, case, or document was created. |
| `/settings` | Read-only connection and inactive-placeholder registry rendered | Secrets were not displayed. |
| `/seller-space` | Locked merchant entry state renders in an unauthenticated browser session | A preview capture can show the short synchronizing panel immediately after workspace context resolves; a persistent authenticated-session check remains required before classifying this as settled. |

## User-Gated Completion Steps

1. **Merchant sign-in:** required for settled Seller Space, Customer Space, case-review, and reauthentication checks.
2. **Local synthetic walkthrough:** may be seeded only through the owner-restricted non-production control after merchant sign-in; it creates labelled local records only.
3. **Hosted Checkout:** requires fresh confirmation and the user’s own interaction with any card, CVV, OTP, or bank/UPI step.
4. **Publish and webhook delivery:** requires the user to publish, configure a separate Razorpay webhook destination, and receive a source-recorded signed delivery without changing IntentLock.
5. **Refund/external dispute/outcome:** requires an explicit merchant decision and verified provider/issuer record; none is automated.
