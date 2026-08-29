# Comprehensive Safe Validation Record

## Scope

This validation pass exercised build integrity, deterministic product contracts, source-boundary protections, read-only provider checks, and responsive workspace entry states. It deliberately did **not** create a payment, complete hosted Checkout, issue a refund, create or submit an external dispute, change a provider webhook destination, or claim an issuer outcome.

## Automated Results

| Check | Result | Evidence |
| --- | --- | --- |
| Unit and integration regression suite | Passed | **38 test files, 103 tests**. |
| TypeScript contract check | Passed | `pnpm exec tsc --noEmit`. |
| Production bundle | Passed | Vite client build and server bundle completed. |
| Razorpay credentials | Passed, read-only | The provider credential smoke test authenticated against the read-only payment-listing path. |
| Gemini credentials | Passed, bounded | The server-side minimal model smoke test completed; the test treats a provider timeout/unavailability separately from a credential failure. |

The production build reports a client bundle-size warning after minification. This is a performance improvement opportunity, not a build failure. The next engineering optimisation should introduce route-level code splitting only after verifying that it does not disturb the merchant workspace routes.

## Safety and Source-Boundary Coverage

| Boundary | Validated behavior |
| --- | --- |
| Webhook raw body | Payloads greater than 1 MB are rejected with HTTP 413 before parsing, signature verification, or persistence. |
| Webhook burst protection | The in-memory guard accepts expected requests, rejects an abusive source-IP burst, and resets after the configured minute window. |
| Webhook authenticity | Invalid signatures are rejected before parsing/persistence; valid signed events preserve idempotency and scoped ledger metadata. |
| Payment evidence | Checkout browser completion cannot create captured metrics or evidence before a signed capture event. |
| AI advisory | The fact-sheet contract, source citation checks, prohibited language checks, deterministic fallback, and reason-code-weighted readiness all have regression coverage. |
| Benchmark | The Evaluation Lab’s fixed synthetic corpus remains separate from merchant data and is not presented as a bank-outcome predictor. |

## Responsive Entry-State Review

The following routes were captured at desktop and mobile breakpoints without invoking an action: **Reports**, **Evaluation Lab**, **Payments**, **Seller Space**, **Customer Space**, and **Webhook Ledger**. Reports and Evaluation Lab rendered their judge-facing and measured benchmark content. Payments rendered its merchant-controlled hosted-Checkout boundary without opening Checkout. Customer Space rendered private token entry without creating a catalogue order or payment. Webhook Ledger rendered its merchant-authentication boundary without exposing event records.

Seller Space rendered a stable locked state in a non-authenticated browser session. A separate preview capture retained an authenticated shell while catalog/order queries were still synchronizing; its workspace-context query did resolve with protected counts. This is treated as an **authenticated-session visual follow-up**, not proof of a broken data contract. The outstanding check requires merchant sign-in and a settled authenticated view on both desktop and mobile.

## Remaining User-Gated Proof

| Proof | Why it remains gated |
| --- | --- |
| Authenticated Seller Space, Customer Space, and reauthentication validation | Requires the merchant’s signed-in session. |
| Synthetic local case walkthrough through the interface | Writes protected local records and needs the owner session. |
| Hosted Razorpay Test Mode Checkout | Requires an explicit merchant action; card/CVV/OTP must remain user controlled. |
| Published webhook destination and delivered event | Requires the user to publish and configure a distinct Razorpay endpoint without changing IntentLock. |
| Refund, external dispute, and issuer outcome | These are financial/external actions or facts that only a source record can establish. |

> **Validation conclusion:** The safe product surface, deterministic controls, build, responsive entry states, and integration-readiness boundaries are validated. The remaining checks are intentionally not automated because they require a real merchant session, explicit payment consent, or external provider delivery.
