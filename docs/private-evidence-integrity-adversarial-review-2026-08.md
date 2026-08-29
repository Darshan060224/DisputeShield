# Private Evidence-Integrity Adversarial Review

> **Scope.** This review examines the private case-scoped hash-chain feature only. It does not assess Razorpay payment processing, refunds, dispute outcomes, or public-blockchain systems. No production record was modified for this review.

## Verified Findings

| ID | Severity | Finding | Evidence and consequence | Status |
| --- | --- | --- | --- | --- |
| PI-01 | High | The original chain hash included a millisecond ISO timestamp while the database anchor column persists whole-second timestamps. | A later read reconstructs a different timestamp string and therefore a different hash, causing a valid newly inserted anchor to appear tampered. | **Remediated for new anchors.** Creation now normalizes to whole seconds and explicitly persists that exact timestamp. Existing anchors created before the fix must be treated as legacy verification exceptions. |
| PI-02 | High | Concurrent appends could read the same latest anchor before either insert committed. | Two anchors could share one predecessor, producing a fork. The prior verifier could only return a generic mismatch when rows were read in an unexpected order. | **Remediated for current creators.** A persisted per-case integrity-head row is locked in a database transaction before audit-export, document-checksum, or safe verified-webhook append. The service preserves an existing logical anchor on replay and advances the head only with the new anchor. |
| PI-03 | Medium | Verification depended on query order rather than following stored predecessor links. | A valid chain returned in a non-ID order could appear invalid despite intact hashes. | **Remediated.** The verifier starts at the unique root, follows successor links, rejects cycles/orphans/forks, and confirms every anchor was visited. |
| PI-04 | Medium | An unknown anchor version could be recomputed under the current version. | A future contract change could be silently judged against the wrong rules. | **Remediated.** Unsupported anchor versions now fail with `unsupported_anchor_version`. |
| PI-05 | Medium | Existing records from before PI-01 may not verify under the corrected timestamp canonicalization. | Retroactively rewriting their hash would destroy evidentiary history; silently accepting them would overstate assurance. | **Partially remediated and visible.** A failed existing verification now blocks any new append, preserving the evidence for review rather than extending an invalid chain. A versioned legacy verifier is still required. |
| PI-06 | Medium | The Reports root was a current private database Merkle root, not a durable daily checkpoint. | Calling it a daily root could imply a frozen daily attestation that does not exist. | **Open wording/design gap.** Current UI labels it as a current database root; a day-bounded, persisted checkpoint requires a separate retention and scheduling design. |
| PI-07 | Low | A full private chain hash can reveal a stable correlation handle across screens. | It does not reveal document bytes, but broad exposure makes unnecessary correlation easier. | **Partially mitigated.** Timeline shows a short reference; the verifier still shows a full hash to authorised merchant viewers. Review role-based truncation before broad team rollout. |

## Tested Invariants

The automated integrity suite now proves that the private contract is deterministic, detects a modified payload, creates an order-independent Merkle root, normalizes the timestamp to the persisted precision, verifies a valid chain independently of row order, detects a fork, and rejects an unsupported anchor version. These are code-level invariants. They are not proof of an external payment, webhook delivery, refund, dispute outcome, or public ledger.

## Integrity-Flow Boundaries

| Flow | Anchor condition | Protected exclusions |
| --- | --- | --- |
| Redacted audit export | Explicit approver action; replay uses the existing deterministic export anchor. | Buyer identity, statements, addresses, document bytes and keys, credentials, and provider submission. |
| Document storage | Successful protected document storage with the file’s SHA-256 checksum. | File bytes, checksum value in the UI, storage key, and OCR/customer content. |
| Verified webhook | Only a HMAC-verified `refund.processed` event already reconciled to a merchant-approved local refund request/case. | Raw webhook body, signature, secret, and all unlinked webhook events. |
| Merchant root | Current merchant anchor set. | It is not a daily persisted checkpoint, public-chain commitment, or source-truth upgrade. |

## Required Next Hardening

The next safe engineering increment is a **versioned legacy verifier and anchor inventory** for the pre-PI-01 timestamp records. The current append service verifies an existing case chain under the row lock and refuses to extend it if verification fails; when valid, it lazily initializes a case head from the existing root without rewriting history. A future legacy verifier must identify any pre-remediation records that used millisecond timestamps, explain their verification exception, and never repair, delete, or rewrite the historical chain. A separate hardening test should exercise transaction contention against the actual managed database before multi-replica production use.

## Non-Goals Retained

This feature does not create a public blockchain transaction, wallet, token, smart contract, gas fee, payment, refund, chargeback, contest, provider response, issuer communication, or outcome claim. Private integrity metadata does not raise the truth level of a merchant record, API observation, or webhook fact.
