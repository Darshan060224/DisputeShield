# Razorpay Live Activation Research Notes

## Official Findings

| Topic | Official finding | DisputeShield implication |
| --- | --- | --- |
| Dispute source | A dispute may be initiated by the issuing bank or a customer through the issuing bank. [1] | Customer Space must remain a local-resolution workflow and cannot claim to create a Razorpay dispute. |
| Merchant action | Razorpay documents accept or contest paths; contest evidence is reviewed by the customer's bank. [1] | Evidence preparation can be automated safely, but contest submission remains a merchant-controlled external action. |
| Submission controls | Razorpay's contest API distinguishes draft from `submit`; a submitted contest requires at least one document and changes a dispute to `under_review`. [2] | DisputeShield's evidence-object preview must remain non-submitting until an explicitly approved, provider-validated workflow is designed. |
| Event delivery | Razorpay documents at-least-once webhooks, exponential retries for delivery failures, potential out-of-order delivery, and an event ID for de-duplication. [3] | The existing HMAC verification, idempotency, duplicate suppression, and source-labelled ledger are correct foundations; a published delivery drill is still required. |
| Synchronous truth | Razorpay says webhooks are asynchronous and payment APIs may be polled for business-critical synchronous use cases. [3] | Browser confirmation alone must never update captured-payment or external-dispute truth. |

## References

[1]: https://razorpay.com/docs/payments/disputes/ "Razorpay — About Disputes"
[2]: https://razorpay.com/docs/api/disputes/contest/ "Razorpay — Contest a Dispute API"
[3]: https://razorpay.com/docs/webhooks/best-practices/ "Razorpay — Webhooks Best Practices"
