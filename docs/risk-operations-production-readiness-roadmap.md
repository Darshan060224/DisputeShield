# DisputeShield Risk Operations: Production-Readiness Roadmap

## Purpose and Scope

This roadmap separates what is implemented in the current **defence-only** product from what must be activated, contracted, validated, and governed before a merchant-facing production release. It is an operational control document, not a product promise. No roadmap item authorizes an automatic refund, contest, dispute submission, issuer communication, customer penalty, or payment action.

The current implementation includes merchant-scoped case discovery, candidate reason-code/evidence mapping, local SLA ownership records, internal in-app escalation notices, safe buyer-workload triage, storage-derived trend and usage counts, source truth badges, a counterfactual demo control, a static illustrative external-dispute record, buyer-scoped process-local limits for catalog access, local case creation, and document upload, a merchant-approved redacted local audit download, and narrow internal merchant-team roles. Razorpay's received external fields remain authoritative when actually observed. [1] [2]

| Status | Meaning |
| --- | --- |
| **Implemented locally** | Protected application behavior is coded and must still be operated under the product boundaries. |
| **Activation prerequisite** | A real integration/control requires merchant credentials, a contract, environment configuration, and a verification plan. |
| **Production design requirement** | A necessary operating control that is deliberately not represented as active in the current build. |

## Release Gates

Production should use a separate project, database, storage namespace, webhook secret, URL, and restricted merchant configuration from the demo/sandbox environment. Synthetic data must be physically and logically isolated from production tenant records; a UI label alone is insufficient.

| Gate | Required control | Verification evidence | Current status |
| --- | --- | --- | --- |
| Environment separation | Separate staging and production deployments, databases, S3 prefixes, Razorpay keys/webhook secrets, and non-production seeding permissions. | Deployment inventory, secret ownership review, staging-to-production promotion record, and isolation test. | **Production design requirement** |
| Razorpay evidence export | Confirm provider-supported evidence submission/export shapes and authorization for the merchant account. Map only actual received reason metadata into provider fields. | Documented provider test, packet field validation, audit sample, and merchant approval log. | **Activation prerequisite** |
| Notifications | Add a contract-backed email/SMS/push provider, consent/preferences, template review, delivery audit, and rate limits. | End-to-end non-production delivery test and opt-out test. | Internal in-app escalation notice is implemented; external delivery is **not active**. |
| Carrier evidence | Connect only carriers with merchant authorization, signed delivery event provenance, replay safety, and exception handling. | Carrier sandbox/live contract test and source-labelled receipt sample. | **Inactive** |
| Malware scanning | Quarantine evidence before it becomes available to reviewers; scan asynchronously and preserve a safe pending/blocked state. | Scan logs, failure-mode exercise, quarantine deletion path, and access-control test. | **Production design requirement** |
| Distributed limits | Replace per-process webhook and buyer-facing rate-limit counters with an edge/distributed store suitable for autoscaling. | Load test across instances and observability alert. | Current source-IP webhook guard and authenticated-buyer limits are explicitly process-local. |

## Identity, Roles, and Tenant Controls

The current roles establish authenticated access and merchant scoping. The product now has an owner-managed, internal `viewer` / `reviewer` / `approver` membership record with server-enforced use in the team-enabled Risk Operations query, local SLA recording, language-triage request, and redacted audit download. Members must already have signed in; adding a member neither sends an invitation nor grants provider authority. A production team workflow still needs complete authorization coverage, invitation lifecycle, revocation, session review, and immutable audit attribution.

| Production role | Permitted local activity | Explicitly prohibited without separate policy/approval |
| --- | --- | --- |
| Viewer | Read source-labelled cases and packets. | Download protected documents, change ownership, approve decisions, send provider action. |
| Reviewer | Annotate evidence and propose case readiness. | Change final decision, create payment/refund, submit contest. |
| Approver | Record merchant decision after reviewing evidence and policy. | Autonomous provider submission, issuer contact, or bulk money movement. |
| Administrator | Manage team membership, retention policy configuration, and integration settings. | Access unrelated tenants or bypass audit records. |

Before relying on these roles for production, extend server-side authorization checks to every protected procedure, build an invitation lifecycle, revocation, session review, and tests proving no cross-tenant read/write path. The existing merchant-scope query boundary must be extended into every new provider, storage, notification, and partner endpoint.

## Data Protection, Retention, and Evidence Handling

Customer documents can contain sensitive facts. Production needs a published privacy notice, explicit upload processing explanation, retention purpose/period, deletion workflow, and exception hold process. In particular, document OCR/AI assistance must remain optional, source-limited, and never turn a candidate extraction into fact without human confirmation.

| Requirement | Production implementation prerequisite |
| --- | --- |
| Privacy notice | Identify categories of customer/order/evidence data, purpose, processors, merchant controller responsibilities, individual-request route, and contact point. Obtain legal review for actual merchant markets. |
| Retention and deletion | Define per-record retention, legal hold, deletion request verification, S3 deletion/version cleanup, database metadata deletion, and immutable audit minimums. |
| Evidence malware/quarantine | Store newly uploaded files outside reviewer-visible paths until scanning completes; preserve only metadata for rejected items. |
| Current upload validation | Preserve the existing allowlisted MIME type, maximum size, binary-signature check, protected storage path, and server-side filename normalization; apply a scanned/pending state before reviewer availability in production. |
| Payment data scope | Keep credential entry in Razorpay-hosted Checkout; do not collect/store/process card number, CVV, OTP, or UPI PIN. Validate the merchant's actual PCI obligations with a qualified assessor rather than asserting eligibility. |
| Data export | Implement authenticated, tenant-scoped compliance export with explicit audit trail and protected download expiry. |

The implemented **redacted local case-audit export** is intentionally narrower than a compliance export. It requires the fixed merchant approval phrase, records the approver, case, version, and content hash, and returns a browser download containing source-labelled operational metadata only. It never includes customer statement text, buyer identifiers, document bytes, storage keys, credentials, or provider submission fields. It does not send anything to Razorpay or an issuing bank.

## AI Governance and Evaluation

AI assistance must keep the strict Case Fact Sheet, allowed-source citation checks, deterministic fallback, and action prohibitions already used in the application. A production workflow needs versioned prompts, dataset governance, evaluation approval, monitoring, and rollback—not a silent model change.

| Control | Release requirement |
| --- | --- |
| Prompt/model versioning | Persist prompt ID, model ID, policy version, fact-sheet hash, output status, and fallback reason with every advisory. |
| Evaluation workflow | Maintain representative, permitted, versioned test cases; evaluate citation validity, unsupported-claim rate, evidence-gap accuracy, safety violations, and known limitation coverage before promotion. |
| Human review | No advisory may create a payment, refund, external dispute response, issuer communication, customer penalty, fraud determination, or outcome claim. |
| Observability | A merchant-scoped, process-local counter now records only Ollama validated/fallback outcomes, elevated SLA events, and invalid evidence-file rejection, with no statement text, buyer identity, document content, or provider event. Production must monitor error rate, fallback rate, latency, malformed-output rejection, provider failures, tenant-isolation violations, webhook rejection, and evidence scanning state without logging sensitive document contents. |
| Rollback | Support immediate routing to deterministic fallback and rollback to a prior approved prompt/model configuration. |

## Metering, Billing, and Partner API

Current usage counts are **not billing**. Before charging for orders, cases, documents, advisory runs, provider calls, or storage, define the billing unit, time boundary, adjustments, tax handling, dispute process, invoice source of truth, and customer-visible meter reconciliation. Do not convert record counts into charges until these controls are validated.

The current discovery response is bounded to a maximum of **50 local case records** per request and returns page metadata. Its merchant scope and role check are server-enforced. It is not yet a database-cursor/search-index implementation; scale testing and query/index design remain release requirements before relying on it for large tenants.

A partner API also requires an explicit API contract, OAuth or scoped service credentials, tenant authorization, rate limits, idempotency keys, audit logging, versioning, request signing, data minimization, and a deprecation policy. It must never expose protected documents or case facts across merchant boundaries.

## Activation Checklist

1. Create fully isolated staging and production environments and prove data/secret isolation.
2. Obtain merchant-approved provider credentials through managed secrets; never commit plaintext environment files.
3. Validate Razorpay evidence export/submission capability against actual provider documentation and a permitted non-production test.
4. Implement RBAC, privacy notice, retention/deletion, scan/quarantine, distributed limits, and production observability.
5. Establish prompt/evaluation change control and a deterministic rollback route.
6. Validate notifications, carriers, and partner API only when contracts, preferences, and source-provenance tests exist.
7. Complete an adversarial security review, load test, backup/recovery exercise, and merchant acceptance test.
8. Ask a merchant approver to make every money or external decision; preserve the resulting source and audit evidence.

## References

[1]: https://razorpay.com/docs/payments/payment-gateway/chargeback/submit-evidence/ "Razorpay — Submit Evidence for Disputes"
[2]: https://razorpay.com/docs/api/payments/disputes/entity/ "Razorpay — Disputes Entity"
