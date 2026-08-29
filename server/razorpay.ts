import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { getDb } from "./db";
import { customerCaseEvents, customerRefundRequests, paymentEvidenceEvents, paymentIntakes, webhookCaseLinks, webhookEvents } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { recordNotification } from "./notifications";
import { reconcileCaseReference } from "./webhookReconciliation";
import { verifiedWebhookCaptureTransition } from "./paymentIntake";
import { ENV } from "./_core/env";
import { buildVerifiedWebhookLedgerValues } from "./webhookDisputeLedger";
import { checkWebhookRateLimit } from "./webhookRateLimit";
import { appendPrivateIntegrityAnchor } from "./privateIntegrityService";

export const RAZORPAY_WEBHOOK_MAX_BYTES = 1_000_000;

export function verifyRazorpaySignature(rawBody: string, signature: string | undefined) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  if (digest.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

export function registerRazorpayWebhook(app: Express) {
  app.post("/api/webhooks/razorpay", expressRawJson, async (req: Request, res: Response) => {
    const rateLimit = checkWebhookRateLimit(req.socket?.remoteAddress ?? "unknown");
    if (!rateLimit.allowed) {
      res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
      return res.status(429).json({ ok: false, error: "rate_limited" });
    }
    const rawBody = req.body.toString("utf8");
    const signature = req.header("x-razorpay-signature");
    const verified = verifyRazorpaySignature(rawBody, signature);

    if (!verified) {
      return res.status(401).json({ ok: false, error: "invalid_signature" });
    }

    let payload: Record<string, any>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return res.status(400).json({ ok: false, error: "invalid_json" });
    }

    const eventId = String(req.header("x-razorpay-event-id") ?? payload.id ?? payload.event_id ?? crypto.createHash("sha256").update(rawBody).digest("hex"));
    const eventType = String(payload.event ?? payload.type ?? "unknown");
    const reconciliation = reconcileCaseReference(eventType, payload);
    const db = await getDb();

    if (db) {
      const existing = await db.select().from(webhookEvents).where(eq(webhookEvents.eventId, eventId)).limit(1);
      if (existing.length) return res.status(200).json({ ok: true, duplicate: true });
      await db.insert(webhookEvents).values(buildVerifiedWebhookLedgerValues({ eventId, eventType, merchantOpenId: ENV.ownerOpenId, rawMetadata: rawBody, payload }));
      if (reconciliation) {
        await db.insert(webhookCaseLinks).values({
          eventId,
          caseReference: reconciliation.caseReference,
          eventFamily: reconciliation.family,
          signatureVerified: verified,
        });
      }
      const paymentEntity = payload?.payload?.payment?.entity;
      if (paymentEntity?.order_id && eventType === "payment.captured") {
        const intake = (await db.select().from(paymentIntakes).where(eq(paymentIntakes.razorpayOrderId, paymentEntity.order_id)).limit(1))[0];
        if (intake) {
          const transition = verifiedWebhookCaptureTransition({ eventType, signatureVerified: verified });
          if (transition.status) await db.update(paymentIntakes).set({ status: transition.status, razorpayPaymentId: paymentEntity.id, capturedAt: new Date() }).where(eq(paymentIntakes.razorpayOrderId, paymentEntity.order_id));
          if (transition.createsEvidence) {
            await db.insert(paymentEvidenceEvents).values({ paymentIntakeId: intake.id, eventId, razorpayPaymentId: paymentEntity.id, amountPaise: Number(paymentEntity.amount ?? intake.amountPaise), signatureVerified: true });
          }
          recordNotification({ type: "webhook", title: "Verified merchant payment captured", body: `${paymentEntity.id} was recorded as signed payment evidence for intake ${intake.receipt}.`, tone: "success" });
        }
      }
      if (paymentEntity?.order_id && eventType === "payment.failed") {
        await db.update(paymentIntakes).set({ status: "failed", razorpayPaymentId: paymentEntity.id }).where(eq(paymentIntakes.razorpayOrderId, paymentEntity.order_id));
      }
      const refundEntity = payload?.payload?.refund?.entity;
      if (eventType === "refund.processed" && refundEntity?.payment_id && refundEntity?.id) {
        const localRequest = (await db.select().from(customerRefundRequests).where(eq(customerRefundRequests.razorpayPaymentId, String(refundEntity.payment_id))).limit(1))[0];
        if (localRequest?.status === "merchant_approved") {
          await db.update(customerRefundRequests).set({ status: "razorpay_confirmed", razorpayRefundId: String(refundEntity.id), confirmedAt: new Date() }).where(eq(customerRefundRequests.id, localRequest.id));
          await db.insert(customerCaseEvents).values({ customerCaseId: localRequest.customerCaseId, actorType: "system", actorOpenId: null, eventType: "razorpay_refund_processed_verified", detail: `A signed Razorpay refund.processed event confirmed refund ${refundEntity.id}. This confirmation came from the webhook, not the merchant interface.`, sourceRefs: JSON.stringify({ eventId, razorpayRefundId: String(refundEntity.id), razorpayPaymentId: String(refundEntity.payment_id) }) });
          const safeWebhookMetadataHash = crypto.createHash("sha256").update(JSON.stringify({ eventId, eventType, refundId: String(refundEntity.id), paymentId: String(refundEntity.payment_id), signatureVerified: true })).digest("hex");
          const integrityResult = await appendPrivateIntegrityAnchor(db, { merchantOpenId: localRequest.merchantOpenId, customerCaseId: localRequest.customerCaseId, anchorType: "verified_webhook", sourceRecordId: eventId, payloadHash: safeWebhookMetadataHash, createdBy: null });
          if (integrityResult.created) await db.insert(customerCaseEvents).values({ customerCaseId: localRequest.customerCaseId, actorType: "system", actorOpenId: null, eventType: "integrity_anchor_created", detail: "Private database integrity anchor created from signed Razorpay refund-confirmation metadata already linked to this local case. Raw webhook content, signatures, and credentials are excluded.", sourceRefs: JSON.stringify({ sourceKind: "private_integrity", anchorType: "verified_webhook", integrityAnchor: integrityResult.anchor.chainHash.slice(0, 16), eventId }) });
          recordNotification({ type: "webhook", title: "Verified Razorpay refund processed", body: `${refundEntity.id} confirmed a merchant-approved local refund request.`, tone: "success" });
        }
      }
    }

    recordNotification({ type: eventType.includes("dispute") ? "deadline" : "webhook", title: eventType.includes("dispute") ? "New dispute received" : "Razorpay event received", body: `${eventType} · ${eventId} is ready for case linkage.`, tone: eventType.includes("dispute") ? "critical" : "success" });

    return res.status(200).json({ ok: true, eventId, signatureVerified: verified, mode: process.env.RAZORPAY_WEBHOOK_SECRET ? "configured" : "unconfigured" });
  });
}

export function expressRawJson(req: Request, res: Response, next: () => void) {
  const chunks: Buffer[] = [];
  let byteLength = 0;
  let rejected = false;
  req.on("data", chunk => {
    if (rejected) return;
    const buffer = Buffer.from(chunk);
    byteLength += buffer.length;
    if (byteLength > RAZORPAY_WEBHOOK_MAX_BYTES) {
      rejected = true;
      res.status(413).json({ ok: false, error: "payload_too_large" });
      return;
    }
    chunks.push(buffer);
  });
  req.on("end", () => {
    if (rejected) return;
    (req as Request & { body: Buffer }).body = Buffer.concat(chunks);
    next();
  });
}
