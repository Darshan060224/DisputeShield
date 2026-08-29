# Security Policy

## Security & Defense-Only Guarantees

DisputeShield is an operations and evidence readiness manager designed around strict non-financial security boundaries:

1. **Non-Financial Action Boundary**: The AI layer and automated pipelines never move funds, approve refunds, create chargebacks, or submit external provider responses automatically.
2. **Signature Verification**: All incoming Razorpay webhooks enforce HMAC SHA-256 signature verification (`x-razorpay-signature`). Unsigned or tampered requests are rejected (`401 Unauthorized`).
3. **Private Evidence Integrity**: Local case state and evidence anchors use database-backed SHA-256 hash chains.
4. **Credential Isolation**: Secrets, API keys, and database connection strings remain server-side and are never exposed to client bundles.

---

## Reporting a Vulnerability

If you discover a security vulnerability within DisputeShield, please report it responsibly:

- **Do NOT** open a public GitHub issue for security vulnerabilities.
- Submit details privately to the project maintainers via email or security advisory.
- Provide step-by-step reproduction instructions, payload details, and impact assessment.

We appreciate responsible disclosure and will address reported issues promptly.
