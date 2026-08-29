# DisputeShield Adversarial Validation Report

**Scope date:** 26 August 2026  
**Assessment mode:** Source review, deterministic regression, local HTTP boundary probes, dependency audit, production build inspection, and desktop/mobile route review.  
**Out of scope by design:** Completing a hosted Checkout, entering card/CVV/OTP details, refund execution, issuer contact, external-dispute submission, provider webhook configuration, and publishing. No financial or external mutation was performed.

## Executive Assessment

DisputeShield is a **defence-only merchant evidence and local-resolution system** with a strong separation between local records and externally verified Razorpay/bank facts. The assessment confirmed that the core payment, dispute, evidence, webhook, AI-advisory, and merchant-decision boundaries are intentionally constrained. The review also found and remediated two concurrency defects and two development-preview information-disclosure paths before final validation.

> **Result:** The final deterministic suite passed with **40 test files and 108 tests**. TypeScript validation and the production build passed. Read-only Razorpay and Gemini credential smoke tests passed. The production dependency audit contains **no critical advisory** after upgrading tRPC and the direct AWS S3 SDK dependencies. Residual dependency advisories remain and are recorded below; they require a controlled follow-up upgrade plan rather than blind package changes.

## Architecture and Trust Boundary Map

| Area | Implemented boundary | Assessment result |
| --- | --- | --- |
| Identity and tenant scope | Protected procedures derive merchant/buyer identity from the signed session; business objects are queried with merchant or buyer scope. | Verified by code review, ownership-oriented tests, and unauthenticated HTTP probes. |
| Merchant payment intake | Server creates Razorpay orders; browser completion can only be `client_confirmed`; a signed event is required for capture truth. | Verified by payment lifecycle regressions and public UI boundary text. |
| Customer Space | Customer catalog/order tokens are high-entropy, expiry-bound, and bind to the first signed-in buyer. Customer cases remain local. | First-redemption race was remediated; no local action can create an external dispute or move money. |
| Webhook boundary | Raw body is bounded at 1 MB, HMAC is verified before parsing/persistence, event writes are idempotent, and source-IP bursts are bounded in-process. | Verified by deterministic webhook tests and local unsigned/oversized probes. |
| AI advisory | A Case Fact Sheet limits inputs; citations are allowed-list checked; prohibited authority language is rejected; a deterministic fallback exists. | Verified by risk narrative and readiness tests. |
| Evidence files | Customer uploads are protected procedures with type, magic-byte, size, buyer, merchant, and case checks. Storage keys include random capability entropy. | No cross-scope key exposure was found in reviewed customer/merchant UI paths. |
| External state | Razorpay, bank, carrier, refund, dispute, and issuer facts are shown only when their named source exists. | Verified by Truth Chain and lifecycle regressions. |

## Safe Adversarial Probes

| Probe | Expected result | Observed result |
| --- | --- | --- |
| Unauthenticated merchant exposure query | No merchant data; authentication failure only. | HTTP `401`, safe `UNAUTHORIZED` response. |
| Unauthenticated checkout mutation | No order creation or provider call. | HTTP `401` before mutation. |
| Public evaluation benchmark | Only synthetic, versioned benchmark data is available. | HTTP `200`; fixture status explicitly says it is not live or a bank-outcome predictor. |
| Retired direct evidence endpoint | Legacy upload path cannot bypass protected procedure scope. | HTTP `410` with a migration message; no upload occurred. |
| Unsigned webhook | Reject before parse/persistence. | HTTP `401` with `invalid_signature`. |
| Webhook raw payload over 1 MB | Reject before parsing/signature/persistence. | HTTP `413` with `payload_too_large`. |
| Oversized generic API JSON | Reject without stack or local filesystem disclosure. | HTTP `413` with `request_too_large`. |
| Malformed generic API JSON | Reject without stack or local filesystem disclosure. | HTTP `400` with `invalid_request_body`. |
| Error response inspection | No serialized tRPC stack paths. | Stack field removed from unauthenticated tRPC response. |
| Browser bundle scan | No server-secret names or credential-like values in client bundle. | No matching server-secret or credential-like values found. |

## Verified Findings and Remediation

| ID | Severity before fix | Finding | Remediation | Regression evidence |
| --- | --- | --- | --- | --- |
| AV-01 | High | Two buyers could race to bind the same unbound Customer Space order or catalog token because first redemption previously read then updated without a conditional claim. | Added `bindFirstCustomerAccess`; both order and catalog flows now use atomic `UPDATE … WHERE bound_buyer_open_id IS NULL`, then reload and reject a competing buyer. | `customerAccessBinding.test.ts` proves only one competing buyer can claim an unbound link. |
| AV-02 | High | Checkout creation checked stock before the provider call but did not reserve it atomically, enabling concurrent oversubscription of merchant-recorded inventory. | Seller and customer checkout flows now conditionally decrement inventory before order creation and restore it if provider/order persistence setup fails. | `sellerSpace.test.ts` verifies all-or-nothing reservation semantics; TypeScript and full suite pass. |
| AV-03 | Medium | In preview development mode, serialized tRPC authentication errors exposed internal stack data. | Added a tRPC error formatter that removes the stack property entirely. | Direct unauthenticated HTTP probe verified no stack field remains. |
| AV-04 | Medium | Generic Express JSON parser errors returned development HTML with internal error and path details. | Added source-safe API parser error mapping for malformed and oversized API bodies. | Direct `400` and `413` probes return fixed JSON without internal details; `httpSecurity.test.ts` covers mappings. |
| AV-05 | Medium | Responses lacked conservative browser hardening headers, and generic body parsing permitted 50 MB payloads despite the documented protected document envelope. | Disabled `X-Powered-By`, applied `nosniff`, frame, referrer, and permissions headers, and reduced generic JSON/urlencoded body limit to 8 MB. | Direct header and 8 MB-plus probe passed; `httpSecurity.test.ts` covers helper contract. |
| AV-06 | Low | Local untracked platform configuration contains managed secret definitions and had owner-readable-by-group/world file permissions. | Restricted local file permission from `644` to `600`; confirmed it is ignored and not version-controlled. | Local filesystem and Git tracking check completed. |
| AV-07 | Critical supply chain | Audit reported a critical `fast-xml-parser` advisory through the direct AWS S3 SDK dependency path. | Upgraded `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1118.0`; upgraded aligned tRPC packages to `11.18.0`. | Post-upgrade production audit reports **0 critical** advisories and no `fast-xml-parser` action. |

## Validation Inventory

| Validation class | Result |
| --- | --- |
| Full deterministic suite | 40 files / 108 tests passed. |
| TypeScript | `tsc --noEmit` passed. |
| Production build | Client and server bundle passed. |
| Server credential smoke tests | Bounded Gemini request and read-only Razorpay payment-listing authentication passed. |
| Desktop/mobile UI review | Home, Reports, Evaluation Lab, Payments, Seller Space, Customer Space, and Webhook Ledger entry states captured without mutation. |
| UI observation | Reports offers strong proof language but is dense; Seller and Customer Space have the clearest forensic-fintech visual system. This is an experience refinement, not a correctness failure. |

## Residual Risks and Recommended Follow-Up

The production dependency audit has no critical findings after remediation, but still reports **17 high, 47 moderate, and 8 low** advisory records. These are not all automatically exploitable in DisputeShield. Current remaining paths include direct or transitive dependencies around Drizzle ORM, Axios/OAuth, Express parser routing, Streamdown/Mermaid markdown rendering, and Recharts/Lodash. The review did not find an active product path that uses untrusted dynamically compiled routes, Lodash templates, or raw user HTML. However, they remain a maintenance obligation.

| Priority | Follow-up | Required discipline |
| --- | --- | --- |
| P1 | Prepare controlled updates for Drizzle ORM, Axios, Express/`qs`, Streamdown/Mermaid, and Recharts. | Upgrade one dependency family at a time; run tenant, storage, OAuth, document, and responsive regressions after each. |
| P1 | Code-split the 1.12 MB generated JavaScript entry bundle. | Preserve route/auth boundaries and verify checkout script loading after each split. |
| P1 | Add a shared cross-instance webhook rate-limit store if the application is scaled beyond one process. | Current guard is intentionally in-memory and per-instance; select infrastructure before implementation. |
| P2 | Add carrier tracking only with a selected provider, credential contract, signed event schema, and merchant approval. | Keep carrier events source-labelled; do not infer delivery. |
| P2 | Consider shorter session duration and a reauthentication policy for high-risk merchant actions. | Preserve the OAuth preview behavior before changing `SameSite=None` or session lifetime. |

## Non-Claims and User-Gated Proof

This report does not claim that a live Razorpay dispute, bank chargeback, refund, carrier delivery, issuer decision, or payment capture was created or prevented. The remaining live proof requires: merchant sign-in; optional owner-only synthetic data seeding; an explicitly approved user-controlled Test Mode Checkout; a separately published and configured Razorpay webhook destination; and a source-delivered signed provider event. Card number, CVV, OTP, refund execution, external-dispute submission, and issuer outcomes remain outside automated operation.

## Conclusion

The reviewed build now has stronger tenant-link claiming, inventory reservation, response confidentiality, HTTP hardening, and supply-chain posture than the pre-assessment build. Its core product claim remains accurate: **DisputeShield prepares and explains evidence for a merchant while keeping money movement and external dispute truth bounded by verified source events and merchant intent.**
