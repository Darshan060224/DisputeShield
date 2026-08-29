# Private Evidence-Integrity Design

## Purpose

DisputeShield will add a **private cryptographic audit chain** to make approved local evidence records tamper-evident. It is not a cryptocurrency, payment feature, wallet, smart contract, public blockchain record, dispute decision, or financial action.

## Stored Anchor Record

Each merchant-scoped anchor will store only a canonical payload hash, the prior merchant-chain hash, its calculated chain hash, anchor type, version, local record reference, actor reference, and timestamp. The database will not store the original document bytes, customer statement, address, card data, CVV, OTP, UPI PIN, access token, webhook signature, or provider credential in the anchor payload.

## Chain Rules

The chain hash is computed from a canonical, versioned object containing the merchant identifier, local case identifier, anchor type, referenced local-record identifier, payload hash, previous chain hash, and timestamp. Verification recomputes each hash in creation order and reports either **valid**, **missing**, or **mismatch** without repairing or mutating the chain.

## Reflection Points

| Surface | Reflection |
| --- | --- |
| Redacted case audit export | An export approval creates an immutable `audit_export` anchor and a local timeline event. Repeating the same export preserves the original anchor rather than recalculating it. |
| Evidence packet | A future `packet_release` anchor will be created only after the existing merchant approval guard; it cannot submit a provider response. |
| Document Vault | Each newly stored protected document creates a `document_checksum` anchor from its existing SHA-256 checksum. Document contents and storage keys remain private. |
| Webhook Ledger | A `verified_webhook` anchor is created only for a signature-verified `refund.processed` event that confirms an already merchant-approved local refund request and therefore has a safe case link. Its hash covers only event ID, event type, provider refund/payment IDs, and the verified flag; raw body, signature, and secrets remain excluded. Other webhook events remain unanchored until a safe case relationship exists. |
| Case Timeline | The existing audit-export event records a short private anchor reference. A richer timeline verification control remains pending. |
| Risk Operations / Reports | Protected verification is available and Reports renders the current merchant private Merkle-root summary. Neither is a public-chain, payment, or dispute-provenance claim. |

## External Blockchain Boundary

No external blockchain transaction is created in this implementation. An optional external anchor remains **inactive** and could publish only a merchant-approved daily Merkle root after a separate network, wallet/key custody, cost, compliance, privacy, retry, and recovery review. No wallet, token, smart contract, gas fee, public-chain record, or external transaction is present or required for the implemented private chain.

## Current Case-Linkage Boundary

The implemented `customerCaseIntegrityAnchors` contract requires a local `customerCaseId`. Existing packet-export records do not currently establish that safe local-case relationship, so `packet_release` anchors remain inactive. Most webhook records are also unanchored for the same reason. The sole implemented exception is a signature-verified `refund.processed` event that reconciles to an existing merchant-approved local refund request, which already includes the local case relationship. DisputeShield does not fabricate a relationship merely to increase anchor coverage.
