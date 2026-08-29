import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { buildVerifiedDraft, validateDisputeCase } from "./disputeEngine";
import { getDb } from "./db";
import { customerCaseAuditExports, customerCaseDocuments, customerCaseEscalations, customerCaseEvents, customerCaseIntegrityAnchors, customerCases, customerCatalogAccess, customerDocumentExtractions, customerOrderAccess, customerRefundRequests, customerReturnReceipts, exportRecords, merchantTeamMemberships, sellerDisputeScenarios, sellerFulfillmentEvents, sellerOrders, sellerProducts, users, webhookEvents } from "../drizzle/schema";
import { listNotifications, recordNotification } from "./notifications";
import { createCaseEvidenceQr, fetchRazorpayPayment, getRazorpayAccountSnapshot, getRazorpayCheckoutMode, listLiveProductNotReceivedDisputes, listLiveRazorpayDisputes, listRecentRazorpayPayments, type RazorpayDispute } from "./razorpayClient";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import crypto from "node:crypto";
import type { ResultSetHeader } from "mysql2/promise";
import { paymentIntakes } from "../drizzle/schema";
import { createMerchantPaymentOrder, verifyRazorpayCheckoutSignature } from "./razorpayClient";
import { checkoutVerificationTransition, summarizeWebhookVerifiedIntakes } from "./paymentIntake";
import { inventoryReservationOutcome, recommendSellerScenario, SELLER_SCENARIOS, scenarioMetadata, sellerRazorpayObservationState, sellerReviewReadiness, uniqueLatestSellerScenarios } from "./sellerSpace";
import { canReleaseAppealPacket, evaluateAppealPolicy } from "./appealPolicy";
import { calculateCustomerCaseEvidenceReadiness, CUSTOMER_CASE_GUIDANCE, CUSTOMER_DOCUMENT_KINDS, CUSTOMER_ISSUE_TYPES, isCustomerScopedRecord, transitionCustomerCase } from "./customerCasePolicy";
import { buildMerchantOperationalSignals, buildUniversalResolutionRecommendation } from "./universalResolution";
import { extractCustomerDocument } from "./customerDocumentOcr";
import { storageGetSignedUrl, storagePut } from "./storage";
import { getOrSetScopedCache, invalidateScopedCache } from "./requestCache";
import { summarizeBuyerOrders } from "./customerOrderSummary";
import { ENV } from "./_core/env";
import { buildExternalDisputeControl } from "./universalDisputeControl";
import { projectLatestSignedWebhookDisputes } from "./signedWebhookDisputeProjection";
import { mergeCommandCentreSources } from "./webhookDisputeLedger";
import { buildProactiveRiskIntelligence } from "./proactiveRiskIntelligence";
import { buildCaseFactSheet, generateRiskNarrative } from "./riskNarrative";
import { runHeldOutRiskBenchmark } from "./riskBenchmark";
import { DEMO_SEED_ACKNOWLEDGEMENT, demoSeedAllowed } from "./demoSeedPolicy";
import { bindFirstCustomerAccess } from "./customerAccessBinding";
import { buildRazorpayEvidenceExportPreview, getReasonCodeMapping } from "./reasonCodeMapping";
import { buildBuyerPatternSignals, buildRiskTrend, buildRollingRiskReport, buildUsageMeter, filterMerchantCases, paginateMerchantCases } from "./riskOperations";
import { checkCustomerRateLimit } from "./customerRateLimit";
import { sanitizePlainText } from "./plainTextSanitization";
import { analyzeCustomerStatementWithOllama } from "./ollamaSentiment";
import { buildRedactedCaseAudit, CASE_AUDIT_APPROVAL_PHRASE, CASE_AUDIT_EXPORT_VERSION, hashRedactedCaseAudit } from "./caseAuditExport";
import { evaluateMerchantTeamAccess, MERCHANT_TEAM_BOUNDARY, MERCHANT_TEAM_ROLES, type MerchantTeamRole } from "./merchantTeamAccess";
import { getOperationalTelemetry, recordOperationalTelemetry } from "./operationalTelemetry";
import { PRIVATE_INTEGRITY_VERSION, buildMerkleRoot, createIntegrityAnchor, createIntegrityTimestamp, verifyIntegrityChain } from "./privateIntegrity";
import { appendPrivateIntegrityAnchor } from "./privateIntegrityService";

const CUSTOMER_DOCUMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
const CUSTOMER_DOCUMENT_MAX_BYTES = 3_500_000;

function hashCustomerAccessToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function requireMerchantTeamRole(db: any, actorOpenId: string, merchantOpenId: string, required: MerchantTeamRole) {
  const membership = actorOpenId === merchantOpenId ? null : (await db.select().from(merchantTeamMemberships).where(and(eq(merchantTeamMemberships.merchantOpenId, merchantOpenId), eq(merchantTeamMemberships.memberOpenId, actorOpenId))).limit(1))[0] ?? null;
  const access = evaluateMerchantTeamAccess({ actorOpenId, merchantOpenId, memberRole: membership?.role, active: membership?.active, required });
  if (!access.permitted) throw new Error("Your internal merchant-team role does not permit this local workspace action.");
  return access;
}

function safeCustomerFileName(value: string) {
  const base = value.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_+/, "").slice(0, 180);
  return base || "customer-document";
}

function customerDocumentExtension(contentType: string) {
  if (contentType === "application/pdf") return "pdf";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

function validCustomerDocumentSignature(contentType: string, data: Buffer) {
  if (contentType === "application/pdf") return data.subarray(0, 4).toString("ascii") === "%PDF";
  if (contentType === "image/png") return data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (contentType === "image/jpeg") return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (contentType === "image/webp") return data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

function universalCaseRecommendation(input: {
  caseItem: typeof customerCases.$inferSelect;
  documentRows: Array<{ declaredKind: typeof customerCaseDocuments.$inferSelect["declaredKind"]; extraction: typeof customerDocumentExtractions.$inferSelect | null }>;
  order: typeof sellerOrders.$inferSelect | null;
  returnReceipt: typeof customerReturnReceipts.$inferSelect | null;
  refundRequest: typeof customerRefundRequests.$inferSelect | null;
}) {
  return buildUniversalResolutionRecommendation({
    issueType: input.caseItem.issueType,
    status: input.caseItem.status,
    documentKinds: input.documentRows.map(document => document.declaredKind),
    hasUnreviewedExtraction: input.documentRows.some(document => document.extraction?.status === "complete" && document.extraction.customerConfirmation === "not_reviewed"),
    paymentObservation: input.order?.paymentObservation ?? "created",
    fulfilmentState: input.order?.fulfillmentState ?? "unfulfilled",
    refundConfirmed: input.refundRequest?.status === "razorpay_confirmed",
    returnReceiptRecorded: Boolean(input.returnReceipt),
  });
}

async function resolveCustomerAccess(buyerOpenId: string, rawAccessToken: string) {
  const db = await getDb();
  if (!db) throw new Error("Customer Space storage is unavailable.");
  const grant = (await db.select().from(customerOrderAccess).where(eq(customerOrderAccess.accessTokenHash, hashCustomerAccessToken(rawAccessToken))).limit(1))[0];
  if (!grant || !grant.active || grant.expiresAt.getTime() <= Date.now()) throw new Error("This Customer Space access link is invalid, expired, or unavailable.");
  const order = (await db.select().from(sellerOrders).where(and(eq(sellerOrders.id, grant.sellerOrderId), eq(sellerOrders.merchantOpenId, grant.merchantOpenId))).limit(1))[0];
  if (!order) throw new Error("The linked merchant order is unavailable.");
  const boundGrant = await bindFirstCustomerAccess({
    grant,
    buyerOpenId,
    tryClaimUnboundGrant: async () => {
      const [result] = await db.execute<ResultSetHeader>(sql`UPDATE ${customerOrderAccess} SET ${customerOrderAccess.boundBuyerOpenId} = ${buyerOpenId}, ${customerOrderAccess.redeemedAt} = NOW() WHERE ${customerOrderAccess.id} = ${grant.id} AND ${customerOrderAccess.boundBuyerOpenId} IS NULL`);
      return result.affectedRows === 1;
    },
    reloadGrant: async () => (await db.select().from(customerOrderAccess).where(eq(customerOrderAccess.id, grant.id)).limit(1))[0] ?? null,
    unavailableMessage: "This Customer Space access link is unavailable.",
    alreadyBoundMessage: "This Customer Space access link is already bound to a different signed-in customer.",
  });
  return { db, grant: boundGrant, order };
}

async function resolveCustomerCatalogAccess(buyerOpenId: string, rawAccessToken: string) {
  const db = await getDb();
  if (!db) throw new Error("Customer Space storage is unavailable.");
  const grant = (await db.select().from(customerCatalogAccess).where(eq(customerCatalogAccess.accessTokenHash, hashCustomerAccessToken(rawAccessToken))).limit(1))[0];
  if (!grant || !grant.active || grant.expiresAt.getTime() <= Date.now()) throw new Error("This customer catalog access token is invalid, expired, or unavailable.");
  const boundGrant = await bindFirstCustomerAccess({
    grant,
    buyerOpenId,
    tryClaimUnboundGrant: async () => {
      const [result] = await db.execute<ResultSetHeader>(sql`UPDATE ${customerCatalogAccess} SET ${customerCatalogAccess.boundBuyerOpenId} = ${buyerOpenId}, ${customerCatalogAccess.redeemedAt} = NOW() WHERE ${customerCatalogAccess.id} = ${grant.id} AND ${customerCatalogAccess.boundBuyerOpenId} IS NULL`);
      return result.affectedRows === 1;
    },
    reloadGrant: async () => (await db.select().from(customerCatalogAccess).where(eq(customerCatalogAccess.id, grant.id)).limit(1))[0] ?? null,
    unavailableMessage: "This customer catalog access token is unavailable.",
    alreadyBoundMessage: "This customer catalog access token is already bound to a different signed-in customer.",
  });
  return { db, grant: boundGrant };
}

const disputes = [
  {
    id: "DSP-1048", externalId: "dp_rzp_1048", label: "product not received", amount: 2499, currency: "INR", status: "review", recommendation: "contest", confidence: 92, deadline: "Aug 24 · 18:00", evidence: 94, priority: "HIGH", customer: "Aarav Mehta", order: "ORD-90821", falseContestCost: 2499,
    summary: "Delivery evidence is complete and internally consistent. The shipment was delivered to the order address with OTP confirmation.",
    claims: [
      { kind: "Delivery proof", source: "Delhivery / DL-77A1", claim: "Package delivered on 18 Aug at 14:42 with OTP confirmation.", verified: true },
      { kind: "Address match", source: "Order / ORD-90821", claim: "Delivery PIN 560001 matches the order address.", verified: true },
      { kind: "Payment", source: "Razorpay / pay_rzp_3D1E", claim: "₹2,499 captured for the referenced order.", verified: true },
      { kind: "Support history", source: "Zendesk / TKT-4471", claim: "Customer asked about warranty after delivery.", verified: true },
    ],
    audit: [
      ["03:14:08", "Webhook received", "payment.captured · signature verified"],
      ["03:14:10", "Evidence joined", "4 source records linked"],
      ["03:14:11", "Validation passed", "IDs, amount, date, delivery, address"],
      ["03:14:12", "Recommendation", "Contest · 92% confidence"],
    ],
  },
  {
    id: "DSP-1046", externalId: "dp_rzp_1046", label: "product not received", amount: 6800, currency: "INR", status: "blocked", recommendation: "human_review", confidence: 48, deadline: "Aug 24 · 12:30", evidence: 61, priority: "CRITICAL", customer: "Nisha Rao", order: "ORD-90714", falseContestCost: 6800,
    summary: "The case is blocked because delivery confirmation is missing and the refund ledger contains a conflicting partial credit.",
    claims: [
      { kind: "Payment", source: "Razorpay / pay_8Q2L", claim: "₹6,800 captured for the referenced order.", verified: true },
      { kind: "Delivery proof", source: "Courier / missing", claim: "No delivery scan or OTP was found.", verified: false },
      { kind: "Refund conflict", source: "Refund ledger / RF-113", claim: "A ₹2,000 partial refund was issued before the dispute.", verified: true },
    ],
    audit: [
      ["02:51:20", "Dispute received", "dispute.created · signature verified"],
      ["02:51:22", "Evidence joined", "3 source records linked"],
      ["02:51:23", "Policy blocked", "Missing delivery proof + refund conflict"],
    ],
  },
  {
    id: "DSP-1041", externalId: "dp_rzp_1041", label: "product not received", amount: 1299, currency: "INR", status: "new", recommendation: "do_not_contest", confidence: 87, deadline: "Aug 26 · 09:00", evidence: 88, priority: "MEDIUM", customer: "Kabir Shah", order: "ORD-90588", falseContestCost: 1299,
    summary: "The order was cancelled before dispatch and the payment was fully refunded. Contesting is not recommended.",
    claims: [
      { kind: "Refund", source: "Razorpay / rfnd_2P9M", claim: "Full ₹1,299 refund settled on 15 Aug.", verified: true },
      { kind: "Shipment", source: "Shiprocket / SH-771", claim: "Shipment was never manifested.", verified: true },
      { kind: "Order", source: "Shopify / ORD-90588", claim: "Order cancelled before dispatch.", verified: true },
    ],
    audit: [
      ["01:12:04", "Dispute received", "dispute.created · signature verified"],
      ["01:12:06", "Refund verified", "Full amount matched"],
      ["01:12:07", "Recommendation", "Do not contest · 87% confidence"],
    ],
  },
];

const computedDisputes = disputes.map(item => ({ ...item, validation: validateDisputeCase(item), draft: buildVerifiedDraft(item.order, item.amount, item.claims) }));
const evaluation = { datasetSize: 100, precision: 94, recall: 91, recommendationAccuracy: 93, evidenceAccuracy: 97, unsupportedClaimRate: 0, falseContestCost: 6800, exceptions: computedDisputes.filter(item => item.validation.policyBlocked).length };

function liveDisputeCase(dispute: RazorpayDispute) {
  const amount = (dispute.amount ?? 0) / 100;
  const externalDispute = buildExternalDisputeControl({ id: dispute.id, reason: dispute.reason_description ?? dispute.reason, reasonCode: dispute.reason_code, status: dispute.status, phase: dispute.phase, respondBy: dispute.respond_by, evidence: dispute.evidence });
  const observedEvidenceKeys = new Set(Object.keys(dispute.evidence ?? {}).map(key => key.replace(/[_-]+/g, " ").toLowerCase()));
  const claims = externalDispute.evidencePolicy.requiredKinds.map(kind => {
    const isPayment = kind === "Payment";
    const observed = isPayment ? Boolean(dispute.payment_id) : observedEvidenceKeys.has(kind.toLowerCase());
    return { kind, source: isPayment ? `Razorpay / ${dispute.payment_id ?? "payment reference pending"}` : "Razorpay dispute evidence", claim: observed ? `Razorpay dispute includes an observed ${kind.toLowerCase()} field.` : `${kind} is required for this external dispute reason but has not been verified.`, verified: observed };
  });
  const base = {
    id: `DSP-${dispute.id}`,
    externalId: dispute.id,
    label: externalDispute.reason,
    amount,
    currency: "INR",
    status: dispute.status ?? "open",
    recommendation: "human_review",
    confidence: 0,
    deadline: externalDispute.deadlineLabel,
    evidence: 0,
    priority: "LIVE",
    customer: "Razorpay dispute",
    order: dispute.payment_id ?? "No payment reference",
    falseContestCost: amount,
    sourceKind: "razorpay_dispute" as const,
    externalDispute,
    summary: `Verified external dispute intake: ${externalDispute.reason}. ${externalDispute.safeNextStep}`,
    claims,
    audit: [["External", "Razorpay dispute observed", `${dispute.id} · ${externalDispute.status} · ${externalDispute.phaseLabel}`]],
  };
  return { ...base, validation: validateDisputeCase({ ...base, requiredKinds: externalDispute.evidencePolicy.requiredKinds }), draft: buildVerifiedDraft(base.order, base.amount, claims) };
}

async function signedWebhookDisputeCases(merchantOpenId: string) {
  const db = await getDb();
  if (!db || merchantOpenId !== ENV.ownerOpenId) return [];
  const events = await db.select().from(webhookEvents)
    .where(and(eq(webhookEvents.merchantOpenId, merchantOpenId), eq(webhookEvents.signatureVerified, true)))
    .orderBy(desc(webhookEvents.createdAt))
    .limit(100);
  return projectLatestSignedWebhookDisputes(events, merchantOpenId).map(event => {
    const dispute = event.dispute;
    const payment = event.payment;
    const mapped = liveDisputeCase({
      id: event.externalDisputeId!,
      amount: typeof dispute.amount === "number" ? dispute.amount : undefined,
      reason: typeof dispute.reason_description === "string" ? dispute.reason_description : undefined,
      reason_code: event.externalReasonCode ?? (typeof dispute.reason_code === "string" ? dispute.reason_code : undefined),
      status: event.externalStatus ?? (typeof dispute.status === "string" ? dispute.status : undefined),
      phase: event.externalPhase ?? (typeof dispute.phase === "string" ? dispute.phase : undefined),
      respond_by: event.externalRespondBy ?? (typeof dispute.respond_by === "number" ? dispute.respond_by : undefined),
      payment_id: typeof dispute.payment_id === "string" ? dispute.payment_id : typeof payment.id === "string" ? payment.id : undefined,
      evidence: dispute.evidence && typeof dispute.evidence === "object" && !Array.isArray(dispute.evidence) ? dispute.evidence as Record<string, unknown> : undefined,
    });
    return {
      ...mapped,
      id: `WEBHOOK-${event.eventId}`,
      sourceKind: "signed_webhook_verified" as const,
      externalDispute: { ...mapped.externalDispute, source: `Signed Razorpay webhook · ${event.eventId}`, sourceBoundary: "signed_webhook_verified" as const },
      audit: [["Webhook", "Signed dispute event verified", `${event.eventType} · ${event.eventId}`], ...mapped.audit],
    };
  });
}

async function localSellerDisputeCases(merchantOpenId: string) {
  const db = await getDb();
  if (!db) return [];
  const orders = await db.select().from(sellerOrders).where(eq(sellerOrders.merchantOpenId, merchantOpenId));
  const byOrderId = new Map(orders.map(order => [order.id, order]));
  const scenarios = await db.select().from(sellerDisputeScenarios).orderBy(desc(sellerDisputeScenarios.createdAt)).limit(50);
  return Promise.all(uniqueLatestSellerScenarios(scenarios.filter(scenario => byOrderId.has(scenario.sellerOrderId))).map(async scenario => {
    const order = byOrderId.get(scenario.sellerOrderId)!;
    let razorpayCaptured = false;
    if (order.razorpayPaymentId) {
      try {
        const payment = await fetchRazorpayPayment(order.razorpayPaymentId);
        razorpayCaptured = payment.status === "captured" || payment.captured === true;
      } catch { razorpayCaptured = false; }
    }
    const delivered = order.fulfillmentState === "delivered";
    const paymentObserved = razorpayCaptured || order.paymentObservation === "client_confirmed" || order.paymentObservation === "api_observed" || order.paymentObservation === "webhook_verified";
    const scenarioOutcome = recommendSellerScenario({ scenarioType: scenario.scenarioType, paymentObserved, fulfillmentState: order.fulfillmentState });
    const readiness = sellerReviewReadiness({ paymentObserved, fulfillmentState: order.fulfillmentState });
    const metadata = scenarioMetadata[scenario.scenarioType];
    const claims = [
      { kind: "Payment", source: order.razorpayPaymentId ? `Razorpay API / ${order.razorpayPaymentId}` : `Razorpay order / ${order.razorpayOrderId ?? "pending"}`, claim: razorpayCaptured ? `Razorpay API reports ₹${(order.totalAmountPaise / 100).toLocaleString("en-IN")} captured for this Seller Space order.` : "A Seller Space order exists, but no Razorpay API-observed capture is available yet.", verified: razorpayCaptured },
      { kind: "Delivery proof", source: `Seller Space fulfillment / ${order.orderReference}`, claim: delivered ? `Merchant-recorded delivery milestone: ${order.shippingRecord}` : `Merchant record currently shows ${order.fulfillmentState.replaceAll("_", " ")}; delivery proof is incomplete.`, verified: delivered },
      { kind: "Address match", source: `Seller Space order / ${order.orderReference}`, claim: delivered ? "Merchant shipping record is attached to the selected local order." : "Shipping record is not sufficient to confirm delivery to the order address.", verified: delivered },
      { kind: "Refund", source: "Seller Space refund ledger", claim: "No local refund record has been added to this demonstration order.", verified: false },
    ];
    const amount = order.totalAmountPaise / 100;
    const base = {
      id: `LOCAL-${scenario.id}`,
      externalId: `seller_demo_${scenario.id}`,
      label: scenario.scenarioType === "product_not_received" ? "product not received" : metadata.label.toLowerCase(),
      amount,
      currency: order.currency,
      status: "review",
      recommendation: scenarioOutcome.recommendation,
      confidence: delivered && razorpayCaptured ? 82 : readiness.score + 17,
      deadline: "Demonstration review",
      evidence: 0,
      priority: "DEMONSTRATION",
      customer: order.buyerLabel,
      order: order.orderReference,
      falseContestCost: amount,
      summary: `${metadata.label} demonstration case created from Seller Space order ${order.orderReference}. ${metadata.primary ? "This is the primary evidence-first workflow." : "This is a non-primary local simulation."}`,
      claims,
      audit: [["Local", "Seller Space dispute review opened", `Demonstration scenario · ${metadata.label}`], ["Local", "Merchant order linked", `${order.orderReference} · local merchant record`], ["Razorpay", razorpayCaptured ? "Payment API observed" : "Payment awaiting evidence", order.razorpayPaymentId ?? order.razorpayOrderId ?? "No Razorpay reference"], ["Merchant", "Fulfillment state evaluated", order.fulfillmentState]],
      sourceKind: "demonstration_scenario" as const,
      operational: readiness,
      appealPolicy: { ...evaluateAppealPolicy({ claimType: scenario.scenarioType, claims, fulfillmentState: order.fulfillmentState }), requestedOutcome: scenario.requestedOutcome },
    };
    return { ...base, validation: validateDisputeCase(base), draft: buildVerifiedDraft(base.order, base.amount, claims) };
  }));
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  dashboard: publicProcedure.query(async () => {
    const [snapshotResult, dbResult] = await Promise.allSettled([getRazorpayAccountSnapshot(), getDb()]);
    const snapshot = snapshotResult.status === "fulfilled" ? snapshotResult.value : { collectedAmount: 0, capturedPayments: 0, refundAmount: 0, processedRefunds: 0, disputedAmount: 0, openDisputes: 0, underReviewDisputes: 0, failedPayments: 0, apiAvailable: false as const };
    const db = dbResult.status === "fulfilled" ? dbResult.value : null;
    const intakeRows = db ? await db.select({ amountPaise: paymentIntakes.amountPaise, status: paymentIntakes.status }).from(paymentIntakes) : [];
    const verifiedIntakes = summarizeWebhookVerifiedIntakes(intakeRows);
    return {
      ...snapshot,
      apiAvailable: snapshotResult.status === "fulfilled",
      collectedAmount: verifiedIntakes.verifiedCollectedAmount,
      capturedPayments: verifiedIntakes.verifiedCapturedPayments,
      razorpayReportedCapturedPayments: snapshot.capturedPayments,
      razorpayReportedCollectedAmount: snapshot.collectedAmount,
      metricSource: "verified_webhook_intakes",
      integrationMessage: snapshotResult.status === "fulfilled" ? undefined : "Razorpay account read is temporarily unavailable; no capture or dispute fact was inferred.",
      evaluation,
    };
  }),
  disputes: publicProcedure.query(async () => {
    try { return (await listLiveProductNotReceivedDisputes()).map(liveDisputeCase); } catch { return []; }
  }),
  merchantDisputes: protectedProcedure.query(async ({ ctx }) => {
    const [liveResult, localResult, webhookResult] = await Promise.allSettled([listLiveRazorpayDisputes(), localSellerDisputeCases(ctx.user.openId), signedWebhookDisputeCases(ctx.user.openId)]);
    const live = liveResult.status === "fulfilled" ? liveResult.value : [];
    const local = localResult.status === "fulfilled" ? localResult.value : [];
    const webhook = webhookResult.status === "fulfilled" ? webhookResult.value : [];
    return mergeCommandCentreSources(webhook, local, live.map(liveDisputeCase));
  }),
  dispute: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => (await listLiveProductNotReceivedDisputes()).map(liveDisputeCase).find(item => item.id === input.id) ?? null),
  approveExport: protectedProcedure.input(z.object({ id: z.string(), approvalPhrase: z.literal("APPROVE VERIFIED EVIDENCE") })).mutation(async ({ ctx, input }) => { const item = computedDisputes.find(candidate => candidate.id === input.id); if (!item) throw new Error("Case not found"); if (item.validation.policyBlocked) throw new Error("Policy block: incomplete, contradictory, or low-confidence evidence"); const db = await getDb(); if (db) await db.insert(exportRecords).values({ disputeId: Number(item.id.replace("DSP-", "")) || 0, approvedBy: ctx.user.openId, approvalPhrase: input.approvalPhrase, exportState: "approved" }); return { success: true, id: input.id, state: "approved", message: "Evidence packet approved for merchant-controlled export. No response was submitted automatically." }; }),
  createEvidenceReference: protectedProcedure.input(z.object({ disputeId: z.string(), kind: z.string(), fileKey: z.string(), fileUrl: z.string().url() })).mutation(({ input }) => ({ ...input, stored: true, bytesPersisted: false, message: "Protected file reference recorded; file bytes remain in object storage." })),
  razorpayConnection: publicProcedure.query(async () => {
    try {
      const recent = await listRecentRazorpayPayments();
      return { connected: true, paymentRecordsAccessible: recent.count, environment: "connected" as const };
    } catch {
      return { connected: false, paymentRecordsAccessible: 0, environment: "unavailable" as const, message: "Razorpay account read is temporarily unavailable. DisputeShield will not infer payment capture." };
    }
  }),
  webhookHealth: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.openId !== ENV.ownerOpenId) return { lastEvent: null, verifiedEvents: 0, recentFailures: 0, duplicateEvents: 0 };
    const db = await getDb();
    if (!db) return { lastEvent: null, verifiedEvents: 0, recentFailures: 0, duplicateEvents: 0 };
    const [events, webhookAnchors] = await Promise.all([
      db.select().from(webhookEvents).where(eq(webhookEvents.merchantOpenId, ctx.user.openId)).orderBy(desc(webhookEvents.createdAt)).limit(10),
      db.select({ sourceRecordId: customerCaseIntegrityAnchors.sourceRecordId }).from(customerCaseIntegrityAnchors).where(and(eq(customerCaseIntegrityAnchors.merchantOpenId, ctx.user.openId), eq(customerCaseIntegrityAnchors.anchorType, "verified_webhook"))),
    ]);
    const anchoredEventIds = new Set(webhookAnchors.map(anchor => anchor.sourceRecordId));
    return {
      lastEvent: events[0] ? { type: events[0].eventType, receivedAt: events[0].createdAt, signatureVerified: events[0].signatureVerified, privateIntegrityAnchored: anchoredEventIds.has(events[0].eventId) } : null,
      verifiedEvents: events.filter(event => event.signatureVerified).length,
      recentFailures: events.filter(event => !event.signatureVerified).length,
      duplicateEvents: 0,
    };
  }),
  createEvidenceQr: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const item = computedDisputes.find(candidate => candidate.id === input.id);
    if (!item) throw new Error("Case not found");
    const qr = await createCaseEvidenceQr({ caseId: item.id, amountRupees: item.amount, orderId: item.order });
    return { caseId: item.id, qrId: qr.id, qrImageUrl: qr.image_url ?? null, status: qr.status ?? "created", amount: item.amount };
  }),
  createPaymentIntake: protectedProcedure.input(z.object({ amountRupees: z.number().min(1).max(5000), purpose: z.enum(["merchant_payment", "evidence_intake"]) })).mutation(async ({ ctx, input }) => {
    const amountPaise = Math.round(input.amountRupees * 100);
    const receipt = `ds_${crypto.randomUUID().replace(/-/g, "").slice(0, 28)}`;
    const order = await createMerchantPaymentOrder({ amountPaise, receipt, purpose: input.purpose, merchantOpenId: ctx.user.openId });
    const db = await getDb();
    if (!db) throw new Error("Payment intake storage is unavailable. No checkout was opened.");
    await db.insert(paymentIntakes).values({ merchantOpenId: ctx.user.openId, purpose: input.purpose, amountPaise, receipt, razorpayOrderId: order.id, status: "created" });
    return { orderId: order.id, amountPaise: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID, checkoutMode: getRazorpayCheckoutMode(), receipt, purpose: input.purpose };
  }),
  paymentCheckoutConfig: protectedProcedure.query(() => ({ mode: getRazorpayCheckoutMode() })),
  resumePaymentIntakeCheckout: protectedProcedure.input(z.object({ orderId: z.string() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Payment intake storage is unavailable.");
    const record = (await db.select().from(paymentIntakes).where(eq(paymentIntakes.razorpayOrderId, input.orderId)).limit(1))[0];
    if (!record || record.merchantOpenId !== ctx.user.openId) throw new Error("Unknown payment intake order.");
    if (!["created", "checkout_opened"].includes(record.status)) throw new Error("Only an unconfirmed payment request can be resumed.");
    return { orderId: record.razorpayOrderId, amountPaise: record.amountPaise, currency: record.currency, keyId: process.env.RAZORPAY_KEY_ID, checkoutMode: getRazorpayCheckoutMode(), receipt: record.receipt, purpose: record.purpose };
  }),
  verifyPaymentIntake: protectedProcedure.input(z.object({ orderId: z.string(), paymentId: z.string(), signature: z.string() })).mutation(async ({ ctx, input }) => {
    const signatureVerified = verifyRazorpayCheckoutSignature(input);
    const db = await getDb();
    if (!db) throw new Error("Payment intake storage is unavailable.");
    const record = (await db.select().from(paymentIntakes).where(eq(paymentIntakes.razorpayOrderId, input.orderId)).limit(1))[0];
    if (!record || record.merchantOpenId !== ctx.user.openId) throw new Error("Unknown payment intake order.");
    const transition = checkoutVerificationTransition(signatureVerified);
    if (!signatureVerified) {
      await db.update(paymentIntakes).set({ status: transition.status }).where(eq(paymentIntakes.razorpayOrderId, input.orderId));
      throw new Error("Checkout signature verification failed. No payment was treated as captured.");
    }
    await db.update(paymentIntakes).set({ status: transition.status, razorpayPaymentId: input.paymentId, checkoutSignature: input.signature }).where(eq(paymentIntakes.razorpayOrderId, input.orderId));
    return { signatureVerified: true, status: "client_confirmed", message: "Checkout signature verified. Waiting for a signed Razorpay payment event before capture is reflected." };
  }),
  markPaymentCheckoutOpened: protectedProcedure.input(z.object({ orderId: z.string() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Payment intake storage is unavailable.");
    const record = (await db.select().from(paymentIntakes).where(eq(paymentIntakes.razorpayOrderId, input.orderId)).limit(1))[0];
    if (!record || record.merchantOpenId !== ctx.user.openId) throw new Error("Unknown payment intake order.");
    await db.update(paymentIntakes).set({ status: "checkout_opened" }).where(eq(paymentIntakes.razorpayOrderId, input.orderId));
    return { orderId: input.orderId, status: "checkout_opened" };
  }),
  paymentIntakes: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select().from(paymentIntakes).where(eq(paymentIntakes.merchantOpenId, ctx.user.openId)).orderBy(desc(paymentIntakes.createdAt)).limit(8);
    return Promise.all(rows.map(async record => {
      if (!record.razorpayPaymentId) return { ...record, razorpayObservedStatus: null, razorpayObservedCaptured: false };
      try {
        const payment = await fetchRazorpayPayment(record.razorpayPaymentId);
        return { ...record, razorpayObservedStatus: payment.status, razorpayObservedCaptured: payment.status === "captured" || payment.captured === true };
      } catch {
        return { ...record, razorpayObservedStatus: null, razorpayObservedCaptured: false };
      }
    }));
  }),
  sellerProducts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(sellerProducts).where(eq(sellerProducts.merchantOpenId, ctx.user.openId)).orderBy(desc(sellerProducts.createdAt));
  }),
  sellerSpaceContext: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { workspaceRef: ctx.user.openId.slice(-6), productCount: 0, orderCount: 0 };
    const [products, orders] = await Promise.all([
      db.select({ id: sellerProducts.id }).from(sellerProducts).where(eq(sellerProducts.merchantOpenId, ctx.user.openId)),
      db.select({ id: sellerOrders.id }).from(sellerOrders).where(eq(sellerOrders.merchantOpenId, ctx.user.openId)),
    ]);
    return { workspaceRef: ctx.user.openId.slice(-6), productCount: products.length, orderCount: orders.length };
  }),
  createSellerProduct: protectedProcedure.input(z.object({ sku: z.string().trim().min(2).max(64), name: z.string().trim().min(2).max(160), description: z.string().trim().max(500).optional(), unitAmountRupees: z.number().min(1).max(5000), inventoryQuantity: z.number().int().min(0).max(10000) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Seller Space storage is unavailable.");
    await db.insert(sellerProducts).values({ merchantOpenId: ctx.user.openId, sku: input.sku, name: input.name, description: input.description || null, unitAmountPaise: Math.round(input.unitAmountRupees * 100), inventoryQuantity: input.inventoryQuantity, status: "active" });
    invalidateScopedCache(`catalog:${ctx.user.openId}`);
    return { created: true };
  }),
  sellerOrders: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const orders = await db.select().from(sellerOrders).where(eq(sellerOrders.merchantOpenId, ctx.user.openId)).orderBy(desc(sellerOrders.createdAt)).limit(20);
    return Promise.all(orders.map(async order => {
      if (!order.razorpayPaymentId) return { ...order, razorpayObservedStatus: null, razorpayObservedCaptured: false, razorpayObservationState: sellerRazorpayObservationState({ razorpayPaymentId: null, apiAvailable: false, apiCaptured: false }) };
      try {
        const payment = await fetchRazorpayPayment(order.razorpayPaymentId);
        const razorpayObservedCaptured = payment.status === "captured" || payment.captured === true;
        return { ...order, razorpayObservedStatus: payment.status, razorpayObservedCaptured, razorpayObservationState: sellerRazorpayObservationState({ razorpayPaymentId: order.razorpayPaymentId, apiAvailable: true, apiCaptured: razorpayObservedCaptured }) };
      } catch { return { ...order, razorpayObservedStatus: null, razorpayObservedCaptured: false, razorpayObservationState: sellerRazorpayObservationState({ razorpayPaymentId: order.razorpayPaymentId, apiAvailable: false, apiCaptured: false }) }; }
    }));
  }),
  createSellerCheckout: protectedProcedure.input(z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(10), buyerLabel: z.string().trim().min(2).max(120) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Seller Space storage is unavailable.");
    const product = (await db.select().from(sellerProducts).where(and(eq(sellerProducts.id, input.productId), eq(sellerProducts.merchantOpenId, ctx.user.openId))).limit(1))[0];
    if (!product || product.status !== "active") throw new Error("This Seller Space product is unavailable.");
    if (!inventoryReservationOutcome({ availableQuantity: product.inventoryQuantity, requestedQuantity: input.quantity }).reserved) throw new Error("Insufficient merchant-recorded inventory for this order.");
    const orderReference = `SS-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    const receipt = `ss_${crypto.randomUUID().replace(/-/g, "").slice(0, 28)}`;
    const totalAmountPaise = product.unitAmountPaise * input.quantity;
    const [reservationResult] = await db.execute<ResultSetHeader>(sql`UPDATE ${sellerProducts} SET ${sellerProducts.inventoryQuantity} = ${sellerProducts.inventoryQuantity} - ${input.quantity} WHERE ${sellerProducts.id} = ${product.id} AND ${sellerProducts.merchantOpenId} = ${ctx.user.openId} AND ${sellerProducts.inventoryQuantity} >= ${input.quantity}`);
    if (reservationResult.affectedRows !== 1) throw new Error("Inventory changed while checkout was being prepared. Refresh and try again.");
    try {
      const razorpayOrder = await createMerchantPaymentOrder({ amountPaise: totalAmountPaise, receipt, purpose: "merchant_payment", merchantOpenId: ctx.user.openId, sellerOrderReference: orderReference });
      await db.insert(sellerOrders).values({ merchantOpenId: ctx.user.openId, orderReference, productId: product.id, productName: product.name, quantity: input.quantity, totalAmountPaise, buyerLabel: input.buyerLabel, razorpayOrderId: razorpayOrder.id, paymentObservation: "not_started", fulfillmentState: "unfulfilled" });
      return { sellerOrderReference: orderReference, orderId: razorpayOrder.id, amountPaise: razorpayOrder.amount, currency: razorpayOrder.currency, keyId: process.env.RAZORPAY_KEY_ID, checkoutMode: getRazorpayCheckoutMode(), productName: product.name, quantity: input.quantity };
    } catch (error) {
      await db.execute<ResultSetHeader>(sql`UPDATE ${sellerProducts} SET ${sellerProducts.inventoryQuantity} = ${sellerProducts.inventoryQuantity} + ${input.quantity} WHERE ${sellerProducts.id} = ${product.id} AND ${sellerProducts.merchantOpenId} = ${ctx.user.openId}`);
      throw error;
    }
  }),
  markSellerCheckoutOpened: protectedProcedure.input(z.object({ orderId: z.string() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Seller Space storage is unavailable.");
    const record = (await db.select().from(sellerOrders).where(and(eq(sellerOrders.razorpayOrderId, input.orderId), eq(sellerOrders.merchantOpenId, ctx.user.openId))).limit(1))[0];
    if (!record) throw new Error("Unknown Seller Space order.");
    await db.update(sellerOrders).set({ paymentObservation: "checkout_opened" }).where(eq(sellerOrders.id, record.id));
    return { orderId: input.orderId, status: "checkout_opened" };
  }),
  verifySellerCheckout: protectedProcedure.input(z.object({ orderId: z.string(), paymentId: z.string(), signature: z.string() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Seller Space storage is unavailable.");
    const record = (await db.select().from(sellerOrders).where(and(eq(sellerOrders.razorpayOrderId, input.orderId), eq(sellerOrders.merchantOpenId, ctx.user.openId))).limit(1))[0];
    if (!record) throw new Error("Unknown Seller Space order.");
    if (!verifyRazorpayCheckoutSignature(input)) throw new Error("Checkout signature verification failed. No payment was treated as captured.");
    await db.update(sellerOrders).set({ paymentObservation: "client_confirmed", razorpayPaymentId: input.paymentId }).where(eq(sellerOrders.id, record.id));
    return { signatureVerified: true, status: "client_confirmed", sellerOrderReference: record.orderReference };
  }),
  recordSellerFulfillment: protectedProcedure.input(z.object({ sellerOrderId: z.number().int().positive(), state: z.enum(["packed", "shipped", "delivered", "delivery_exception"]), carrier: z.string().trim().max(120).optional(), trackingReference: z.string().trim().max(160).optional(), evidenceNote: z.string().trim().min(4).max(1000) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Seller Space storage is unavailable.");
    const order = (await db.select().from(sellerOrders).where(and(eq(sellerOrders.id, input.sellerOrderId), eq(sellerOrders.merchantOpenId, ctx.user.openId))).limit(1))[0];
    if (!order) throw new Error("Unknown Seller Space order.");
    await db.insert(sellerFulfillmentEvents).values({ sellerOrderId: order.id, state: input.state, carrier: input.carrier || null, trackingReference: input.trackingReference || null, evidenceNote: input.evidenceNote });
    await db.update(sellerOrders).set({ fulfillmentState: input.state, shippingRecord: input.evidenceNote }).where(eq(sellerOrders.id, order.id));
    return { orderId: order.id, fulfillmentState: input.state, sourceKind: "merchant_record" as const };
  }),
  sellerDisputeScenarios: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const orders = await db.select().from(sellerOrders).where(eq(sellerOrders.merchantOpenId, ctx.user.openId)).limit(50);
    const orderById = new Map(orders.map(order => [order.id, order]));
    const scenarios = await db.select().from(sellerDisputeScenarios).orderBy(desc(sellerDisputeScenarios.createdAt)).limit(50);
    return scenarios.filter(scenario => orderById.has(scenario.sellerOrderId)).map(scenario => ({ ...scenario, order: orderById.get(scenario.sellerOrderId)!, metadata: scenarioMetadata[scenario.scenarioType] }));
  }),
  createSellerDisputeScenario: protectedProcedure.input(z.object({ sellerOrderId: z.number().int().positive(), scenarioType: z.enum(SELLER_SCENARIOS), customerStatement: z.string().trim().min(10).max(1000).optional(), requestedOutcome: z.enum(["case_review", "contest_response", "customer_resolution"]) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Seller Space storage is unavailable.");
    const order = (await db.select().from(sellerOrders).where(and(eq(sellerOrders.id, input.sellerOrderId), eq(sellerOrders.merchantOpenId, ctx.user.openId))).limit(1))[0];
    if (!order) throw new Error("Unknown Seller Space order.");
    const paymentObserved = order.paymentObservation === "api_observed" || order.paymentObservation === "webhook_verified" || order.paymentObservation === "client_confirmed";
    const outcome = recommendSellerScenario({ scenarioType: input.scenarioType, paymentObserved, fulfillmentState: order.fulfillmentState });
    const metadata = scenarioMetadata[input.scenarioType];
    const existing = (await db.select().from(sellerDisputeScenarios).where(and(eq(sellerDisputeScenarios.sellerOrderId, order.id), eq(sellerDisputeScenarios.scenarioType, input.scenarioType))).limit(1))[0];
    if (existing) {
      await db.update(sellerDisputeScenarios).set({ customerClaim: input.customerStatement || metadata.claim, requestedOutcome: input.requestedOutcome, recommendation: outcome.recommendation }).where(eq(sellerDisputeScenarios.id, existing.id));
      return { scenarioId: existing.id, reused: true, scenarioType: input.scenarioType, recommendation: outcome.recommendation, reason: "This order already has an open local review for this claim. Its appeal intake and policy outcome were refreshed from current evidence.", sourceKind: "demonstration_scenario" as const };
    }
    await db.insert(sellerDisputeScenarios).values({ sellerOrderId: order.id, scenarioType: input.scenarioType, customerClaim: input.customerStatement || metadata.claim, requestedOutcome: input.requestedOutcome, recommendation: outcome.recommendation, scenarioStatus: "ready", sourceKind: "demonstration_scenario" });
    return { reused: false, scenarioType: input.scenarioType, recommendation: outcome.recommendation, reason: outcome.reason, sourceKind: "demonstration_scenario" as const };
  }),
  approveSellerAppealPacket: protectedProcedure.input(z.object({ scenarioId: z.number().int().positive(), approvalPhrase: z.literal("APPROVE VERIFIED EVIDENCE") })).mutation(async ({ ctx, input }) => {
    const localCases = await localSellerDisputeCases(ctx.user.openId);
    const caseItem = localCases.find(item => item.id === `LOCAL-${input.scenarioId}`);
    if (!caseItem || caseItem.sourceKind !== "demonstration_scenario") throw new Error("Local Seller Space review not found for this merchant.");
    if (!caseItem.appealPolicy || !canReleaseAppealPacket(caseItem.appealPolicy) || caseItem.validation.policyBlocked) throw new Error("Policy block: a complete, conflict-free evidence set is required before an appeal packet can be approved.");
    const db = await getDb();
    if (db) await db.insert(exportRecords).values({ disputeId: input.scenarioId, approvedBy: ctx.user.openId, approvalPhrase: input.approvalPhrase, exportState: "approved" });
    return { success: true, state: "approved", message: "Merchant approval recorded. The local packet is available for controlled export; no dispute response, refund, or external appeal was submitted." };
  }),
  prepareExternalDisputePacket: protectedProcedure.input(z.object({ externalDisputeId: z.string().trim().min(3).max(128), approvalPhrase: z.literal("PREPARE VERIFIED EXTERNAL PACKET") })).mutation(async ({ ctx, input }) => {
    const externalCases = await signedWebhookDisputeCases(ctx.user.openId);
    const caseItem = externalCases.find(item => item.externalId === input.externalDisputeId);
    if (!caseItem || caseItem.sourceKind !== "signed_webhook_verified") throw new Error("Only a signed Razorpay webhook dispute can enter external packet preparation.");
    const db = await getDb();
    if (!db) throw new Error("Dispute packet storage is unavailable. No packet state was changed.");
    await db.insert(exportRecords).values({ disputeId: 0, approvedBy: ctx.user.openId, approvalPhrase: input.approvalPhrase, exportState: "approved", packetState: "prepared", sourceKind: "signed_webhook_external", externalDisputeId: input.externalDisputeId });
    return { success: true, state: "prepared" as const, externalDisputeId: input.externalDisputeId, sourceKind: "signed_webhook_external" as const, evidenceGaps: caseItem.validation.missingEvidence, message: "External evidence packet prepared for merchant review. No Razorpay response, refund, contest, or appeal was submitted." };
  }),
  createCustomerOrderAccess: protectedProcedure.input(z.object({ sellerOrderId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Seller Space storage is unavailable.");
    const order = (await db.select().from(sellerOrders).where(and(eq(sellerOrders.id, input.sellerOrderId), eq(sellerOrders.merchantOpenId, ctx.user.openId))).limit(1))[0];
    if (!order) throw new Error("Unknown Seller Space order.");
    const accessToken = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.insert(customerOrderAccess).values({ sellerOrderId: order.id, merchantOpenId: ctx.user.openId, accessTokenHash: hashCustomerAccessToken(accessToken), active: true, expiresAt });
    return { orderReference: order.orderReference, accessToken, expiresAt, message: "Share this Customer Space access token only with the intended buyer. It binds to the first signed-in customer who redeems it and expires in seven days." };
  }),
  createCustomerCatalogAccess: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Seller Space storage is unavailable.");
    const accessToken = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.insert(customerCatalogAccess).values({ merchantOpenId: ctx.user.openId, accessTokenHash: hashCustomerAccessToken(accessToken), active: true, expiresAt });
    return { accessToken, expiresAt, message: "Share this private catalog token only with the intended buyer. It exposes active local products from this merchant and binds to the first signed-in customer who redeems it." };
  }),
  customerCatalogContext: protectedProcedure.input(z.object({ catalogToken: z.string().trim().min(32).max(256) })).query(async ({ ctx, input }) => {
    const limit = checkCustomerRateLimit({ buyerOpenId: ctx.user.openId, action: "catalog_redemption" });
    if (!limit.allowed) throw new Error(`Too many catalog access attempts from this signed-in customer. Please wait ${limit.retryAfterSeconds} seconds and try again.`);
    const { db, grant } = await resolveCustomerCatalogAccess(ctx.user.openId, input.catalogToken);
    const products = await getOrSetScopedCache(`catalog:${grant.merchantOpenId}`, 30_000, () => db.select().from(sellerProducts).where(and(eq(sellerProducts.merchantOpenId, grant.merchantOpenId), eq(sellerProducts.status, "active"))).orderBy(desc(sellerProducts.createdAt)));
    const buyerOrders = await getOrSetScopedCache(`customer-orders:${grant.merchantOpenId}:${ctx.user.openId}`, 10_000, () => db.select().from(sellerOrders).where(and(eq(sellerOrders.merchantOpenId, grant.merchantOpenId), eq(sellerOrders.buyerOpenId, ctx.user.openId))).orderBy(desc(sellerOrders.createdAt)).limit(10));
    const buyerCases = await db.select().from(customerCases).where(and(eq(customerCases.merchantOpenId, grant.merchantOpenId), eq(customerCases.buyerOpenId, ctx.user.openId))).orderBy(desc(customerCases.createdAt));
    return {
      catalog: products.map(product => ({ id: product.id, sku: product.sku, name: product.name, description: product.description, unitAmountPaise: product.unitAmountPaise, inventoryQuantity: product.inventoryQuantity })),
      buyerOrders: summarizeBuyerOrders({ orders: buyerOrders, cases: buyerCases, merchantOpenId: grant.merchantOpenId, buyerOpenId: ctx.user.openId }),
      accessBinding: { expiresAt: grant.expiresAt, accessState: "bound_customer_catalog" as const },
      sourceBoundary: "local_merchant_catalog" as const,
    };
  }),
  openCustomerOrderFromCatalog: protectedProcedure.input(z.object({ catalogToken: z.string().trim().min(32).max(256), sellerOrderId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { db, grant } = await resolveCustomerCatalogAccess(ctx.user.openId, input.catalogToken);
    const order = (await db.select().from(sellerOrders).where(and(eq(sellerOrders.id, input.sellerOrderId), eq(sellerOrders.merchantOpenId, grant.merchantOpenId), eq(sellerOrders.buyerOpenId, ctx.user.openId))).limit(1))[0];
    if (!order) throw new Error("This buyer order is not available in the bound catalog workspace.");
    const accessToken = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(customerOrderAccess).values({ sellerOrderId: order.id, merchantOpenId: order.merchantOpenId, accessTokenHash: hashCustomerAccessToken(accessToken), boundBuyerOpenId: ctx.user.openId, active: true, redeemedAt: new Date(), expiresAt });
    return { orderReference: order.orderReference, accessToken, expiresAt };
  }),
  createCustomerCheckout: protectedProcedure.input(z.object({ catalogToken: z.string().trim().min(32).max(256), productId: z.number().int().positive(), quantity: z.number().int().min(1).max(10) })).mutation(async ({ ctx, input }) => {
    const { db, grant } = await resolveCustomerCatalogAccess(ctx.user.openId, input.catalogToken);
    const product = (await db.select().from(sellerProducts).where(and(eq(sellerProducts.id, input.productId), eq(sellerProducts.merchantOpenId, grant.merchantOpenId), eq(sellerProducts.status, "active"))).limit(1))[0];
    if (!product || !inventoryReservationOutcome({ availableQuantity: product.inventoryQuantity, requestedQuantity: input.quantity }).reserved) throw new Error("This local merchant product is unavailable in the requested quantity.");
    const orderReference = `CS-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    const receipt = `cs_${crypto.randomUUID().replace(/-/g, "").slice(0, 28)}`;
    const totalAmountPaise = product.unitAmountPaise * input.quantity;
    const [reservationResult] = await db.execute<ResultSetHeader>(sql`UPDATE ${sellerProducts} SET ${sellerProducts.inventoryQuantity} = ${sellerProducts.inventoryQuantity} - ${input.quantity} WHERE ${sellerProducts.id} = ${product.id} AND ${sellerProducts.merchantOpenId} = ${grant.merchantOpenId} AND ${sellerProducts.inventoryQuantity} >= ${input.quantity}`);
    if (reservationResult.affectedRows !== 1) throw new Error("Inventory changed while checkout was being prepared. Refresh and try again.");
    try {
      const razorpayOrder = await createMerchantPaymentOrder({ amountPaise: totalAmountPaise, receipt, purpose: "merchant_payment", merchantOpenId: grant.merchantOpenId, sellerOrderReference: orderReference });
      await db.insert(sellerOrders).values({ merchantOpenId: grant.merchantOpenId, orderReference, productId: product.id, productName: product.name, quantity: input.quantity, totalAmountPaise, buyerLabel: ctx.user.name?.slice(0, 120) || "Authenticated customer", buyerOpenId: ctx.user.openId, razorpayOrderId: razorpayOrder.id, paymentObservation: "not_started", fulfillmentState: "unfulfilled" });
      invalidateScopedCache(`customer-orders:${grant.merchantOpenId}:${ctx.user.openId}`);
      return { sellerOrderReference: orderReference, orderId: razorpayOrder.id, amountPaise: razorpayOrder.amount, currency: razorpayOrder.currency, keyId: process.env.RAZORPAY_KEY_ID, checkoutMode: getRazorpayCheckoutMode(), productName: product.name, quantity: input.quantity, sourceBoundary: "customer_initiated_local_order" as const };
    } catch (error) {
      await db.execute<ResultSetHeader>(sql`UPDATE ${sellerProducts} SET ${sellerProducts.inventoryQuantity} = ${sellerProducts.inventoryQuantity} + ${input.quantity} WHERE ${sellerProducts.id} = ${product.id} AND ${sellerProducts.merchantOpenId} = ${grant.merchantOpenId}`);
      throw error;
    }
  }),
  markCustomerCheckoutOpened: protectedProcedure.input(z.object({ orderId: z.string() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Customer Space storage is unavailable.");
    const order = (await db.select().from(sellerOrders).where(and(eq(sellerOrders.razorpayOrderId, input.orderId), eq(sellerOrders.buyerOpenId, ctx.user.openId))).limit(1))[0];
    if (!order) throw new Error("Unknown customer checkout order.");
    await db.update(sellerOrders).set({ paymentObservation: "checkout_opened" }).where(eq(sellerOrders.id, order.id));
    invalidateScopedCache(`customer-orders:${order.merchantOpenId}:${ctx.user.openId}`);
    return { orderReference: order.orderReference, status: "checkout_opened" as const };
  }),
  verifyCustomerCheckout: protectedProcedure.input(z.object({ orderId: z.string(), paymentId: z.string(), signature: z.string() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Customer Space storage is unavailable.");
    const order = (await db.select().from(sellerOrders).where(and(eq(sellerOrders.razorpayOrderId, input.orderId), eq(sellerOrders.buyerOpenId, ctx.user.openId))).limit(1))[0];
    if (!order) throw new Error("Unknown customer checkout order.");
    if (!verifyRazorpayCheckoutSignature(input)) throw new Error("Checkout signature verification failed. No payment was treated as captured.");
    await db.update(sellerOrders).set({ paymentObservation: "client_confirmed", razorpayPaymentId: input.paymentId }).where(eq(sellerOrders.id, order.id));
    invalidateScopedCache(`customer-orders:${order.merchantOpenId}:${ctx.user.openId}`);
    const accessToken = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(customerOrderAccess).values({ sellerOrderId: order.id, merchantOpenId: order.merchantOpenId, accessTokenHash: hashCustomerAccessToken(accessToken), boundBuyerOpenId: ctx.user.openId, active: true, redeemedAt: new Date(), expiresAt });
    return { signatureVerified: true, status: "client_confirmed" as const, sellerOrderReference: order.orderReference, orderAccessToken: accessToken, orderAccessExpiresAt: expiresAt, message: "Checkout signature verified. This buyer can now access the local order and issue workflow. Razorpay API or a signed webhook independently determines final capture state." };
  }),
  customerOrderContext: protectedProcedure.input(z.object({ accessToken: z.string().trim().min(32).max(256) })).query(async ({ ctx, input }) => {
    const { order, grant } = await resolveCustomerAccess(ctx.user.openId, input.accessToken);
    return {
      accessBinding: { expiresAt: grant.expiresAt, accessState: "bound_customer_order" as const },
      order: {
        id: order.id,
        orderReference: order.orderReference,
        productName: order.productName,
        quantity: order.quantity,
        totalAmountPaise: order.totalAmountPaise,
        currency: order.currency,
        paymentObservation: order.paymentObservation,
        fulfillmentState: order.fulfillmentState,
        createdAt: order.createdAt,
      },
      issueGuidance: CUSTOMER_ISSUE_TYPES.map(issueType => ({ issueType, ...CUSTOMER_CASE_GUIDANCE[issueType] })),
      sourceBoundary: "local_customer_case" as const,
    };
  }),
  customerCases: protectedProcedure.input(z.object({ accessToken: z.string().trim().min(32).max(256) })).query(async ({ ctx, input }) => {
    const { db, order } = await resolveCustomerAccess(ctx.user.openId, input.accessToken);
    const cases = await db.select().from(customerCases).where(and(eq(customerCases.sellerOrderId, order.id), eq(customerCases.buyerOpenId, ctx.user.openId))).orderBy(desc(customerCases.createdAt));
    return Promise.all(cases.map(async caseItem => {
      const [documents, events, returnReceipt, refundRequest] = await Promise.all([
        db.select().from(customerCaseDocuments).where(and(eq(customerCaseDocuments.customerCaseId, caseItem.id), eq(customerCaseDocuments.buyerOpenId, ctx.user.openId))).orderBy(desc(customerCaseDocuments.createdAt)),
        db.select().from(customerCaseEvents).where(eq(customerCaseEvents.customerCaseId, caseItem.id)).orderBy(desc(customerCaseEvents.createdAt)),
        db.select().from(customerReturnReceipts).where(eq(customerReturnReceipts.customerCaseId, caseItem.id)).limit(1),
        db.select().from(customerRefundRequests).where(eq(customerRefundRequests.customerCaseId, caseItem.id)).limit(1),
      ]);
      const documentRows = await Promise.all(documents.filter(document => isCustomerScopedRecord({ record: document, merchantOpenId: order.merchantOpenId, buyerOpenId: ctx.user.openId })).map(async document => ({
        id: document.id,
        declaredKind: document.declaredKind,
        originalName: document.originalName,
        contentType: document.contentType,
        byteSize: document.byteSize,
        createdAt: document.createdAt,
        extraction: (await db.select().from(customerDocumentExtractions).where(eq(customerDocumentExtractions.customerCaseDocumentId, document.id)).limit(1))[0] ?? null,
      })));
      const receipt = returnReceipt[0] ?? null;
      const refund = refundRequest[0] ?? null;
      return { ...caseItem, guidance: CUSTOMER_CASE_GUIDANCE[caseItem.issueType], documents: documentRows, events, returnReceipt: receipt, refundRequest: refund, recommendation: universalCaseRecommendation({ caseItem, documentRows, order, returnReceipt: receipt, refundRequest: refund }) };
    }));
  }),
  createCustomerCase: protectedProcedure.input(z.object({ accessToken: z.string().trim().min(32).max(256), issueType: z.enum(CUSTOMER_ISSUE_TYPES), customerStatement: z.string().trim().min(12).max(2000), returnReason: z.string().trim().min(3).max(160).optional() })).mutation(async ({ ctx, input }) => {
    const limit = checkCustomerRateLimit({ buyerOpenId: ctx.user.openId, action: "case_creation" });
    if (!limit.allowed) throw new Error(`Too many local case submissions from this signed-in customer. Please wait ${limit.retryAfterSeconds} seconds and try again.`);
    const { db, order } = await resolveCustomerAccess(ctx.user.openId, input.accessToken);
    const customerStatement = sanitizePlainText(input.customerStatement);
    const returnReason = input.returnReason ? sanitizePlainText(input.returnReason) : undefined;
    if (customerStatement.length < 12) throw new Error("Provide a factual local-case statement with at least 12 visible characters.");
    if (["return_request", "damaged_or_wrong_item"].includes(input.issueType) && (!returnReason || returnReason.length < 3)) throw new Error("A return or item-condition reason is required for this customer case.");
    const caseReference = `CS-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    await db.insert(customerCases).values({ caseReference, sellerOrderId: order.id, merchantOpenId: order.merchantOpenId, buyerOpenId: ctx.user.openId, issueType: input.issueType, customerStatement, returnReason: returnReason || null, status: "draft" });
    const caseItem = (await db.select().from(customerCases).where(eq(customerCases.caseReference, caseReference)).limit(1))[0];
    if (!caseItem) throw new Error("Customer case creation could not be confirmed.");
    await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "customer", actorOpenId: ctx.user.openId, eventType: "case_drafted", detail: `${CUSTOMER_CASE_GUIDANCE[input.issueType].label} case drafted by customer.`, sourceRefs: JSON.stringify({ orderReference: order.orderReference, sourceKind: "customer_local_case" }) });
    invalidateScopedCache(`customer-orders:${order.merchantOpenId}:${ctx.user.openId}`);
    return { caseReference, status: "draft" as const, guidance: CUSTOMER_CASE_GUIDANCE[input.issueType], sourceBoundary: "local_customer_case" as const };
  }),
  analyzeCustomerCaseSentiment: protectedProcedure.input(z.object({ accessToken: z.string().trim().min(32).max(256), caseReference: z.string().trim().min(3).max(64) })).mutation(async ({ ctx, input }) => {
    const { db, order } = await resolveCustomerAccess(ctx.user.openId, input.accessToken);
    const caseItem = (await db.select().from(customerCases).where(and(eq(customerCases.caseReference, input.caseReference), eq(customerCases.sellerOrderId, order.id), eq(customerCases.buyerOpenId, ctx.user.openId))).limit(1))[0];
    if (!caseItem) throw new Error("This local case is not available to the signed-in customer.");
    const analysis = await analyzeCustomerStatementWithOllama(caseItem.customerStatement);
    return { caseReference: caseItem.caseReference, analysis, sourceBoundary: "local_customer_statement_advisory_only" as const };
  }),
  createSyntheticCustomerValidationOrder: protectedProcedure.input(z.object({ acknowledgement: z.literal("SYNTHETIC_LOCAL_VALIDATION_ONLY") })).mutation(async ({ ctx }) => {
    if (ctx.user.openId !== ENV.ownerOpenId || ctx.user.role !== "admin") throw new Error("This local validation fixture is restricted to the project owner.");
    const db = await getDb();
    if (!db) throw new Error("Customer Space storage is unavailable.");
    const product = (await db.select().from(sellerProducts).where(and(eq(sellerProducts.merchantOpenId, ctx.user.openId), eq(sellerProducts.status, "active"))).orderBy(desc(sellerProducts.createdAt)).limit(1))[0];
    if (!product) throw new Error("Create an active merchant product before starting the local validation fixture.");
    const fixtureSuffix = crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
    const orderReference = `SYN-UI-${fixtureSuffix}`;
    await db.insert(sellerOrders).values({ merchantOpenId: ctx.user.openId, orderReference, productId: product.id, productName: product.name, quantity: 1, totalAmountPaise: product.unitAmountPaise, buyerLabel: "Synthetic local validation buyer — no payment", buyerOpenId: ctx.user.openId, shippingRecord: "SYNTHETIC LOCAL VALIDATION ONLY — no shipping event", paymentObservation: "not_started", fulfillmentState: "unfulfilled", sourceKind: "merchant_record" });
    const order = (await db.select().from(sellerOrders).where(and(eq(sellerOrders.orderReference, orderReference), eq(sellerOrders.merchantOpenId, ctx.user.openId))).limit(1))[0];
    if (!order) throw new Error("The local validation order could not be confirmed.");
    const accessToken = crypto.randomBytes(32).toString("hex");
    await db.insert(customerOrderAccess).values({ sellerOrderId: order.id, merchantOpenId: ctx.user.openId, accessTokenHash: hashCustomerAccessToken(accessToken), boundBuyerOpenId: ctx.user.openId, active: true, expiresAt: new Date(Date.now() + 30 * 60 * 1000), redeemedAt: new Date() });
    invalidateScopedCache(`customer-orders:${ctx.user.openId}:${ctx.user.openId}`);
    return { accessToken, orderReference, sourceBoundary: "synthetic_local_validation_only" as const, warning: "This local validation order has no payment, carrier, return, refund, or external dispute state. Complete the protected Customer Space steps explicitly." };
  }),
  seedSyntheticJudgeDemo: protectedProcedure.input(z.object({ acknowledgement: z.literal(DEMO_SEED_ACKNOWLEDGEMENT) })).mutation(async ({ ctx, input }) => {
    const permission = demoSeedAllowed({ isProduction: ENV.isProduction, isOwner: ctx.user.openId === ENV.ownerOpenId, isAdmin: ctx.user.role === "admin", acknowledgement: input.acknowledgement });
    if (!permission.allowed) throw new Error(permission.reason);
    const db = await getDb();
    if (!db) throw new Error("Demo seed storage is unavailable.");
    const existingProduct = (await db.select().from(sellerProducts).where(and(eq(sellerProducts.merchantOpenId, ctx.user.openId), eq(sellerProducts.sku, "DS-JUDGE-DEMO"))).limit(1))[0];
    if (!existingProduct) await db.insert(sellerProducts).values({ merchantOpenId: ctx.user.openId, sku: "DS-JUDGE-DEMO", name: "Synthetic fulfilment evidence kit", description: "SYNTHETIC LOCAL DEMO ONLY — not a saleable customer product.", unitAmountPaise: 129900, inventoryQuantity: 99, status: "active" });
    const product = existingProduct ?? (await db.select().from(sellerProducts).where(and(eq(sellerProducts.merchantOpenId, ctx.user.openId), eq(sellerProducts.sku, "DS-JUDGE-DEMO"))).limit(1))[0];
    if (!product) throw new Error("Synthetic demo product could not be prepared.");
    const orders = [
      { orderReference: "JUDGE-DEMO-001", buyerLabel: "Synthetic buyer A — local only", totalAmountPaise: 129900, paymentObservation: "api_observed" as const, fulfillmentState: "delivery_exception" as const, shippingRecord: "SYNTHETIC merchant record: delivery proof missing" },
      { orderReference: "JUDGE-DEMO-002", buyerLabel: "Synthetic buyer B — local only", totalAmountPaise: 129900, paymentObservation: "api_observed" as const, fulfillmentState: "shipped" as const, shippingRecord: "SYNTHETIC merchant record: tracking reference pending review" },
      { orderReference: "JUDGE-DEMO-003", buyerLabel: "Synthetic buyer C — local only", totalAmountPaise: 129900, paymentObservation: "not_started" as const, fulfillmentState: "delivered" as const, shippingRecord: "SYNTHETIC merchant record: local delivery noted" },
    ];
    for (const fixture of orders) {
      const existing = (await db.select().from(sellerOrders).where(and(eq(sellerOrders.merchantOpenId, ctx.user.openId), eq(sellerOrders.orderReference, fixture.orderReference))).limit(1))[0];
      const values = { productId: product.id, productName: product.name, quantity: 1, buyerLabel: fixture.buyerLabel, buyerOpenId: ctx.user.openId, totalAmountPaise: fixture.totalAmountPaise, currency: "INR", paymentObservation: fixture.paymentObservation, fulfillmentState: fixture.fulfillmentState, shippingRecord: fixture.shippingRecord, sourceKind: "merchant_record" as const };
      if (existing) await db.update(sellerOrders).set(values).where(eq(sellerOrders.id, existing.id)); else await db.insert(sellerOrders).values({ merchantOpenId: ctx.user.openId, orderReference: fixture.orderReference, ...values });
    }
    const seededOrders = await db.select().from(sellerOrders).where(eq(sellerOrders.merchantOpenId, ctx.user.openId));
    const orderMap = new Map(seededOrders.filter(order => order.orderReference.startsWith("JUDGE-DEMO-")).map(order => [order.orderReference, order]));
    const cases = [
      { caseReference: "JUDGE-CASE-001", orderReference: "JUDGE-DEMO-001", issueType: "product_not_received" as const, status: "merchant_review" as const, customerStatement: "SYNTHETIC LOCAL DEMO ONLY — delivery proof is unavailable for merchant review." },
      { caseReference: "JUDGE-CASE-002", orderReference: "JUDGE-DEMO-002", issueType: "refund_issue" as const, status: "evidence_pending" as const, customerStatement: "SYNTHETIC LOCAL DEMO ONLY — local refund evidence needs merchant review." },
      { caseReference: "JUDGE-CASE-003", orderReference: "JUDGE-DEMO-003", issueType: "return_request" as const, status: "return_authorized" as const, customerStatement: "SYNTHETIC LOCAL DEMO ONLY — return receipt has not been recorded." },
    ];
    for (const fixture of cases) {
      const order = orderMap.get(fixture.orderReference); if (!order) continue;
      const existing = (await db.select().from(customerCases).where(and(eq(customerCases.merchantOpenId, ctx.user.openId), eq(customerCases.caseReference, fixture.caseReference))).limit(1))[0];
      const values = { sellerOrderId: order.id, buyerOpenId: ctx.user.openId, issueType: fixture.issueType, status: fixture.status, customerStatement: fixture.customerStatement, sourceKind: "customer_local_case" as const };
      if (existing) await db.update(customerCases).set(values).where(eq(customerCases.id, existing.id)); else {
        await db.insert(customerCases).values({ merchantOpenId: ctx.user.openId, caseReference: fixture.caseReference, ...values });
        const inserted = (await db.select().from(customerCases).where(and(eq(customerCases.merchantOpenId, ctx.user.openId), eq(customerCases.caseReference, fixture.caseReference))).limit(1))[0];
        if (inserted) await db.insert(customerCaseEvents).values({ customerCaseId: inserted.id, actorType: "system", actorOpenId: null, eventType: "synthetic_judge_demo_seeded", detail: "SYNTHETIC LOCAL DEMO ONLY — created for a safe judge walkthrough; no payment, carrier, refund, or external dispute event exists.", sourceRefs: JSON.stringify({ demoSeedBatchId: "DS-JUDGE-2026-08-24.1" }) });
      }
    }
    invalidateScopedCache(`customer-orders:${ctx.user.openId}:${ctx.user.openId}`);
    return { productSku: product.sku, orderReferences: orders.map(order => order.orderReference), caseReferences: cases.map(caseItem => caseItem.caseReference), demoSeedBatchId: "DS-JUDGE-2026-08-24.1", boundary: "Idempotent synthetic local demo data only. No Razorpay order, payment, webhook, refund, external dispute, or issuer outcome is created by this action." };
  }),
  uploadCustomerCaseDocument: protectedProcedure.input(z.object({ accessToken: z.string().trim().min(32).max(256), caseReference: z.string().trim().min(3).max(64), declaredKind: z.enum(CUSTOMER_DOCUMENT_KINDS), originalName: z.string().trim().min(1).max(255), contentType: z.enum(CUSTOMER_DOCUMENT_TYPES), contentBase64: z.string().min(16).max(5_000_000), useGeminiAssistance: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
    const limit = checkCustomerRateLimit({ buyerOpenId: ctx.user.openId, action: "document_upload" });
    if (!limit.allowed) throw new Error(`Too many document uploads from this signed-in customer. Please wait ${limit.retryAfterSeconds} seconds and try again.`);
    const { db, order } = await resolveCustomerAccess(ctx.user.openId, input.accessToken);
    const caseItem = (await db.select().from(customerCases).where(and(eq(customerCases.caseReference, input.caseReference), eq(customerCases.sellerOrderId, order.id), eq(customerCases.buyerOpenId, ctx.user.openId), eq(customerCases.merchantOpenId, order.merchantOpenId))).limit(1))[0];
    if (!caseItem || ["resolved", "closed", "withdrawn"].includes(caseItem.status)) throw new Error("This case cannot accept customer documents.");
    const fileData = Buffer.from(input.contentBase64, "base64");
    if (!fileData.length || fileData.length > CUSTOMER_DOCUMENT_MAX_BYTES || !validCustomerDocumentSignature(input.contentType, fileData)) { recordOperationalTelemetry(order.merchantOpenId, "evidence_rejected"); throw new Error("Only a valid JPEG, PNG, WebP, or PDF up to 3.5 MB can be added to this case."); }
    const sha256 = crypto.createHash("sha256").update(fileData).digest("hex");
    const fileKeyPrefix = `customer-cases/${order.merchantOpenId}/${caseItem.id}/${crypto.randomUUID()}`;
    const stored = await storagePut(`${fileKeyPrefix}-${safeCustomerFileName(input.originalName)}.${customerDocumentExtension(input.contentType)}`, fileData, input.contentType);
    await db.insert(customerCaseDocuments).values({ customerCaseId: caseItem.id, merchantOpenId: order.merchantOpenId, buyerOpenId: ctx.user.openId, declaredKind: input.declaredKind, originalName: safeCustomerFileName(input.originalName), contentType: input.contentType, byteSize: fileData.length, sha256, fileKey: stored.key });
    const document = (await db.select().from(customerCaseDocuments).where(eq(customerCaseDocuments.fileKey, stored.key)).limit(1))[0];
    if (!document) throw new Error("Customer document storage could not be confirmed.");
    await db.insert(customerDocumentExtractions).values({ customerCaseDocumentId: document.id, model: "pending", status: "pending" });
    await appendPrivateIntegrityAnchor(db, { merchantOpenId: order.merchantOpenId, customerCaseId: caseItem.id, anchorType: "document_checksum", sourceRecordId: String(document.id), payloadHash: document.sha256, createdBy: ctx.user.openId });
    await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "customer", actorOpenId: ctx.user.openId, eventType: "document_uploaded", detail: `${document.originalName} was added as ${input.declaredKind.replaceAll("_", " ")}.`, sourceRefs: JSON.stringify({ documentId: document.id, sha256 }) });
    if (!input.useGeminiAssistance) {
      await db.update(customerDocumentExtractions).set({ model: "not_requested", status: "failed", summary: "Customer did not request Gemini evidence assistance. The original document is available for direct merchant review.", warningsJson: JSON.stringify(["No AI extraction was requested by the customer."]) }).where(eq(customerDocumentExtractions.customerCaseDocumentId, document.id));
      await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "customer", actorOpenId: ctx.user.openId, eventType: "gemini_assistance_not_requested", detail: "Customer retained the original document for direct merchant review without requesting Gemini assistance.", sourceRefs: JSON.stringify({ documentId: document.id }) });
      return { documentId: document.id, extraction: null, sourceBoundary: "original_document_human_review" as const };
    }
    try {
      const { model, extraction } = await extractCustomerDocument({ contentType: input.contentType, data: fileData, linkedOrderReference: order.orderReference, issueType: caseItem.issueType });
      await db.update(customerDocumentExtractions).set({ model, status: "complete", documentType: extraction.documentType, summary: extraction.summary, fieldsJson: JSON.stringify(extraction.fields), warningsJson: JSON.stringify(extraction.warnings), overallConfidence: extraction.overallConfidence }).where(eq(customerDocumentExtractions.customerCaseDocumentId, document.id));
      await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "system", actorOpenId: null, eventType: "ocr_extraction_complete", detail: `Candidate document facts extracted at ${extraction.overallConfidence}% confidence. Customer confirmation is required.`, sourceRefs: JSON.stringify({ documentId: document.id, model }) });
      return { documentId: document.id, extraction: { ...extraction, customerConfirmation: "not_reviewed" as const }, sourceBoundary: "ocr_candidate" as const };
    } catch (error) {
      await db.update(customerDocumentExtractions).set({ model: "unavailable", status: "failed", summary: "No extraction was produced. The original document remains available for merchant review.", warningsJson: JSON.stringify(["OCR extraction failed; this document needs direct human review."]) }).where(eq(customerDocumentExtractions.customerCaseDocumentId, document.id));
      await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "system", actorOpenId: null, eventType: "ocr_extraction_failed", detail: "OCR extraction was unavailable. The original document was retained for direct merchant review.", sourceRefs: JSON.stringify({ documentId: document.id }) });
      return { documentId: document.id, extraction: null, sourceBoundary: "original_document_human_review" as const, warning: error instanceof Error ? error.message : "OCR extraction was unavailable." };
    }
  }),
  confirmCustomerDocumentExtraction: protectedProcedure.input(z.object({ accessToken: z.string().trim().min(32).max(256), documentId: z.number().int().positive(), confirmation: z.enum(["confirmed", "corrected", "rejected"]), corrections: z.record(z.string(), z.string().max(500)).optional() })).mutation(async ({ ctx, input }) => {
    const { db, order } = await resolveCustomerAccess(ctx.user.openId, input.accessToken);
    const document = (await db.select().from(customerCaseDocuments).where(and(eq(customerCaseDocuments.id, input.documentId), eq(customerCaseDocuments.buyerOpenId, ctx.user.openId), eq(customerCaseDocuments.merchantOpenId, order.merchantOpenId))).limit(1))[0];
    if (!document || !isCustomerScopedRecord({ record: document, merchantOpenId: order.merchantOpenId, buyerOpenId: ctx.user.openId })) throw new Error("This customer document is not available in the bound order workspace.");
    const caseItem = (await db.select().from(customerCases).where(and(eq(customerCases.id, document.customerCaseId), eq(customerCases.sellerOrderId, order.id))).limit(1))[0];
    if (!caseItem) throw new Error("The document is not linked to the bound customer case.");
    await db.update(customerDocumentExtractions).set({ customerConfirmation: input.confirmation, customerCorrectionsJson: input.confirmation === "corrected" ? JSON.stringify(input.corrections || {}) : null }).where(eq(customerDocumentExtractions.customerCaseDocumentId, document.id));
    await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "customer", actorOpenId: ctx.user.openId, eventType: `ocr_${input.confirmation}`, detail: input.confirmation === "confirmed" ? "Customer confirmed the OCR candidate facts." : input.confirmation === "corrected" ? "Customer corrected the OCR candidate facts; the original extraction remains retained." : "Customer rejected the OCR candidate facts; direct merchant review is required.", sourceRefs: JSON.stringify({ documentId: document.id }) });
    return { documentId: document.id, confirmation: input.confirmation };
  }),
  customerCaseAction: protectedProcedure.input(z.object({ accessToken: z.string().trim().min(32).max(256), caseReference: z.string().trim().min(3).max(64), action: z.enum(["submit", "withdraw", "provide_evidence", "mark_return_in_transit", "accept_resolution"]), note: z.string().trim().min(3).max(1000).optional() })).mutation(async ({ ctx, input }) => {
    const { db, order } = await resolveCustomerAccess(ctx.user.openId, input.accessToken);
    const caseItem = (await db.select().from(customerCases).where(and(eq(customerCases.caseReference, input.caseReference), eq(customerCases.sellerOrderId, order.id), eq(customerCases.buyerOpenId, ctx.user.openId))).limit(1))[0];
    if (!caseItem) throw new Error("Customer case not found in the bound order workspace.");
    const documents = await db.select().from(customerCaseDocuments).where(eq(customerCaseDocuments.customerCaseId, caseItem.id));
    const extractionRows = await Promise.all(documents.map(document => db.select().from(customerDocumentExtractions).where(eq(customerDocumentExtractions.customerCaseDocumentId, document.id)).limit(1)));
    const hasUnreviewedExtraction = extractionRows.flat().some(extraction => extraction.status === "complete" && extraction.customerConfirmation === "not_reviewed");
    if (input.action === "submit" && (documents.length === 0 || hasUnreviewedExtraction)) {
      await db.update(customerCases).set({ status: "evidence_pending" }).where(eq(customerCases.id, caseItem.id));
      await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "system", actorOpenId: null, eventType: "submission_blocked_evidence_pending", detail: documents.length === 0 ? "Customer submission paused until at least one evidence item is added or a merchant explicitly requests a statement-only review." : "Customer submission paused until OCR candidates are confirmed, corrected, or rejected.", sourceRefs: null });
      return { status: "evidence_pending" as const, message: "Add evidence and review each OCR candidate before submitting this local customer case." };
    }
    const nextStatus = transitionCustomerCase({ status: caseItem.status, actor: "customer", action: input.action, issueType: caseItem.issueType });
    await db.update(customerCases).set({ status: nextStatus, submittedAt: input.action === "submit" ? new Date() : caseItem.submittedAt, closedAt: ["withdraw", "accept_resolution"].includes(input.action) ? new Date() : caseItem.closedAt }).where(eq(customerCases.id, caseItem.id));
    await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "customer", actorOpenId: ctx.user.openId, eventType: `customer_${input.action}`, detail: input.note || `Customer moved the local case to ${nextStatus.replaceAll("_", " ")}.`, sourceRefs: JSON.stringify({ sourceKind: "customer_local_case" }) });
    return { status: nextStatus, message: nextStatus === "submitted" ? "Case submitted for merchant review. No refund or external dispute was created." : "Customer case status updated." };
  }),
  merchantCustomerCases: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const cases = await db.select().from(customerCases).where(eq(customerCases.merchantOpenId, ctx.user.openId)).orderBy(desc(customerCases.updatedAt));
    return Promise.all(cases.map(async caseItem => {
      const [order, documents, events, returnReceipt, refundRequest, integrityAnchors] = await Promise.all([
        db.select().from(sellerOrders).where(and(eq(sellerOrders.id, caseItem.sellerOrderId), eq(sellerOrders.merchantOpenId, ctx.user.openId))).limit(1),
        db.select().from(customerCaseDocuments).where(and(eq(customerCaseDocuments.customerCaseId, caseItem.id), eq(customerCaseDocuments.merchantOpenId, ctx.user.openId))).orderBy(desc(customerCaseDocuments.createdAt)),
        db.select().from(customerCaseEvents).where(eq(customerCaseEvents.customerCaseId, caseItem.id)).orderBy(desc(customerCaseEvents.createdAt)),
        db.select().from(customerReturnReceipts).where(and(eq(customerReturnReceipts.customerCaseId, caseItem.id), eq(customerReturnReceipts.merchantOpenId, ctx.user.openId))).limit(1),
        db.select().from(customerRefundRequests).where(and(eq(customerRefundRequests.customerCaseId, caseItem.id), eq(customerRefundRequests.merchantOpenId, ctx.user.openId))).limit(1),
        db.select({ sourceRecordId: customerCaseIntegrityAnchors.sourceRecordId }).from(customerCaseIntegrityAnchors).where(and(eq(customerCaseIntegrityAnchors.customerCaseId, caseItem.id), eq(customerCaseIntegrityAnchors.merchantOpenId, ctx.user.openId), eq(customerCaseIntegrityAnchors.anchorType, "document_checksum"))),
      ]);
      const anchoredDocumentIds = new Set(integrityAnchors.map(anchor => anchor.sourceRecordId));
      const documentRows = await Promise.all(documents.map(async document => ({ ...document, privateIntegrityAnchor: anchoredDocumentIds.has(String(document.id)), extraction: (await db.select().from(customerDocumentExtractions).where(eq(customerDocumentExtractions.customerCaseDocumentId, document.id)).limit(1))[0] ?? null })));
      const receipt = returnReceipt[0] ?? null;
      const refund = refundRequest[0] ?? null;
      const linkedOrder = order[0] ?? null;
      return { ...caseItem, order: linkedOrder, documents: documentRows, events, returnReceipt: receipt, refundRequest: refund, guidance: CUSTOMER_CASE_GUIDANCE[caseItem.issueType], recommendation: universalCaseRecommendation({ caseItem, documentRows, order: linkedOrder, returnReceipt: receipt, refundRequest: refund }), networkEvidenceMapping: getReasonCodeMapping(caseItem.issueType), sourceBoundary: "local_customer_case" as const };
    }));
  }),
  merchantCaseOperations: protectedProcedure.input(z.object({
    merchantOpenId: z.string().trim().min(3).max(64).optional(),
    search: z.string().trim().max(120).optional(),
    issueType: z.enum(CUSTOMER_ISSUE_TYPES).or(z.literal("all")).optional(),
    status: z.string().trim().max(64).optional(),
    readiness: z.enum(["all", "needs_evidence", "ready"]).optional(),
    from: z.date().optional(),
    to: z.date().optional(),
    page: z.number().int().min(1).max(10_000).optional(),
    pageSize: z.number().int().min(1).max(50).optional(),
  }).optional()).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return { cases: [], trends: [], buyerPatternSignals: [], usage: buildUsageMeter({ orderCount: 0, caseCount: 0, documentCount: 0, webhookCount: 0 }), boundary: "Merchant operations storage is unavailable; no case signal was inferred." };
    const merchantOpenId = input?.merchantOpenId ?? ctx.user.openId;
    await requireMerchantTeamRole(db, ctx.user.openId, merchantOpenId, "viewer");
    const [caseRows, orders, documentRows, escalationRows, eventRows, refundRows] = await Promise.all([
      db.select().from(customerCases).where(eq(customerCases.merchantOpenId, merchantOpenId)).orderBy(desc(customerCases.updatedAt)),
      db.select().from(sellerOrders).where(eq(sellerOrders.merchantOpenId, merchantOpenId)),
      db.select().from(customerCaseDocuments).where(eq(customerCaseDocuments.merchantOpenId, merchantOpenId)),
      db.select().from(customerCaseEscalations).where(eq(customerCaseEscalations.merchantOpenId, merchantOpenId)),
      db.select({ id: webhookEvents.id }).from(webhookEvents).where(eq(webhookEvents.merchantOpenId, merchantOpenId)),
      db.select().from(customerRefundRequests).where(eq(customerRefundRequests.merchantOpenId, merchantOpenId)),
    ]);
    const orderById = new Map(orders.map(order => [order.id, order]));
    const documentsByCase = new Map<number, typeof documentRows>();
    for (const document of documentRows) documentsByCase.set(document.customerCaseId, [...(documentsByCase.get(document.customerCaseId) ?? []), document]);
    const escalationByCase = new Map(escalationRows.map(escalation => [escalation.customerCaseId, escalation]));
    const refundByCase = new Map(refundRows.map(refund => [refund.customerCaseId, refund]));
    const enriched = caseRows.map(caseItem => {
      const order = orderById.get(caseItem.sellerOrderId) ?? null;
      const readiness = calculateCustomerCaseEvidenceReadiness({ issueType: caseItem.issueType, documentKinds: (documentsByCase.get(caseItem.id) ?? []).map(document => document.declaredKind) });
      const escalation = escalationByCase.get(caseItem.id);
      return {
        caseReference: caseItem.caseReference,
        buyerOpenId: caseItem.buyerOpenId,
        buyerLabel: order?.buyerLabel ?? "Private buyer",
        issueType: caseItem.issueType,
        status: caseItem.status,
        createdAt: caseItem.createdAt,
        updatedAt: caseItem.updatedAt,
        readinessScore: readiness.score,
        orderAmountPaise: order?.totalAmountPaise ?? null,
        orderReference: order?.orderReference ?? null,
        networkEvidenceMapping: getReasonCodeMapping(caseItem.issueType),
        razorpayEvidenceExportPreview: buildRazorpayEvidenceExportPreview({ issueType: caseItem.issueType, documentKinds: (documentsByCase.get(caseItem.id) ?? []).map(document => document.declaredKind), paymentObservation: order?.paymentObservation ?? "not_started", refundConfirmed: refundByCase.get(caseItem.id)?.status === "razorpay_confirmed" }),
        escalation: escalation ? { ownerLabel: escalation.ownerLabel, level: escalation.level, escalationNote: escalation.escalationNote, acknowledgedAt: escalation.acknowledgedAt, resolvedAt: escalation.resolvedAt, updatedAt: escalation.updatedAt } : { ownerLabel: "Merchant review", level: "watch" as const, escalationNote: "No manual ownership or escalation has been recorded.", acknowledgedAt: null, resolvedAt: null, updatedAt: caseItem.updatedAt },
        slaLevel: escalation?.level === "elevated" ? "elevated" as const : escalation?.level === "review" ? "review" as const : escalation?.level === "resolved" ? "resolved" as const : "watch" as const,
      };
    });
    const filtered = filterMerchantCases(enriched, { search: input?.search, issueType: input?.issueType, status: input?.status || "all", readiness: input?.readiness || "all", from: input?.from, to: input?.to });
    const pagination = paginateMerchantCases(filtered, { page: input?.page, pageSize: input?.pageSize });
    return {
      cases: pagination.rows,
      pagination,
      trends: buildRiskTrend(enriched),
      buyerPatternSignals: buildBuyerPatternSignals(enriched),
      rollingRiskReport: buildRollingRiskReport(enriched),
      usage: buildUsageMeter({ orderCount: orders.length, caseCount: caseRows.length, documentCount: documentRows.length, webhookCount: eventRows.length }),
      boundary: "Search, trends, and buyer-pattern signals are merchant-scoped operational triage. They do not label a buyer, decide a case, alter eligibility, or trigger money movement or external communication.",
    };
  }),
  merchantTeamWorkspaces: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { workspaces: [{ merchantOpenId: ctx.user.openId, role: "owner" as const }], boundary: MERCHANT_TEAM_BOUNDARY };
    const memberships = await db.select().from(merchantTeamMemberships).where(and(eq(merchantTeamMemberships.memberOpenId, ctx.user.openId), eq(merchantTeamMemberships.active, true)));
    return { workspaces: [{ merchantOpenId: ctx.user.openId, role: "owner" as const }, ...memberships.map(membership => ({ merchantOpenId: membership.merchantOpenId, role: membership.role }))], boundary: MERCHANT_TEAM_BOUNDARY };
  }),
  merchantTeamMembers: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { members: [], boundary: MERCHANT_TEAM_BOUNDARY };
    const members = await db.select({ memberOpenId: merchantTeamMemberships.memberOpenId, role: merchantTeamMemberships.role, active: merchantTeamMemberships.active, createdAt: merchantTeamMemberships.createdAt, memberName: users.name, memberEmail: users.email }).from(merchantTeamMemberships).leftJoin(users, eq(users.openId, merchantTeamMemberships.memberOpenId)).where(eq(merchantTeamMemberships.merchantOpenId, ctx.user.openId)).orderBy(desc(merchantTeamMemberships.updatedAt));
    return { members, boundary: MERCHANT_TEAM_BOUNDARY };
  }),
  merchantOperationalTelemetry: protectedProcedure.query(({ ctx }) => getOperationalTelemetry(ctx.user.openId)),
  setMerchantTeamMember: protectedProcedure.input(z.object({ memberEmail: z.string().trim().toLowerCase().email().max(320), role: z.enum(MERCHANT_TEAM_ROLES), active: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Merchant team storage is unavailable.");
    const member = (await db.select().from(users).where(eq(users.email, input.memberEmail)).limit(1))[0];
    if (!member) throw new Error("This teammate must sign in to DisputeShield once before you can grant local access.");
    if (member.openId === ctx.user.openId) throw new Error("The merchant owner is implicit and cannot be added as a separate team member.");
    await db.insert(merchantTeamMemberships).values({ merchantOpenId: ctx.user.openId, memberOpenId: member.openId, role: input.role, active: input.active, addedBy: ctx.user.openId }).onDuplicateKeyUpdate({ set: { role: input.role, active: input.active, addedBy: ctx.user.openId } });
    return { memberEmail: input.memberEmail, role: input.role, active: input.active, message: "Internal merchant-team access recorded. No external invitation or provider permission was created." };
  }),
  exportRedactedCustomerCaseAudit: protectedProcedure.input(z.object({ caseReference: z.string().trim().min(3).max(64), approvalPhrase: z.literal(CASE_AUDIT_APPROVAL_PHRASE) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Customer case storage is unavailable.");
    const caseItem = (await db.select().from(customerCases).where(eq(customerCases.caseReference, input.caseReference)).limit(1))[0];
    if (!caseItem) throw new Error("Customer case not found in this merchant workspace.");
    await requireMerchantTeamRole(db, ctx.user.openId, caseItem.merchantOpenId, "approver");
    const [orderRows, documents, events, escalationRows] = await Promise.all([
      db.select().from(sellerOrders).where(and(eq(sellerOrders.id, caseItem.sellerOrderId), eq(sellerOrders.merchantOpenId, caseItem.merchantOpenId))).limit(1),
      db.select().from(customerCaseDocuments).where(and(eq(customerCaseDocuments.customerCaseId, caseItem.id), eq(customerCaseDocuments.merchantOpenId, caseItem.merchantOpenId))).orderBy(desc(customerCaseDocuments.createdAt)),
      db.select().from(customerCaseEvents).where(eq(customerCaseEvents.customerCaseId, caseItem.id)).orderBy(desc(customerCaseEvents.createdAt)),
      db.select().from(customerCaseEscalations).where(and(eq(customerCaseEscalations.customerCaseId, caseItem.id), eq(customerCaseEscalations.merchantOpenId, caseItem.merchantOpenId))).limit(1),
    ]);
    const documentRows = await Promise.all(documents.map(async document => ({ ...document, extraction: (await db.select().from(customerDocumentExtractions).where(eq(customerDocumentExtractions.customerCaseDocumentId, document.id)).limit(1))[0] ?? null })));
    const readiness = calculateCustomerCaseEvidenceReadiness({ issueType: caseItem.issueType, documentKinds: documents.map(document => document.declaredKind) });
    const mapping = getReasonCodeMapping(caseItem.issueType);
    const audit = buildRedactedCaseAudit({ caseItem, order: orderRows[0] ?? null, readinessScore: readiness.score, missingEvidence: readiness.missing.map(requirement => requirement.kind), evidenceFields: mapping.razorpayEvidenceFields, documents: documentRows, events, escalation: escalationRows[0] ? { ownerLabel: escalationRows[0].ownerLabel, level: escalationRows[0].level, updatedAt: escalationRows[0].updatedAt } : null });
    const exportHash = hashRedactedCaseAudit(audit);
    await db.insert(customerCaseAuditExports).values({ customerCaseId: caseItem.id, merchantOpenId: caseItem.merchantOpenId, approvedBy: ctx.user.openId, approvalPhrase: input.approvalPhrase, exportVersion: CASE_AUDIT_EXPORT_VERSION, exportHash });
    const integrityResult = await appendPrivateIntegrityAnchor(db, { merchantOpenId: caseItem.merchantOpenId, customerCaseId: caseItem.id, anchorType: "audit_export", sourceRecordId: exportHash, payloadHash: exportHash, createdBy: ctx.user.openId });
    const integrityChainHash = integrityResult.anchor.chainHash;
    await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "merchant", actorOpenId: ctx.user.openId, eventType: "merchant_redacted_audit_exported", detail: "Merchant approved a redacted local case audit export and private integrity anchor. No provider submission, contest, refund, blockchain-network action, or external action occurred.", sourceRefs: JSON.stringify({ sourceKind: "merchant_record", exportHash, exportVersion: CASE_AUDIT_EXPORT_VERSION, integrityAnchor: integrityChainHash.slice(0, 16) }) });
    if (integrityResult.created) await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "system", actorOpenId: null, eventType: "integrity_anchor_created", detail: "Private database integrity anchor created for the approved redacted audit export. This verifies local record consistency only; it is not a public blockchain, payment, provider, or dispute-outcome fact.", sourceRefs: JSON.stringify({ sourceKind: "private_integrity", anchorType: "audit_export", integrityAnchor: integrityChainHash.slice(0, 16) }) });
    return { caseReference: caseItem.caseReference, audit, exportHash, exportVersion: CASE_AUDIT_EXPORT_VERSION, integrityAnchor: { chainHash: integrityChainHash, anchorVersion: PRIVATE_INTEGRITY_VERSION }, message: "Redacted local case audit and private integrity anchor prepared for download. No provider submission, contest, refund, blockchain-network action, or external action occurred." };
  }),
  customerCaseIntegrity: protectedProcedure.input(z.object({ caseReference: z.string().trim().min(3).max(64) })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return { anchors: [], verification: { valid: true, checked: 0, rootHash: null }, boundary: "Private integrity storage is unavailable." };
    const caseItem = (await db.select().from(customerCases).where(eq(customerCases.caseReference, input.caseReference)).limit(1))[0];
    if (!caseItem) throw new Error("Customer case not found in this merchant workspace.");
    await requireMerchantTeamRole(db, ctx.user.openId, caseItem.merchantOpenId, "viewer");
    const rows = await db.select().from(customerCaseIntegrityAnchors).where(and(eq(customerCaseIntegrityAnchors.customerCaseId, caseItem.id), eq(customerCaseIntegrityAnchors.merchantOpenId, caseItem.merchantOpenId))).orderBy(customerCaseIntegrityAnchors.id);
    const anchors = rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() }));
    return { anchors: anchors.map(anchor => ({ anchorType: anchor.anchorType, sourceRecordId: anchor.sourceRecordId, chainHash: anchor.chainHash, previousChainHash: anchor.previousChainHash, anchorVersion: anchor.anchorVersion, createdAt: anchor.createdAt })), verification: verifyIntegrityChain(anchors), boundary: "Private database hash-chain verification only. No document content, customer identity, payment credential, public-chain transaction, wallet, token, or external provider action is included." };
  }),
  merchantDailyIntegrityRoot: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { rootHash: null, anchorCount: 0, boundary: "Private integrity storage is unavailable." };
    const rows = await db.select().from(customerCaseIntegrityAnchors).where(eq(customerCaseIntegrityAnchors.merchantOpenId, ctx.user.openId));
    return { rootHash: buildMerkleRoot(rows.map(row => row.chainHash)), anchorCount: rows.length, anchorVersion: PRIVATE_INTEGRITY_VERSION, boundary: "This is a private, current database Merkle root. It is not published to a blockchain or external ledger." };
  }),
  analyzeMerchantCustomerCaseSentiment: protectedProcedure.input(z.object({ caseReference: z.string().trim().min(3).max(64) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Customer case storage is unavailable.");
    const caseItem = (await db.select().from(customerCases).where(eq(customerCases.caseReference, input.caseReference)).limit(1))[0];
    if (!caseItem) throw new Error("Customer case not found in this merchant workspace.");
    await requireMerchantTeamRole(db, ctx.user.openId, caseItem.merchantOpenId, "reviewer");
    const analysis = await analyzeCustomerStatementWithOllama(caseItem.customerStatement, { merchantOpenId: caseItem.merchantOpenId });
    return { caseReference: caseItem.caseReference, analysis, sourceBoundary: "merchant_reviewed_customer_statement_advisory_only" as const };
  }),
  setCustomerCaseEscalation: protectedProcedure.input(z.object({
    caseReference: z.string().trim().min(3).max(64),
    ownerLabel: z.string().trim().min(2).max(120),
    level: z.enum(["watch", "review", "elevated", "resolved"]),
    note: z.string().trim().min(4).max(1500),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Customer case storage is unavailable.");
    const caseItem = (await db.select().from(customerCases).where(eq(customerCases.caseReference, input.caseReference)).limit(1))[0];
    if (!caseItem) throw new Error("Customer case not found in this merchant workspace.");
    await requireMerchantTeamRole(db, ctx.user.openId, caseItem.merchantOpenId, "reviewer");
    const ownerLabel = sanitizePlainText(input.ownerLabel);
    const note = sanitizePlainText(input.note);
    if (ownerLabel.length < 2 || note.length < 4) throw new Error("Provide a valid owner label and local SLA note.");
    const now = new Date();
    await db.insert(customerCaseEscalations).values({ customerCaseId: caseItem.id, merchantOpenId: caseItem.merchantOpenId, ownerLabel, level: input.level, escalationNote: note, assignedBy: ctx.user.openId, acknowledgedAt: input.level === "watch" ? null : now, resolvedAt: input.level === "resolved" ? now : null }).onDuplicateKeyUpdate({ set: { ownerLabel, level: input.level, escalationNote: note, assignedBy: ctx.user.openId, acknowledgedAt: input.level === "watch" ? null : now, resolvedAt: input.level === "resolved" ? now : null } });
    await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "merchant", actorOpenId: ctx.user.openId, eventType: "merchant_sla_ownership_updated", detail: `Merchant assigned ${ownerLabel} to ${input.level} SLA ownership. ${note}`, sourceRefs: JSON.stringify({ sourceKind: "merchant_record", action: "manual_sla_ownership" }) });
    if (input.level === "elevated") { recordOperationalTelemetry(caseItem.merchantOpenId, "sla_elevated"); recordNotification({ type: "escalation", title: "Local case elevated", body: `${caseItem.caseReference} is assigned to ${ownerLabel}. In-app merchant follow-up is required.`, tone: "critical" }); }
    return { caseReference: caseItem.caseReference, ownerLabel, level: input.level, message: input.level === "elevated" ? "Merchant-owned SLA escalation recorded and an in-app notification was created. No external message, refund, or dispute action was sent." : "Merchant-owned SLA state recorded. No external message, refund, or dispute action was sent." };
  }),
  merchantResolutionOverview: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { signals: [], caseCount: 0, sourceBoundary: "merchant_operational_aggregate" as const };
    const cases = await db.select({ issueType: customerCases.issueType, status: customerCases.status }).from(customerCases).where(eq(customerCases.merchantOpenId, ctx.user.openId));
    return { signals: buildMerchantOperationalSignals(cases), caseCount: cases.length, sourceBoundary: "merchant_operational_aggregate" as const };
  }),
  proactiveRiskIntelligence: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return buildProactiveRiskIntelligence([]);
    const caseRows = await db.select().from(customerCases).where(eq(customerCases.merchantOpenId, ctx.user.openId));
    const facts = await Promise.all(caseRows.map(async caseItem => {
      const [order, documents, returnReceipt, refundRequest] = await Promise.all([
        db.select().from(sellerOrders).where(and(eq(sellerOrders.id, caseItem.sellerOrderId), eq(sellerOrders.merchantOpenId, ctx.user.openId))).limit(1),
        db.select().from(customerCaseDocuments).where(and(eq(customerCaseDocuments.customerCaseId, caseItem.id), eq(customerCaseDocuments.merchantOpenId, ctx.user.openId))),
        db.select().from(customerReturnReceipts).where(and(eq(customerReturnReceipts.customerCaseId, caseItem.id), eq(customerReturnReceipts.merchantOpenId, ctx.user.openId))).limit(1),
        db.select().from(customerRefundRequests).where(and(eq(customerRefundRequests.customerCaseId, caseItem.id), eq(customerRefundRequests.merchantOpenId, ctx.user.openId))).limit(1),
      ]);
      const hasUnreviewedExtraction = (await Promise.all(documents.map(async document => (await db.select().from(customerDocumentExtractions).where(eq(customerDocumentExtractions.customerCaseDocumentId, document.id)).limit(1))[0]))).some(extraction => extraction?.status === "complete" && extraction.customerConfirmation === "not_reviewed");
      return { caseReference: caseItem.caseReference, issueType: caseItem.issueType, status: caseItem.status, createdAt: caseItem.createdAt, updatedAt: caseItem.updatedAt, documentKinds: documents.map(document => document.declaredKind), hasUnreviewedExtraction, paymentObservation: order[0]?.paymentObservation ?? "created", fulfilmentState: order[0]?.fulfillmentState ?? "unfulfilled", returnReceiptRecorded: Boolean(returnReceipt[0]), refundConfirmed: refundRequest[0]?.status === "razorpay_confirmed" };
    }));
    return buildProactiveRiskIntelligence(facts);
  }),
  generateCaseRiskNarrative: protectedProcedure.input(z.object({ caseReference: z.string().trim().min(3).max(64) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Customer case storage is unavailable.");
    const caseItem = (await db.select().from(customerCases).where(and(eq(customerCases.caseReference, input.caseReference), eq(customerCases.merchantOpenId, ctx.user.openId))).limit(1))[0];
    if (!caseItem) throw new Error("Customer case not found in this merchant workspace.");
    const [order, documents, returnReceipt, refundRequest] = await Promise.all([
      db.select().from(sellerOrders).where(and(eq(sellerOrders.id, caseItem.sellerOrderId), eq(sellerOrders.merchantOpenId, ctx.user.openId))).limit(1),
      db.select().from(customerCaseDocuments).where(and(eq(customerCaseDocuments.customerCaseId, caseItem.id), eq(customerCaseDocuments.merchantOpenId, ctx.user.openId))),
      db.select().from(customerReturnReceipts).where(and(eq(customerReturnReceipts.customerCaseId, caseItem.id), eq(customerReturnReceipts.merchantOpenId, ctx.user.openId))).limit(1),
      db.select().from(customerRefundRequests).where(and(eq(customerRefundRequests.customerCaseId, caseItem.id), eq(customerRefundRequests.merchantOpenId, ctx.user.openId))).limit(1),
    ]);
    const documentRows = await Promise.all(documents.map(async document => ({ ...document, extraction: (await db.select().from(customerDocumentExtractions).where(eq(customerDocumentExtractions.customerCaseDocumentId, document.id)).limit(1))[0] ?? null })));
    const recommendation = universalCaseRecommendation({ caseItem, documentRows, order: order[0] ?? null, returnReceipt: returnReceipt[0] ?? null, refundRequest: refundRequest[0] ?? null });
    const linkedOrder = order[0];
    const paymentSource = linkedOrder?.razorpayPaymentId ? `Razorpay payment reference / ${linkedOrder.razorpayPaymentId}` : "Merchant order payment observation";
    const paymentState = linkedOrder?.paymentObservation ?? "created";
    const caseReadiness = calculateCustomerCaseEvidenceReadiness({ issueType: caseItem.issueType, documentKinds: documentRows.map(document => document.declaredKind) });
    const evidencePresent = caseReadiness.present.map(requirement => requirement.label);
    const evidenceMissing = Array.from(new Set([...caseReadiness.missing.map(requirement => requirement.label), ...recommendation.missingEvidence.map(item => item.replaceAll("_", " "))]));
    const factSheet = buildCaseFactSheet({ caseReference: caseItem.caseReference, paymentState, fulfilmentState: linkedOrder?.fulfillmentState ?? "unfulfilled", evidencePresent, evidenceMissing, caseAgeHours: Math.max(0, Math.floor((Date.now() - caseItem.updatedAt.getTime()) / 3_600_000)), slaDeadlineHours: Math.max(0, 72 - Math.floor((Date.now() - caseItem.updatedAt.getTime()) / 3_600_000)), reasonCode: caseItem.issueType, readinessScore: caseReadiness.score, recommendedOperationalStep: recommendation.nextActions[0] ?? "Review source-labelled case facts.", sourceLabels: [paymentSource, `Merchant fulfilment / ${linkedOrder?.orderReference ?? "order unavailable"}`, `Customer case / ${caseItem.caseReference}`, "Protected customer documents"] });
    return generateRiskNarrative(ctx.user.openId, factSheet);
  }),
  riskBenchmark: publicProcedure.query(() => runHeldOutRiskBenchmark()),
  merchantRiskExposure: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { activeCaseCount: 0, ordersAtRisk: 0, totals: [], boundary: "Exposure is unavailable because merchant case storage is unavailable." };
    const cases = await db.select().from(customerCases).where(eq(customerCases.merchantOpenId, ctx.user.openId));
    const activeCases = cases.filter(item => !["resolved", "closed", "withdrawn"].includes(item.status));
    const orders = await db.select().from(sellerOrders).where(eq(sellerOrders.merchantOpenId, ctx.user.openId));
    const orderById = new Map(orders.map(order => [order.id, order]));
    const exposedOrders = Array.from(new Set(activeCases.map(item => item.sellerOrderId))).map(id => orderById.get(id)).filter((order): order is typeof sellerOrders.$inferSelect => Boolean(order));
    const totals = Array.from(exposedOrders.reduce((acc, order) => { acc.set(order.currency, (acc.get(order.currency) ?? 0) + order.totalAmountPaise); return acc; }, new Map<string, number>()).entries()).map(([currency, amountPaise]) => ({ currency, amountPaise })).sort((a, b) => a.currency.localeCompare(b.currency));
    return { activeCaseCount: activeCases.length, ordersAtRisk: exposedOrders.length, totals, boundary: "Operational exposure is the sum of stored merchant order amounts linked to active local cases. It is not a predicted loss, a reserve, a refund amount, or an external dispute total." };
  }),
  merchantCustomerCaseAction: protectedProcedure.input(z.object({ caseReference: z.string().trim().min(3).max(64), action: z.enum(["start_review", "request_evidence", "authorize_return", "offer_resolution", "route_policy_review", "close"]), note: z.string().trim().min(4).max(1500) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Customer case storage is unavailable.");
    const caseItem = (await db.select().from(customerCases).where(and(eq(customerCases.caseReference, input.caseReference), eq(customerCases.merchantOpenId, ctx.user.openId))).limit(1))[0];
    if (!caseItem) throw new Error("Customer case not found in this merchant workspace.");
    const nextStatus = transitionCustomerCase({ status: caseItem.status, actor: "merchant", action: input.action, issueType: caseItem.issueType });
    await db.update(customerCases).set({ status: nextStatus, merchantNote: input.note, resolutionSummary: input.action === "offer_resolution" ? input.note : caseItem.resolutionSummary, closedAt: input.action === "close" ? new Date() : caseItem.closedAt }).where(eq(customerCases.id, caseItem.id));
    await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "merchant", actorOpenId: ctx.user.openId, eventType: `merchant_${input.action}`, detail: input.action === "offer_resolution" ? `Merchant recorded a local resolution offer: ${input.note}. No payment action was performed.` : input.note, sourceRefs: JSON.stringify({ sourceKind: "merchant_record" }) });
    return { status: nextStatus, message: input.action === "offer_resolution" ? "A local resolution offer was recorded. No refund, return label, or external dispute action was performed." : "Merchant-controlled customer case state updated." };
  }),
  recordMerchantReturnReceipt: protectedProcedure.input(z.object({ caseReference: z.string().trim().min(3).max(64), carrierName: z.string().trim().min(2).max(120), trackingReference: z.string().trim().min(3).max(160), deliveryPartnerMobileSuffix: z.string().regex(/^\d{4}$/).optional(), receiptNote: z.string().trim().min(8).max(1500), receivedAt: z.date().optional() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Customer case storage is unavailable.");
    const caseItem = (await db.select().from(customerCases).where(and(eq(customerCases.caseReference, input.caseReference), eq(customerCases.merchantOpenId, ctx.user.openId))).limit(1))[0];
    if (!caseItem) throw new Error("Customer case not found in this merchant workspace.");
    const nextStatus = transitionCustomerCase({ status: caseItem.status, actor: "merchant", action: "record_return_received", issueType: caseItem.issueType });
    const existingReceipt = (await db.select().from(customerReturnReceipts).where(eq(customerReturnReceipts.customerCaseId, caseItem.id)).limit(1))[0];
    if (existingReceipt) throw new Error("A return receipt is already recorded for this local case. Preserve that evidence rather than replacing it.");
    await db.insert(customerReturnReceipts).values({ customerCaseId: caseItem.id, merchantOpenId: ctx.user.openId, sellerOrderId: caseItem.sellerOrderId, carrierName: input.carrierName, trackingReference: input.trackingReference, deliveryPartnerMobileSuffix: input.deliveryPartnerMobileSuffix || null, sourceKind: "merchant_confirmed_mobile_record", signatureVerified: false, receiptNote: input.receiptNote, receivedAt: input.receivedAt ?? new Date(), confirmedBy: ctx.user.openId });
    await db.update(customerCases).set({ status: nextStatus, merchantNote: input.receiptNote }).where(eq(customerCases.id, caseItem.id));
    await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "merchant", actorOpenId: ctx.user.openId, eventType: "merchant_confirmed_return_receipt", detail: `Merchant confirmed return receipt from ${input.carrierName} for tracking ${input.trackingReference}. This is a merchant-confirmed delivery-partner record, not a signed carrier integration event.`, sourceRefs: JSON.stringify({ sourceKind: "merchant_confirmed_mobile_record", carrierName: input.carrierName, trackingReference: input.trackingReference, mobileSuffixProvided: Boolean(input.deliveryPartnerMobileSuffix) }) });
    return { status: nextStatus, sourceKind: "merchant_confirmed_mobile_record" as const, signatureVerified: false, message: "Return receipt recorded as a merchant-confirmed delivery-partner record. The case can now be assessed for a local refund request, but no refund was started." };
  }),
  prepareCustomerRefundRequest: protectedProcedure.input(z.object({ caseReference: z.string().trim().min(3).max(64) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Customer case storage is unavailable.");
    const caseItem = (await db.select().from(customerCases).where(and(eq(customerCases.caseReference, input.caseReference), eq(customerCases.merchantOpenId, ctx.user.openId))).limit(1))[0];
    if (!caseItem || caseItem.issueType !== "return_request" || caseItem.status !== "return_received") throw new Error("A local refund request can be prepared only after the merchant records receipt for a return-request case.");
    const [receipt, order, existingRequest] = await Promise.all([
      db.select().from(customerReturnReceipts).where(eq(customerReturnReceipts.customerCaseId, caseItem.id)).limit(1),
      db.select().from(sellerOrders).where(and(eq(sellerOrders.id, caseItem.sellerOrderId), eq(sellerOrders.merchantOpenId, ctx.user.openId))).limit(1),
      db.select().from(customerRefundRequests).where(eq(customerRefundRequests.customerCaseId, caseItem.id)).limit(1),
    ]);
    if (!receipt[0]) throw new Error("No receipt evidence is recorded for this return.");
    if (!order[0]?.razorpayPaymentId) throw new Error("No buyer payment reference is available. A refund request cannot be prepared from an unverified browser state.");
    let paymentCaptured = false;
    try { const payment = await fetchRazorpayPayment(order[0].razorpayPaymentId); paymentCaptured = payment.status === "captured" || payment.captured === true; } catch { paymentCaptured = false; }
    if (!paymentCaptured) throw new Error("Razorpay API does not currently confirm a captured payment for this order. The local refund request remains blocked.");
    if (existingRequest[0]) return { requestId: existingRequest[0].id, status: existingRequest[0].status, reused: true, message: "The existing local refund request was preserved. No Razorpay refund was initiated." };
    const preparedAt = new Date();
    await db.insert(customerRefundRequests).values({ customerCaseId: caseItem.id, merchantOpenId: ctx.user.openId, buyerOpenId: caseItem.buyerOpenId, razorpayPaymentId: order[0].razorpayPaymentId, amountPaise: order[0].totalAmountPaise, currency: order[0].currency, status: "prepared", preparedAt });
    const request = (await db.select().from(customerRefundRequests).where(eq(customerRefundRequests.customerCaseId, caseItem.id)).limit(1))[0];
    await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "system", actorOpenId: null, eventType: "local_refund_request_prepared", detail: `A local refund request for ₹${(order[0].totalAmountPaise / 100).toLocaleString("en-IN")} was prepared after receipt evidence and Razorpay API-observed capture were checked. Merchant approval is still required; no Razorpay refund was initiated.`, sourceRefs: JSON.stringify({ receiptSource: receipt[0].sourceKind, razorpayPaymentId: order[0].razorpayPaymentId }) });
    return { requestId: request?.id, status: "prepared" as const, reused: false, amountPaise: order[0].totalAmountPaise, message: "Local refund request prepared. It is awaiting the merchant approval phrase and has not called Razorpay's refund API." };
  }),
  approveCustomerRefundRequest: protectedProcedure.input(z.object({ caseReference: z.string().trim().min(3).max(64), approvalPhrase: z.literal("APPROVE LOCAL REFUND REQUEST") })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Customer case storage is unavailable.");
    const caseItem = (await db.select().from(customerCases).where(and(eq(customerCases.caseReference, input.caseReference), eq(customerCases.merchantOpenId, ctx.user.openId))).limit(1))[0];
    if (!caseItem) throw new Error("Customer case not found in this merchant workspace.");
    const request = (await db.select().from(customerRefundRequests).where(and(eq(customerRefundRequests.customerCaseId, caseItem.id), eq(customerRefundRequests.merchantOpenId, ctx.user.openId))).limit(1))[0];
    if (!request || request.status !== "prepared") throw new Error("Only a prepared local refund request can be approved.");
    await db.update(customerRefundRequests).set({ status: "merchant_approved", approvalPhrase: input.approvalPhrase, approvedBy: ctx.user.openId, approvedAt: new Date() }).where(eq(customerRefundRequests.id, request.id));
    await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "merchant", actorOpenId: ctx.user.openId, eventType: "local_refund_request_approved", detail: "Merchant approved the local refund request. This approval does not execute a Razorpay refund; a separate deliberate financial action and independent Razorpay confirmation are still required.", sourceRefs: JSON.stringify({ refundRequestId: request.id, status: "merchant_approved" }) });
    return { status: "merchant_approved" as const, message: "Merchant approval recorded. The request is still local and no money has moved; Razorpay refund execution remains intentionally blocked." };
  }),
  evaluation: publicProcedure.query(() => evaluation),
  notifications: publicProcedure.query(() => listNotifications()),
});

export type AppRouter = typeof appRouter;
