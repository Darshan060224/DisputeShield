# DisputeShield Flow and Required Actions

> **Supporting operating appendix.** The canonical judge-facing front door is [`disputeshield-judge-handout.md`](./disputeshield-judge-handout.md), which contains the timed demo order, benchmark scope, and primary truth-boundary narrative. This document supplies the detailed actor-by-actor flow.

## What DisputeShield Does

DisputeShield helps a delivery- and return-heavy merchant prevent avoidable losses by keeping **order, payment, fulfilment, customer-issue, return, and evidence facts** in one source-labelled workflow. It is a **defence-only AI Risk Manager**: it identifies missing evidence and safe next tasks, but it does not automatically take money, refund a buyer, contest a dispute, contact a bank, or claim a result.

> **Core rule:** A local customer issue is not a bank chargeback. A checkout callback is not a captured payment. Only a named, verified source can establish an external fact.

## End-to-End Flow

| Step | What happens | DisputeShield action | Required user action | Source of truth |
| --- | --- | --- | --- | --- |
| 1. Merchant setup | A merchant creates products, price, inventory, and fulfilment context in Seller Space. | Stores merchant-scoped catalog and operational records. | **Merchant:** create or maintain product and stock data. | Merchant record |
| 2. Buyer access | Merchant shares a private catalog/order link. The first authenticated buyer who redeems it becomes the only buyer who can use it. | Binds the token atomically, checks expiry, and blocks other buyers. | **Merchant:** share the private link. **Buyer:** sign in and redeem it. | Signed-in buyer + protected access record |
| 3. Buyer checkout intent | Buyer chooses a product and quantity. | Re-checks inventory and atomically reserves stock before a Razorpay order is created. | **Buyer:** explicitly select **Buy with Razorpay**. | Merchant inventory record |
| 4. Hosted payment | Razorpay Checkout opens. | Records only the created order / checkout context. | **Buyer:** choose payment method and complete the Razorpay-controlled authentication. Card, CVV, OTP, bank/UPI details stay with Razorpay. | Razorpay Checkout |
| 5. Payment confirmation | Razorpay returns a Checkout response; later its API and/or webhook can report capture. | Verifies Checkout signature; separately records API-observed and HMAC-verified webhook states. | **Razorpay:** sends event. **Merchant:** may refresh/review. | Razorpay API / signed Razorpay webhook |
| 6. Fulfilment | Seller packs, ships, delivers, or records a delivery exception. | Builds evidence readiness and proactive reminders. | **Merchant:** record fulfilment facts and attach trustworthy proof. | Merchant record; carrier source only if integrated |
| 7. Buyer issue or return | Buyer reports product-not-received, damaged item, return, wrong amount, duplicate payment, refund issue, or unauthorised transaction. | Opens a **local customer case** and never creates an external dispute. | **Buyer:** submit issue details and optional evidence. | Customer local case |
| 8. OCR review | Buyer submits a document such as a receipt or support export. | Produces candidate OCR facts with confidence. | **Buyer:** confirm, correct, or reject OCR facts. | Buyer-confirmed document facts |
| 9. Evidence and AI guidance | DisputeShield compares available proof with the issue-specific evidence policy. | Calculates reason-code-weighted readiness; flags missing/conflicting facts; generates a cited advisory narrative or, if unavailable/unsafe, a deterministic source-cited fallback. | **Merchant:** review the cited facts and task list. | Case Fact Sheet + source-labelled records |
| 10. Local resolution | Merchant can request tracking, authorise a return, offer a resolution, or prepare a refund request. | Prepares tasks and keeps a full audit trail. | **Merchant:** explicitly approve any irreversible decision. | Merchant decision + supporting evidence |
| 11. Refund gate | If a return/refund is appropriate, evidence and policy requirements are checked. | Blocks automatic refunds and distinguishes prepared from confirmed refund state. | **Merchant:** explicitly approve the refund. **Razorpay:** must confirm the refund event. | Merchant approval + signed Razorpay refund event |
| 12. External dispute boundary | A buyer may independently contact their issuing bank. The bank/card network/Razorpay may then raise an external dispute. | Does not generate this dispute. It waits for Razorpay API evidence or a signed webhook. | **Issuer/bank and Razorpay:** create and deliver external event. | Razorpay external record / HMAC-verified webhook |
| 13. Merchant dispute review | A verified external dispute appears with reason, deadline, evidence gaps, and packet readiness. | Prepares factual packet material and shows an AI/rule advisory. | **Merchant:** choose accept or contest. | Merchant decision; source-labelled external event |
| 14. Outcome | The bank/card network/Razorpay process the response and outcome. | Records the outcome only when received from a named source. | **External parties:** decide and publish the outcome. | Issuer/Razorpay confirmed outcome |

## What Is Automated vs. What Needs a Person

| Capability | Automated by DisputeShield | Human or external action required |
| --- | --- | --- |
| Evidence work | Match order/payment references, classify source, identify missing proof, calculate evidence readiness, surface stale evidence, prepare a packet draft. | Merchant reviews facts and decides what to do. |
| AI advisory | Generate a fact-cited operational narrative from a strict Case Fact Sheet; fall back safely if unavailable or unsafe. | Merchant remains responsible for the decision. |
| Customer case handling | Create a local case after buyer submission; maintain an immutable timeline. | Buyer submits the issue and confirms OCR results. |
| Refund workflow | Identify readiness and prepare a request. | Merchant approves; Razorpay must confirm the result. |
| External disputes | Detect a received, verified Razorpay external event and prepare evidence. | Issuer/bank raises the dispute; merchant accepts/contests; Razorpay/bank confirms outcome. |
| Payments | Create the Razorpay order only after explicit buy/collect action. | Buyer/merchant completes hosted Checkout; Razorpay controls credentials and authentication. |
| Webhook processing | Enforce payload limit, HMAC, merchant scope, idempotency, and burst protection. | Razorpay must deliver a signed event to the configured published endpoint. |

## Actions You Need to Take

### Actions needed to use the local product workflow

1. **Sign in as merchant** to use Seller Space, create products, view protected reports, seed the labelled local walkthrough, and review customer cases.
2. **Create a product** with a realistic price and inventory quantity.
3. **Share a private catalog or order link** with the intended buyer.
4. **Record fulfilment facts** honestly: packed, shipped, delivered, or delivery exception. Attach invoice, tracking, proof of delivery, or support evidence when available.
5. **Review local cases** and explicitly approve return/refund preparation or an external packet decision.

### Actions needed from the buyer

1. **Sign in** before redeeming a private catalog/order link.
2. **Choose a product and explicitly open Checkout** if they want to pay.
3. **Enter payment credentials and complete authentication inside Razorpay Checkout.** DisputeShield never requests, stores, or completes card number, CVV, OTP, UPI PIN, or bank credentials.
4. **Submit a local issue or return request** if needed.
5. **Confirm OCR candidate facts** after document processing.

### Actions needed from Razorpay / issuing bank

1. **Razorpay:** process the hosted Checkout and return payment data.
2. **Razorpay:** send a correctly signed webhook to the published DisputeShield endpoint before capture/refund/dispute events are treated as webhook-verified.
3. **Issuing bank/card network:** initiate and decide an external dispute. DisputeShield cannot start this process.

## What You Need to Do for Live Proof

The current build has validated code paths and a safe synthetic walkthrough. The following require separate user control and/or external delivery:

| Live proof | Required action | Why DisputeShield cannot do it automatically |
| --- | --- | --- |
| Authenticated workspace validation | Sign in as the merchant in the browser. | Merchant cases, documents, and data must remain private. |
| Synthetic demo walkthrough | Use the owner-only seed control after sign-in. | It writes clearly labelled local data; it never creates payment/refund/dispute facts. |
| Test Mode Checkout | Give fresh approval to open Checkout, then complete or cancel it yourself. | Payment credentials and authentication are controlled by Razorpay and the user. |
| Signed webhook delivery | Publish the project, configure a separate DisputeShield Razorpay webhook endpoint, and wait for Razorpay delivery. | Only Razorpay can send the signed source event. |
| Refund confirmation | Merchant explicitly approves; Razorpay processes and reports confirmation. | Money movement must remain merchant-gated and provider-confirmed. |
| External dispute/outcome | Issuer/bank initiates; Razorpay delivers the event; merchant decides response. | DisputeShield must not impersonate an issuer or invent external truth. |

## The Best Judge Demo Flow

For a non-financial, safe demonstration, open **Reports** first. Show the **Hero Case**, **Truth Chain**, readiness/external-proof boundary, and Evaluation Lab metrics. Then open **Seller Space** to show product, inventory, fulfilment, and local evidence context. Finally open **Customer Space** to show buyer privacy, local issue intake, and OCR confirmation. Finish at **Webhook Ledger** to show why a signed provider delivery—not a browser click—establishes external truth.

Do not present the synthetic Hero Case or benchmark as a real bank result, fraud prediction, money-saved figure, or completed chargeback. The product’s strength is its disciplined evidence and decision boundary.
