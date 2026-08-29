# Customer Space AI Assistance and Cache Policy

## Buyer journey

Customer Space is a private, buyer-bound workflow. A merchant shares a short-lived catalog token or order token; the first authenticated buyer to redeem it binds the token to their identity. The buyer can browse active local products without creating an order. A Razorpay Checkout opens only after the buyer explicitly chooses **Buy with Razorpay**. Browser checkout verification can establish only a server-verified checkout signature; payment capture, fulfilment, refunds, and disputes remain separately source-labelled facts.

| Stage | System action | Source label | Automatic money movement |
|---|---|---|---|
| Catalog browse | Lists active local merchant products | Merchant record | No |
| Buy with Razorpay | Creates a Razorpay order after explicit buyer action | Customer-initiated local order | No |
| Checkout callback | Verifies the browser signature server-side | Client-confirmed checkout | No |
| Payment capture | Waits for a Razorpay API fact or signed webhook | Razorpay API / signed webhook | No |
| Return and issue | Creates a local customer case with evidence | Customer local case | No |
| Evidence assistance | Produces candidate facts only after customer opt-in | Gemini candidate | No |
| Refund confirmation | Reflects only signed Razorpay refund events | Signed Razorpay webhook | No |

## Gemini multimodal evidence assistance

Gemini is called only from the server, only when a buyer has explicitly selected the assistance opt-in for the file they are uploading. The request contains the chosen evidence file, the local order reference, and the selected issue type. It returns a bounded JSON candidate containing a document type, summary, confidence values, candidate fields, and warnings.

The assistant is not an OCR truth source. The original document remains immutable, the buyer must confirm/reject candidate facts, and the merchant must review the underlying evidence. Gemini cannot create a payment, refund, return label, carrier claim, external appeal, chargeback, or fraud conclusion.

## Cache policy

DisputeShield includes a dual-layer caching engine powered by **Redis** (`ioredis`). When `REDIS_URL` is configured, Customer Space and system queries utilize Redis with automatic TTL expiration. If `REDIS_URL` is omitted or temporarily unreachable, the application gracefully degrades to a short-TTL, process-local memory cache. Caching is strictly a **performance optimization, not a source of truth**.

| Cached data | Cache key scope | TTL | Write-time invalidation | Excluded data |
|---|---|---:|---|---|
| Active catalog | Merchant identifier | 30 seconds | Product creation | Catalog tokens, buyer identity, documents |
| Buyer order summaries | Merchant identifier + buyer identifier | 10 seconds | Buyer order creation and checkout-state changes | Access tokens, payment signatures, OCR text, refund state |

The cache never stores raw customer documents, OCR/LLM content, access tokens, checkout signatures, webhook payloads, full payment records, carrier phone data, or merchant approval phrases. Production Redis configuration uses `REDIS_URL` (with TLS support via `rediss://`), tenant-scoped key prefixes, and strict write-time invalidation.

