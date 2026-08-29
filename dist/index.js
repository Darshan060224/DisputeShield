// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/db.ts
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, uniqueIndex } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var disputes = mysqlTable("disputes", {
  id: int("id").autoincrement().primaryKey(),
  externalId: varchar("externalId", { length: 128 }).notNull().unique(),
  label: varchar("label", { length: 64 }).notNull().default("product not received"),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("INR"),
  status: mysqlEnum("status", ["new", "review", "approved", "blocked", "exported", "closed"]).notNull().default("new"),
  recommendation: mysqlEnum("recommendation", ["contest", "do_not_contest", "human_review"]).notNull().default("human_review"),
  confidence: int("confidence").notNull().default(0),
  deadlineAt: timestamp("deadlineAt").notNull(),
  evidenceCompleteness: int("evidenceCompleteness").notNull().default(0),
  falseContestCost: decimal("falseContestCost", { precision: 12, scale: 2 }).notNull().default("0"),
  blockedReason: text("blockedReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var evidence = mysqlTable("evidence", {
  id: int("id").autoincrement().primaryKey(),
  disputeId: int("disputeId").notNull(),
  kind: varchar("kind", { length: 64 }).notNull(),
  source: varchar("source", { length: 128 }).notNull(),
  referenceId: varchar("referenceId", { length: 128 }),
  claim: text("claim").notNull(),
  verified: boolean("verified").notNull().default(false),
  conflict: boolean("conflict").notNull().default(false),
  fileKey: varchar("fileKey", { length: 512 }),
  fileUrl: varchar("fileUrl", { length: 1024 }),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var webhookEvents = mysqlTable("webhookEvents", {
  id: int("id").autoincrement().primaryKey(),
  eventId: varchar("eventId", { length: 128 }).notNull().unique(),
  eventType: varchar("eventType", { length: 128 }).notNull(),
  merchantOpenId: varchar("merchantOpenId", { length: 64 }).notNull().default(""),
  signatureVerified: boolean("signatureVerified").notNull().default(false),
  rawMetadata: text("rawMetadata").notNull(),
  disputeId: int("disputeId"),
  externalDisputeId: varchar("externalDisputeId", { length: 128 }),
  externalReasonCode: varchar("externalReasonCode", { length: 160 }),
  externalPhase: varchar("externalPhase", { length: 64 }),
  externalStatus: varchar("externalStatus", { length: 64 }),
  externalRespondBy: int("externalRespondBy"),
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var webhookCaseLinks = mysqlTable("webhookCaseLinks", {
  id: int("id").autoincrement().primaryKey(),
  eventId: varchar("eventId", { length: 128 }).notNull().unique(),
  caseReference: varchar("caseReference", { length: 64 }).notNull(),
  eventFamily: mysqlEnum("eventFamily", ["payment", "qr", "refund", "dispute"]).notNull(),
  signatureVerified: boolean("signatureVerified").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var auditEvents = mysqlTable("auditEvents", {
  id: int("id").autoincrement().primaryKey(),
  disputeId: int("disputeId").notNull(),
  action: varchar("action", { length: 128 }).notNull(),
  actor: varchar("actor", { length: 128 }).notNull(),
  detail: text("detail").notNull(),
  sourceRefs: text("sourceRefs"),
  eventHash: varchar("eventHash", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var exportRecords = mysqlTable("exportRecords", {
  id: int("id").autoincrement().primaryKey(),
  disputeId: int("disputeId").notNull(),
  approvedBy: varchar("approvedBy", { length: 128 }).notNull(),
  approvalPhrase: varchar("approvalPhrase", { length: 128 }).notNull(),
  exportState: mysqlEnum("exportState", ["approved", "exported"]).notNull().default("approved"),
  packetState: mysqlEnum("packetState", ["prepared", "approved"]).notNull().default("prepared"),
  sourceKind: mysqlEnum("sourceKind", ["local", "signed_webhook_external"]).notNull().default("local"),
  externalDisputeId: varchar("externalDisputeId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var paymentIntakes = mysqlTable("paymentIntakes", {
  id: int("id").autoincrement().primaryKey(),
  merchantOpenId: varchar("merchantOpenId", { length: 64 }).notNull(),
  purpose: mysqlEnum("purpose", ["merchant_payment", "evidence_intake"]).notNull().default("merchant_payment"),
  amountPaise: int("amountPaise").notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("INR"),
  receipt: varchar("receipt", { length: 40 }).notNull().unique(),
  razorpayOrderId: varchar("razorpayOrderId", { length: 128 }).notNull().unique(),
  razorpayPaymentId: varchar("razorpayPaymentId", { length: 128 }),
  checkoutSignature: varchar("checkoutSignature", { length: 256 }),
  status: mysqlEnum("status", ["created", "checkout_opened", "client_confirmed", "captured", "failed", "verification_failed"]).notNull().default("created"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  capturedAt: timestamp("capturedAt")
});
var paymentEvidenceEvents = mysqlTable("paymentEvidenceEvents", {
  id: int("id").autoincrement().primaryKey(),
  paymentIntakeId: int("paymentIntakeId").notNull(),
  eventId: varchar("eventId", { length: 128 }).notNull().unique(),
  razorpayPaymentId: varchar("razorpayPaymentId", { length: 128 }).notNull(),
  amountPaise: int("amountPaise").notNull(),
  source: varchar("source", { length: 128 }).notNull().default("Razorpay signed webhook"),
  signatureVerified: boolean("signatureVerified").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var sellerProducts = mysqlTable("sellerProducts", {
  id: int("id").autoincrement().primaryKey(),
  merchantOpenId: varchar("merchantOpenId", { length: 64 }).notNull(),
  sku: varchar("sku", { length: 64 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  unitAmountPaise: int("unitAmountPaise").notNull(),
  inventoryQuantity: int("inventoryQuantity").notNull().default(0),
  status: mysqlEnum("status", ["active", "archived"]).notNull().default("active"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var sellerOrders = mysqlTable("sellerOrders", {
  id: int("id").autoincrement().primaryKey(),
  merchantOpenId: varchar("merchantOpenId", { length: 64 }).notNull(),
  orderReference: varchar("orderReference", { length: 64 }).notNull().unique(),
  productId: int("productId").notNull(),
  productName: varchar("productName", { length: 160 }).notNull(),
  quantity: int("quantity").notNull(),
  totalAmountPaise: int("totalAmountPaise").notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("INR"),
  buyerLabel: varchar("buyerLabel", { length: 120 }).notNull().default("Buyer"),
  buyerOpenId: varchar("buyerOpenId", { length: 64 }),
  shippingRecord: varchar("shippingRecord", { length: 255 }).notNull().default("Merchant shipping record pending"),
  razorpayOrderId: varchar("razorpayOrderId", { length: 128 }).unique(),
  razorpayPaymentId: varchar("razorpayPaymentId", { length: 128 }),
  paymentObservation: mysqlEnum("paymentObservation", ["not_started", "checkout_opened", "client_confirmed", "api_observed", "webhook_verified", "failed"]).notNull().default("not_started"),
  fulfillmentState: mysqlEnum("fulfillmentState", ["unfulfilled", "packed", "shipped", "delivered", "delivery_exception"]).notNull().default("unfulfilled"),
  sourceKind: mysqlEnum("sourceKind", ["merchant_record"]).notNull().default("merchant_record"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var sellerFulfillmentEvents = mysqlTable("sellerFulfillmentEvents", {
  id: int("id").autoincrement().primaryKey(),
  sellerOrderId: int("sellerOrderId").notNull(),
  state: mysqlEnum("state", ["packed", "shipped", "delivered", "delivery_exception"]).notNull(),
  carrier: varchar("carrier", { length: 120 }),
  trackingReference: varchar("trackingReference", { length: 160 }),
  evidenceNote: text("evidenceNote").notNull(),
  sourceKind: mysqlEnum("sourceKind", ["merchant_record"]).notNull().default("merchant_record"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var sellerDisputeScenarios = mysqlTable("sellerDisputeScenarios", {
  id: int("id").autoincrement().primaryKey(),
  sellerOrderId: int("sellerOrderId").notNull(),
  scenarioType: mysqlEnum("scenarioType", ["unauthorized_transaction", "product_not_received", "wrong_amount", "duplicate_payment", "refund_issue"]).notNull(),
  customerClaim: text("customerClaim").notNull(),
  requestedOutcome: mysqlEnum("requestedOutcome", ["case_review", "contest_response", "customer_resolution"]).notNull().default("case_review"),
  recommendation: mysqlEnum("recommendation", ["contest", "do_not_contest", "human_review"]).notNull().default("human_review"),
  scenarioStatus: mysqlEnum("scenarioStatus", ["ready", "reviewed", "closed"]).notNull().default("ready"),
  sourceKind: mysqlEnum("sourceKind", ["demonstration_scenario"]).notNull().default("demonstration_scenario"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var customerOrderAccess = mysqlTable("customerOrderAccess", {
  id: int("id").autoincrement().primaryKey(),
  sellerOrderId: int("sellerOrderId").notNull(),
  merchantOpenId: varchar("merchantOpenId", { length: 64 }).notNull(),
  accessTokenHash: varchar("accessTokenHash", { length: 128 }).notNull().unique(),
  boundBuyerOpenId: varchar("boundBuyerOpenId", { length: 64 }),
  active: boolean("active").notNull().default(true),
  expiresAt: timestamp("expiresAt").notNull(),
  redeemedAt: timestamp("redeemedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var customerCatalogAccess = mysqlTable("customerCatalogAccess", {
  id: int("id").autoincrement().primaryKey(),
  merchantOpenId: varchar("merchantOpenId", { length: 64 }).notNull(),
  accessTokenHash: varchar("accessTokenHash", { length: 128 }).notNull().unique(),
  boundBuyerOpenId: varchar("boundBuyerOpenId", { length: 64 }),
  active: boolean("active").notNull().default(true),
  expiresAt: timestamp("expiresAt").notNull(),
  redeemedAt: timestamp("redeemedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var customerCases = mysqlTable("customerCases", {
  id: int("id").autoincrement().primaryKey(),
  caseReference: varchar("caseReference", { length: 64 }).notNull().unique(),
  sellerOrderId: int("sellerOrderId").notNull(),
  merchantOpenId: varchar("merchantOpenId", { length: 64 }).notNull(),
  buyerOpenId: varchar("buyerOpenId", { length: 64 }).notNull(),
  issueType: mysqlEnum("issueType", ["product_not_received", "partial_delivery", "damaged_or_wrong_item", "return_request", "refund_issue", "wrong_amount", "duplicate_payment", "unauthorized_transaction"]).notNull(),
  customerStatement: text("customerStatement").notNull(),
  returnReason: varchar("returnReason", { length: 160 }),
  status: mysqlEnum("status", ["draft", "evidence_pending", "submitted", "customer_action_required", "merchant_review", "return_authorized", "return_in_transit", "return_received", "resolution_offered", "local_policy_review", "resolved", "closed", "withdrawn"]).notNull().default("draft"),
  merchantNote: text("merchantNote"),
  resolutionSummary: text("resolutionSummary"),
  sourceKind: mysqlEnum("sourceKind", ["customer_local_case"]).notNull().default("customer_local_case"),
  submittedAt: timestamp("submittedAt"),
  closedAt: timestamp("closedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var customerCaseEscalations = mysqlTable("customerCaseEscalations", {
  id: int("id").autoincrement().primaryKey(),
  customerCaseId: int("customerCaseId").notNull().unique(),
  merchantOpenId: varchar("merchantOpenId", { length: 64 }).notNull(),
  ownerLabel: varchar("ownerLabel", { length: 120 }).notNull().default("Merchant review"),
  level: mysqlEnum("level", ["watch", "review", "elevated", "resolved"]).notNull().default("watch"),
  escalationNote: text("escalationNote").notNull(),
  assignedBy: varchar("assignedBy", { length: 64 }).notNull(),
  acknowledgedAt: timestamp("acknowledgedAt"),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var customerCaseAuditExports = mysqlTable("customerCaseAuditExports", {
  id: int("id").autoincrement().primaryKey(),
  customerCaseId: int("customerCaseId").notNull(),
  merchantOpenId: varchar("merchantOpenId", { length: 64 }).notNull(),
  approvedBy: varchar("approvedBy", { length: 64 }).notNull(),
  approvalPhrase: varchar("approvalPhrase", { length: 128 }).notNull(),
  exportVersion: varchar("exportVersion", { length: 32 }).notNull(),
  exportHash: varchar("exportHash", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var customerCaseIntegrityAnchors = mysqlTable("customerCaseIntegrityAnchors", {
  id: int("id").autoincrement().primaryKey(),
  merchantOpenId: varchar("merchantOpenId", { length: 64 }).notNull(),
  customerCaseId: int("customerCaseId").notNull(),
  anchorType: mysqlEnum("anchorType", ["audit_export", "packet_release", "document_checksum", "verified_webhook"]).notNull(),
  sourceRecordId: varchar("sourceRecordId", { length: 128 }).notNull(),
  payloadHash: varchar("payloadHash", { length: 128 }).notNull(),
  previousChainHash: varchar("previousChainHash", { length: 128 }),
  chainHash: varchar("chainHash", { length: 128 }).notNull().unique(),
  anchorVersion: varchar("anchorVersion", { length: 32 }).notNull(),
  createdBy: varchar("createdBy", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull()
}, (table) => ({
  caseTypeSourceUnique: uniqueIndex("customerCaseIntegrityAnchors_case_type_source_unique").on(table.customerCaseId, table.anchorType, table.sourceRecordId)
}));
var customerCaseIntegrityHeads = mysqlTable("customerCaseIntegrityHeads", {
  customerCaseId: int("customerCaseId").primaryKey(),
  merchantOpenId: varchar("merchantOpenId", { length: 64 }).notNull(),
  headChainHash: varchar("headChainHash", { length: 128 }),
  anchorCount: int("anchorCount").notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => ({
  merchantCaseUnique: uniqueIndex("customerCaseIntegrityHeads_merchant_case_unique").on(table.merchantOpenId, table.customerCaseId)
}));
var merchantTeamMemberships = mysqlTable("merchantTeamMemberships", {
  id: int("id").autoincrement().primaryKey(),
  merchantOpenId: varchar("merchantOpenId", { length: 64 }).notNull(),
  memberOpenId: varchar("memberOpenId", { length: 64 }).notNull(),
  role: mysqlEnum("role", ["viewer", "reviewer", "approver"]).notNull().default("viewer"),
  active: boolean("active").notNull().default(true),
  addedBy: varchar("addedBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => ({
  merchantMemberUnique: uniqueIndex("merchantTeamMemberships_merchant_member_unique").on(table.merchantOpenId, table.memberOpenId)
}));
var customerCaseDocuments = mysqlTable("customerCaseDocuments", {
  id: int("id").autoincrement().primaryKey(),
  customerCaseId: int("customerCaseId").notNull(),
  merchantOpenId: varchar("merchantOpenId", { length: 64 }).notNull(),
  buyerOpenId: varchar("buyerOpenId", { length: 64 }).notNull(),
  declaredKind: mysqlEnum("declaredKind", ["return_shipping_receipt", "item_condition", "payment_confirmation", "support_conversation", "delivery_or_tracking", "other"]).notNull(),
  originalName: varchar("originalName", { length: 255 }).notNull(),
  contentType: varchar("contentType", { length: 120 }).notNull(),
  byteSize: int("byteSize").notNull(),
  sha256: varchar("sha256", { length: 128 }).notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var customerDocumentExtractions = mysqlTable("customerDocumentExtractions", {
  id: int("id").autoincrement().primaryKey(),
  customerCaseDocumentId: int("customerCaseDocumentId").notNull().unique(),
  model: varchar("model", { length: 128 }).notNull(),
  status: mysqlEnum("status", ["pending", "complete", "failed"]).notNull().default("pending"),
  documentType: varchar("documentType", { length: 80 }),
  summary: text("summary"),
  fieldsJson: text("fieldsJson"),
  warningsJson: text("warningsJson"),
  overallConfidence: int("overallConfidence").notNull().default(0),
  customerConfirmation: mysqlEnum("customerConfirmation", ["not_reviewed", "confirmed", "corrected", "rejected"]).notNull().default("not_reviewed"),
  customerCorrectionsJson: text("customerCorrectionsJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var customerCaseEvents = mysqlTable("customerCaseEvents", {
  id: int("id").autoincrement().primaryKey(),
  customerCaseId: int("customerCaseId").notNull(),
  actorType: mysqlEnum("actorType", ["customer", "merchant", "system"]).notNull(),
  actorOpenId: varchar("actorOpenId", { length: 64 }),
  eventType: varchar("eventType", { length: 96 }).notNull(),
  detail: text("detail").notNull(),
  sourceRefs: text("sourceRefs"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var customerReturnReceipts = mysqlTable("customerReturnReceipts", {
  id: int("id").autoincrement().primaryKey(),
  customerCaseId: int("customerCaseId").notNull().unique(),
  merchantOpenId: varchar("merchantOpenId", { length: 64 }).notNull(),
  sellerOrderId: int("sellerOrderId").notNull(),
  carrierName: varchar("carrierName", { length: 120 }).notNull(),
  trackingReference: varchar("trackingReference", { length: 160 }).notNull(),
  deliveryPartnerMobileSuffix: varchar("deliveryPartnerMobileSuffix", { length: 4 }),
  sourceKind: mysqlEnum("sourceKind", ["verified_carrier_event", "merchant_confirmed_mobile_record"]).notNull(),
  carrierEventId: varchar("carrierEventId", { length: 128 }),
  signatureVerified: boolean("signatureVerified").notNull().default(false),
  receiptNote: text("receiptNote").notNull(),
  receivedAt: timestamp("receivedAt").notNull(),
  confirmedBy: varchar("confirmedBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var customerRefundRequests = mysqlTable("customerRefundRequests", {
  id: int("id").autoincrement().primaryKey(),
  customerCaseId: int("customerCaseId").notNull().unique(),
  merchantOpenId: varchar("merchantOpenId", { length: 64 }).notNull(),
  buyerOpenId: varchar("buyerOpenId", { length: 64 }).notNull(),
  razorpayPaymentId: varchar("razorpayPaymentId", { length: 128 }).notNull(),
  amountPaise: int("amountPaise").notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("INR"),
  status: mysqlEnum("status", ["prepared", "merchant_approved", "razorpay_confirmed", "blocked"]).notNull().default("prepared"),
  blockedReason: text("blockedReason"),
  approvalPhrase: varchar("approvalPhrase", { length: 128 }),
  approvedBy: varchar("approvedBy", { length: 64 }),
  razorpayRefundId: varchar("razorpayRefundId", { length: 128 }),
  preparedAt: timestamp("preparedAt").notNull(),
  approvedAt: timestamp("approvedAt"),
  confirmedAt: timestamp("confirmedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var evaluationRuns = mysqlTable("evaluationRuns", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  datasetSize: int("datasetSize").notNull(),
  precision: int("precision").notNull(),
  recall: int("recall").notNull(),
  recommendationAccuracy: int("recommendationAccuracy").notNull(),
  evidenceAccuracy: int("evidenceAccuracy").notNull(),
  unsupportedClaimRate: int("unsupportedClaimRate").notNull(),
  falseContestCost: decimal("falseContestCost", { precision: 12, scale: 2 }).notNull(),
  exceptions: int("exceptions").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.AZURE_OPENAI_ENDPOINT ?? process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.AZURE_OPENAI_API_KEY ?? process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/db.ts
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback2) {
    if (fallback2 && fallback2.length > 0) return fallback2;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
function registerStorageProxy(app) {
  app.get("/storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    const { stack: _stack, ...safeData } = shape.data;
    return {
      ...shape,
      data: safeData
    };
  }
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
import { z as z3 } from "zod";

// server/disputeEngine.ts
function validateDisputeCase(input) {
  const requiredKinds = input.requiredKinds ?? ["Payment", "Delivery proof", "Address match"];
  const verified = input.claims.filter((item) => item.verified);
  const missingEvidence = requiredKinds.filter((kind) => {
    const row = input.claims.find((item) => item.kind === kind);
    return !row || !row.verified;
  });
  const conflicts = input.claims.filter((item) => item.claim.toLowerCase().includes("conflict") || item.kind.toLowerCase().includes("conflict"));
  const delivery = input.claims.find((item) => item.kind === "Delivery proof");
  const refund = input.claims.find((item) => item.kind === "Refund" || item.kind === "Refund conflict");
  const evidenceCompleteness = Math.round(verified.length / Math.max(input.claims.length, 1) * 100);
  const fullRefundExists = Boolean(refund?.verified && refund.claim.toLowerCase().includes("full"));
  const policyBlocked = !fullRefundExists && (missingEvidence.length > 0 || conflicts.length > 0 || input.confidence < 70);
  const recommendation = fullRefundExists ? "do_not_contest" : policyBlocked ? "human_review" : "contest";
  return {
    evidenceCompleteness,
    verifiedCount: verified.length,
    missingEvidence,
    conflicts: conflicts.map((item) => item.source),
    deliveryVerified: Boolean(delivery?.verified),
    refundConflict: Boolean(refund && refund.kind.toLowerCase().includes("conflict")),
    policyBlocked,
    recommendation,
    falseContestCost: input.amount,
    unsupportedClaimRate: 0
  };
}
function buildVerifiedDraft(order, amount, claims) {
  const verified = claims.filter((item) => item.verified);
  const citations = verified.map((item) => `[${item.source}]`).join(" ");
  const facts = verified.map((item) => item.claim).join(" ");
  return {
    text: `Payment and order ${order} were matched for \u20B9${amount.toLocaleString("en-IN")}. Verified records: ${facts}`,
    citations,
    unsupportedClaimRate: 0
  };
}

// server/notifications.ts
var eventNotifications = [
  { type: "deadline", title: "Deadline approaching", body: "DSP-1046 requires review in 9h 18m.", tone: "critical", createdAt: (/* @__PURE__ */ new Date()).toISOString() },
  { type: "evidence", title: "Evidence incomplete", body: "Delivery proof is missing for DSP-1046.", tone: "warning", createdAt: (/* @__PURE__ */ new Date()).toISOString() }
];
function recordNotification(item) {
  eventNotifications.unshift({ ...item, createdAt: (/* @__PURE__ */ new Date()).toISOString() });
  eventNotifications.splice(20);
}
function listNotifications() {
  return eventNotifications;
}

// server/razorpayClient.ts
import crypto2 from "node:crypto";
var RAZORPAY_API_BASE = "https://api.razorpay.com/v1";
var RazorpayApiError = class extends Error {
  constructor(message, status, path3) {
    super(message);
    this.status = status;
    this.path = path3;
    this.name = "RazorpayApiError";
  }
};
function credentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay API credentials are not configured.");
  return Buffer.from(`${keyId}:${keySecret}`).toString("base64");
}
function getRazorpayCheckoutMode(keyId = process.env.RAZORPAY_KEY_ID) {
  if (!keyId) throw new Error("Razorpay API credentials are not configured.");
  return keyId.startsWith("rzp_test_") ? "test" : "live";
}
async function razorpayRequest(path3, init = {}) {
  const response = await fetch(`${RAZORPAY_API_BASE}${path3}`, {
    ...init,
    headers: {
      Authorization: `Basic ${credentials()}`,
      "Content-Type": "application/json",
      ...init.headers ?? {}
    },
    // Dashboard reads must fail fast; the caller renders a conservative unavailable state.
    signal: AbortSignal.timeout(5e3)
  });
  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) : {};
  if (!response.ok) {
    const problem = parsed;
    if (response.status === 404 && path3 === "/payments/qr_codes") {
      throw new RazorpayApiError(
        "QR evidence is unavailable because Razorpay QR Codes are not enabled for this account. Enable the QR Code API feature in Razorpay before creating QR evidence.",
        response.status,
        path3
      );
    }
    const detail = problem.error?.description ?? problem.error?.reason ?? `Razorpay request failed (${response.status})`;
    throw new RazorpayApiError(detail, response.status, path3);
  }
  return parsed;
}
async function listRecentRazorpayPayments() {
  return razorpayRequest("/payments?count=1");
}
async function fetchRazorpayPayment(paymentId) {
  return razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);
}
async function createMerchantPaymentOrder(input) {
  return razorpayRequest("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: "INR",
      receipt: input.receipt,
      notes: {
        disputeShieldPurpose: input.purpose,
        disputeShieldMerchant: input.merchantOpenId,
        intake: "merchant_controlled",
        ...input.sellerOrderReference ? { sellerSpaceOrderReference: input.sellerOrderReference } : {}
      }
    })
  });
}
function verifyRazorpayCheckoutSignature(input) {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return false;
  const expected = crypto2.createHmac("sha256", keySecret).update(`${input.orderId}|${input.paymentId}`).digest("hex");
  if (expected.length !== input.signature.length) return false;
  return crypto2.timingSafeEqual(Buffer.from(expected), Buffer.from(input.signature));
}
async function getRazorpayAccountSnapshot() {
  const [payments, refunds, disputes3] = await Promise.all([
    razorpayRequest("/payments?count=100"),
    razorpayRequest("/refunds?count=100"),
    razorpayRequest("/disputes?count=100")
  ]);
  const paymentItems = payments.items ?? [];
  const refundItems = refunds.items ?? [];
  const disputeItems = disputes3.items ?? [];
  const captured = paymentItems.filter((item) => item.status === "captured");
  const processedRefunds = refundItems.filter((item) => item.status === "processed");
  const failed = paymentItems.filter((item) => item.status === "failed");
  const openDisputes = disputeItems.filter((item) => item.status === "open");
  const underReviewDisputes = disputeItems.filter((item) => item.status === "under_review");
  return {
    scope: "latest_100_records",
    collectedAmount: captured.reduce((sum, item) => sum + item.amount, 0) / 100,
    capturedPayments: captured.length,
    refundAmount: processedRefunds.reduce((sum, item) => sum + item.amount, 0) / 100,
    processedRefunds: processedRefunds.length,
    disputedAmount: disputeItems.reduce((sum, item) => sum + (item.amount ?? 0), 0) / 100,
    openDisputes: openDisputes.length,
    underReviewDisputes: underReviewDisputes.length,
    failedPayments: failed.length
  };
}
async function listLiveProductNotReceivedDisputes() {
  const disputes3 = await razorpayRequest("/disputes?count=100");
  return (disputes3.items ?? []).filter((dispute) => {
    const reason = `${dispute.reason ?? ""} ${dispute.reason_code ?? ""}`.replace(/[_-]/g, " ").toLowerCase();
    return reason.includes("product not received");
  });
}
async function listLiveRazorpayDisputes() {
  const disputes3 = await razorpayRequest("/disputes?count=100");
  return disputes3.items ?? [];
}
async function createCaseEvidenceQr(input) {
  const now = Math.floor(Date.now() / 1e3);
  const requestId = crypto2.randomUUID();
  return razorpayRequest("/payments/qr_codes", {
    method: "POST",
    body: JSON.stringify({
      type: "upi_qr",
      name: "DisputeShield evidence verification",
      usage: "single_use",
      fixed_amount: true,
      payment_amount: Math.round(input.amountRupees * 100),
      description: `Evidence verification for ${input.caseId}`,
      close_by: now + 3600,
      notes: {
        disputeShieldCaseId: input.caseId,
        disputeShieldOrderId: input.orderId,
        disputeShieldRequestId: requestId,
        purpose: "payment_evidence_verification"
      }
    })
  });
}

// server/routers.ts
import { and as and2, desc as desc2, eq as eq3, sql as sql2 } from "drizzle-orm";
import crypto6 from "node:crypto";

// server/paymentIntake.ts
function summarizeWebhookVerifiedIntakes(rows) {
  const captured = rows.filter((row) => row.status === "captured");
  return {
    verifiedCapturedPayments: captured.length,
    verifiedCollectedAmount: captured.reduce((sum, row) => sum + row.amountPaise, 0) / 100
  };
}
function shouldCreatePaymentEvidence(input) {
  return input.eventType === "payment.captured" && input.signatureVerified;
}
function checkoutVerificationTransition(signatureVerified) {
  return { status: signatureVerified ? "client_confirmed" : "verification_failed", createsEvidence: false };
}
function verifiedWebhookCaptureTransition(input) {
  if (!shouldCreatePaymentEvidence(input)) return { status: null, createsEvidence: false };
  return { status: "captured", createsEvidence: true };
}

// server/sellerSpace.ts
var SELLER_SCENARIOS = [
  "unauthorized_transaction",
  "product_not_received",
  "wrong_amount",
  "duplicate_payment",
  "refund_issue"
];
function sellerRazorpayObservationState(input) {
  if (!input.razorpayPaymentId) return "no_payment_reference";
  if (!input.apiAvailable) return "api_observation_unavailable";
  return input.apiCaptured ? "api_captured" : "api_not_captured";
}
var scenarioMetadata = {
  unauthorized_transaction: {
    label: "Unauthorized transaction",
    primary: false,
    claim: "I did not make this payment.",
    requiredEvidence: ["Payment reference", "Customer authentication/support record", "Fulfillment status"]
  },
  product_not_received: {
    label: "Product/service not received",
    primary: true,
    claim: "Payment was made, but the product or service was not delivered.",
    requiredEvidence: ["Payment reference", "Shipment or delivery proof", "Address match", "Refund status"]
  },
  wrong_amount: {
    label: "Wrong amount",
    primary: false,
    claim: "I was charged an incorrect amount.",
    requiredEvidence: ["Product price", "Order total", "Razorpay amount"]
  },
  duplicate_payment: {
    label: "Duplicate payment",
    primary: false,
    claim: "I was charged more than once for the same transaction.",
    requiredEvidence: ["Order reference", "Payment references", "Duplicate-payment comparison"]
  },
  refund_issue: {
    label: "Refund issue",
    primary: false,
    claim: "I expected a refund but have not received it.",
    requiredEvidence: ["Refund request", "Refund reference", "Refund status"]
  }
};
function recommendSellerScenario(input) {
  if (!input.paymentObserved) return { recommendation: "human_review", reason: "Payment confirmation is still missing." };
  if (input.scenarioType === "product_not_received") {
    if (input.fulfillmentState === "delivered") return { recommendation: "contest", reason: "Payment and merchant-recorded delivery evidence are available for review." };
    if (input.fulfillmentState === "delivery_exception") return { recommendation: "do_not_contest", reason: "Merchant delivery evidence records an exception; resolve the customer outcome first." };
    return { recommendation: "human_review", reason: "A delivery scan or proof is still required before contesting a product-not-received claim." };
  }
  return { recommendation: "human_review", reason: "This demonstration scenario requires merchant review of the listed evidence sources." };
}
function uniqueLatestSellerScenarios(scenarios) {
  const seen = /* @__PURE__ */ new Set();
  return scenarios.filter((scenario2) => {
    const key = `${scenario2.sellerOrderId}:${scenario2.scenarioType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function sellerReviewReadiness(input) {
  if (!input.paymentObserved) return { score: 0, state: "payment_pending", nextAction: "Confirm the Razorpay payment before reviewing a merchant loss claim." };
  if (input.fulfillmentState === "delivery_exception") return { score: 25, state: "delivery_exception", nextAction: "Resolve the delivery exception or record the customer outcome before contesting the claim." };
  if (input.fulfillmentState !== "delivered") return { score: 25, state: "delivery_proof_missing", nextAction: "Record a delivery milestone and attach the merchant fulfillment note before contesting." };
  return { score: 75, state: "evidence_ready", nextAction: "Review refund status and merchant approval before exporting a response packet." };
}
function inventoryReservationOutcome(input) {
  if (!Number.isInteger(input.availableQuantity) || !Number.isInteger(input.requestedQuantity) || input.requestedQuantity < 1) {
    return { reserved: false, remainingQuantity: input.availableQuantity };
  }
  if (input.availableQuantity < input.requestedQuantity) {
    return { reserved: false, remainingQuantity: input.availableQuantity };
  }
  return { reserved: true, remainingQuantity: input.availableQuantity - input.requestedQuantity };
}

// server/appealPolicy.ts
var claimRequirements = {
  product_not_received: { required: [{ kind: "Payment", weight: 35 }, { kind: "Delivery proof", weight: 40 }, { kind: "Address match", weight: 25 }], threshold: 80 },
  unauthorized_transaction: { required: [{ kind: "Payment", weight: 40 }, { kind: "Customer authentication", weight: 35 }, { kind: "Fulfillment status", weight: 25 }], threshold: 85 },
  wrong_amount: { required: [{ kind: "Product price", weight: 30 }, { kind: "Order total", weight: 30 }, { kind: "Payment", weight: 40 }], threshold: 85 },
  duplicate_payment: { required: [{ kind: "Order reference", weight: 20 }, { kind: "Payment references", weight: 45 }, { kind: "Duplicate-payment comparison", weight: 35 }], threshold: 90 },
  refund_issue: { required: [{ kind: "Refund request", weight: 25 }, { kind: "Refund reference", weight: 35 }, { kind: "Refund status", weight: 40 }], threshold: 85 }
};
function rowFor(claims, kind) {
  return claims.find((claim) => claim.kind.toLowerCase() === kind.toLowerCase());
}
function evaluateAppealPolicy(input) {
  const policy = claimRequirements[input.claimType];
  const missingEvidence = policy.required.filter((requirement) => !rowFor(input.claims, requirement.kind)?.verified).map((requirement) => requirement.kind);
  const rawScore = policy.required.reduce((total, requirement) => total + (rowFor(input.claims, requirement.kind)?.verified ? requirement.weight : 0), 0);
  const conflicts = input.claims.filter((claim) => claim.kind.toLowerCase().includes("conflict") || claim.claim.toLowerCase().includes("conflict"));
  const conflictPenalty = Math.min(40, conflicts.length * 20);
  const score2 = Math.max(0, rawScore - conflictPenalty);
  const conflict = conflicts[0];
  const fullRefund = input.claims.find((claim) => claim.kind === "Refund" && claim.verified && claim.claim.toLowerCase().includes("full"));
  const deliveryException = input.claimType === "product_not_received" && input.fulfillmentState === "delivery_exception";
  const automatedSteps = ["Refresh linked Razorpay facts", "Collect available merchant evidence", "Prepare a verified-facts-only draft", "Create merchant review task"];
  const blockedExternalActions = ["Submit a dispute response", "Issue or approve a refund", "Send an external appeal"];
  if (fullRefund) return { score: score2, rawScore, conflictPenalty, decision: "prepare_customer_resolution", reason: "A verified full refund is present; prepare a customer-resolution review instead of contesting.", automatedSteps, blockedExternalActions, approvalRequired: true, missingEvidence };
  if (deliveryException) return { score: score2, rawScore, conflictPenalty, decision: "prepare_customer_resolution", reason: "A merchant delivery exception is recorded; resolve the customer outcome before considering a contest.", automatedSteps, blockedExternalActions, approvalRequired: true, missingEvidence };
  if (conflict) return { score: score2, rawScore, conflictPenalty, decision: "human_review", reason: `Conflicting evidence applied a ${conflictPenalty}-point policy penalty. Automation can prepare the packet, but a merchant must resolve the conflict.`, automatedSteps, blockedExternalActions, approvalRequired: true, missingEvidence };
  if (score2 >= policy.threshold) return { score: score2, rawScore, conflictPenalty, decision: "prepare_contest", reason: "Required evidence meets the policy threshold. A contest packet may be prepared, but merchant approval is still mandatory.", automatedSteps, blockedExternalActions, approvalRequired: true, missingEvidence };
  return { score: score2, rawScore, conflictPenalty, decision: "human_review", reason: "Required evidence is incomplete. Automation will collect and prepare facts only; it will not submit or resolve the case.", automatedSteps, blockedExternalActions, approvalRequired: true, missingEvidence };
}
function canReleaseAppealPacket(policy) {
  return policy.decision === "prepare_contest" && policy.missingEvidence.length === 0 && policy.approvalRequired;
}

// server/customerCasePolicy.ts
var CUSTOMER_ISSUE_TYPES = [
  "product_not_received",
  "partial_delivery",
  "damaged_or_wrong_item",
  "return_request",
  "refund_issue",
  "wrong_amount",
  "duplicate_payment",
  "unauthorized_transaction"
];
var CUSTOMER_DOCUMENT_KINDS = [
  "return_shipping_receipt",
  "item_condition",
  "payment_confirmation",
  "support_conversation",
  "delivery_or_tracking",
  "other"
];
var CUSTOMER_CASE_READINESS_REQUIREMENTS = {
  product_not_received: [{ kind: "delivery_or_tracking", label: "Delivery or tracking evidence", weight: 0.6 }, { kind: "support_conversation", label: "Support conversation or delivery update", weight: 0.4 }],
  partial_delivery: [{ kind: "delivery_or_tracking", label: "Delivery or tracking evidence", weight: 0.4 }, { kind: "item_condition", label: "Item or packing photo", weight: 0.35 }, { kind: "support_conversation", label: "Support conversation", weight: 0.25 }],
  damaged_or_wrong_item: [{ kind: "item_condition", label: "Item-condition photo or document", weight: 0.55 }, { kind: "delivery_or_tracking", label: "Delivery or tracking evidence", weight: 0.25 }, { kind: "support_conversation", label: "Order or product support evidence", weight: 0.2 }],
  return_request: [{ kind: "item_condition", label: "Item-condition photo or document", weight: 0.6 }, { kind: "support_conversation", label: "Order or support evidence", weight: 0.4 }],
  refund_issue: [{ kind: "payment_confirmation", label: "Payment confirmation", weight: 0.6 }, { kind: "support_conversation", label: "Support conversation", weight: 0.4 }],
  wrong_amount: [{ kind: "payment_confirmation", label: "Payment confirmation", weight: 0.7 }, { kind: "support_conversation", label: "Order or invoice support evidence", weight: 0.3 }],
  duplicate_payment: [{ kind: "payment_confirmation", label: "Payment confirmation", weight: 0.7 }, { kind: "support_conversation", label: "Transaction reference or support evidence", weight: 0.3 }],
  unauthorized_transaction: [{ kind: "payment_confirmation", label: "Payment confirmation", weight: 0.5 }, { kind: "support_conversation", label: "Factual support statement", weight: 0.5 }]
};
function calculateCustomerCaseEvidenceReadiness(input) {
  const available = new Set(input.documentKinds);
  const requirements = CUSTOMER_CASE_READINESS_REQUIREMENTS[input.issueType];
  const present = requirements.filter((requirement) => available.has(requirement.kind));
  const missing = requirements.filter((requirement) => !available.has(requirement.kind));
  const score2 = Math.round(present.reduce((sum, requirement) => sum + requirement.weight, 0) * 100);
  return { score: score2, required: requirements, present, missing, unrelatedDocumentKinds: Array.from(available).filter((kind) => !requirements.some((requirement) => requirement.kind === kind)) };
}
function isCustomerScopedRecord(input) {
  return input.record.merchantOpenId === input.merchantOpenId && input.record.buyerOpenId === input.buyerOpenId;
}
var CUSTOMER_CASE_GUIDANCE = {
  product_not_received: {
    label: "Product not received",
    description: "Tell us what was expected, the promised delivery context, and any delivery or support evidence you have.",
    evidence: ["Delivery or tracking evidence", "Support conversation or delivery update"],
    merchantOnly: "Only the merchant can verify fulfilment records and decide a local resolution."
  },
  partial_delivery: {
    label: "Item missing from delivery",
    description: "Describe what was received, what was missing, and any delivery or packing evidence you have.",
    evidence: ["Delivery or tracking evidence", "Item or packing photo", "Support conversation"],
    merchantOnly: "Only the merchant can compare the order, fulfilment, and packing records before offering a local resolution."
  },
  damaged_or_wrong_item: {
    label: "Damaged or wrong item",
    description: "Describe the item received and the mismatch or condition issue. Add clear item-condition evidence if available.",
    evidence: ["Item-condition photo or document", "Order or product record", "Delivery or tracking evidence"],
    merchantOnly: "Only the merchant can assess the order record and authorize a return or offer a local resolution."
  },
  return_request: {
    label: "Return request",
    description: "Describe the return reason and provide truthful item-condition evidence if available.",
    evidence: ["Item-condition photo or document", "Order or support evidence"],
    merchantOnly: "Only the merchant can issue local return instructions or authorize a return."
  },
  refund_issue: {
    label: "Refund not received",
    description: "State the expected refund context and provide a payment or support record if available.",
    evidence: ["Payment confirmation", "Support conversation"],
    merchantOnly: "Only the merchant can verify a refund record; no refund is issued automatically."
  },
  wrong_amount: {
    label: "Wrong amount",
    description: "Describe the amount you expected and the amount you believe was charged.",
    evidence: ["Payment confirmation", "Order or invoice record"],
    merchantOnly: "Only the merchant can compare the order and payment records and offer a resolution."
  },
  duplicate_payment: {
    label: "Duplicate payment",
    description: "Provide the two payment references or a statement showing the suspected duplicate.",
    evidence: ["Payment confirmation", "Transaction reference"],
    merchantOnly: "Only the merchant can verify payment records; no payment is reversed automatically."
  },
  unauthorized_transaction: {
    label: "Unauthorized transaction",
    description: "Provide a factual statement and any relevant transaction/support evidence. This requires human review.",
    evidence: ["Payment confirmation", "Factual support statement"],
    merchantOnly: "This is routed to a merchant human review; the system does not make a fraud finding or submit a chargeback."
  }
};
var merchantTransitions = {
  draft: {},
  evidence_pending: {},
  submitted: { start_review: "merchant_review" },
  customer_action_required: { start_review: "merchant_review" },
  merchant_review: {
    request_evidence: "customer_action_required",
    authorize_return: "return_authorized",
    offer_resolution: "resolution_offered",
    route_policy_review: "local_policy_review",
    close: "closed"
  },
  return_authorized: { offer_resolution: "resolution_offered", close: "closed" },
  return_in_transit: { record_return_received: "return_received" },
  return_received: { offer_resolution: "resolution_offered", close: "closed" },
  resolution_offered: { close: "closed" },
  local_policy_review: { offer_resolution: "resolution_offered", close: "closed" },
  resolved: {},
  closed: {},
  withdrawn: {}
};
var customerTransitions = {
  draft: { submit: "submitted", withdraw: "withdrawn" },
  evidence_pending: { submit: "submitted", withdraw: "withdrawn" },
  submitted: {},
  customer_action_required: { provide_evidence: "evidence_pending", withdraw: "withdrawn" },
  merchant_review: {},
  return_authorized: { mark_return_in_transit: "return_in_transit" },
  return_in_transit: {},
  return_received: {},
  resolution_offered: { accept_resolution: "resolved" },
  local_policy_review: {},
  resolved: {},
  closed: {},
  withdrawn: {}
};
function transitionCustomerCase(input) {
  if (input.actor === "merchant" && input.action === "authorize_return" && !["return_request", "damaged_or_wrong_item"].includes(input.issueType)) {
    throw new Error("A return can only be authorized for a customer return request or a damaged/wrong item case.");
  }
  const transitions = input.actor === "merchant" ? merchantTransitions : customerTransitions;
  const next = transitions[input.status][input.action];
  if (!next) throw new Error(`Action '${input.action}' is not permitted while the case is ${input.status.replaceAll("_", " ")}.`);
  return next;
}

// server/universalResolution.ts
var requiredEvidence = {
  product_not_received: ["delivery_or_tracking", "support_conversation"],
  partial_delivery: ["item_condition", "delivery_or_tracking"],
  damaged_or_wrong_item: ["item_condition", "delivery_or_tracking"],
  return_request: ["item_condition"],
  refund_issue: ["payment_confirmation", "support_conversation"],
  wrong_amount: ["payment_confirmation"],
  duplicate_payment: ["payment_confirmation"],
  unauthorized_transaction: ["payment_confirmation", "support_conversation"]
};
function evidenceGaps(fact) {
  return requiredEvidence[fact.issueType].filter((kind) => !fact.documentKinds.includes(kind));
}
function buildUniversalResolutionRecommendation(fact) {
  const missingEvidence = evidenceGaps(fact);
  const nextActions = [];
  const blockedActions = ["Issue a refund automatically", "Submit an external dispute or appeal", "Classify a customer as fraudulent", "Claim carrier verification without a trusted event"];
  if (fact.hasUnreviewedExtraction) nextActions.push("Ask the customer to confirm or correct OCR candidate facts");
  if (missingEvidence.length) nextActions.push(`Request ${missingEvidence.map((kind) => kind.replaceAll("_", " ")).join(" and ")}`);
  if (!["captured", "api_observed", "webhook_verified"].includes(fact.paymentObservation)) nextActions.push("Verify the payment state from a trusted Razorpay source before any financial resolution");
  if (fact.issueType === "product_not_received" || fact.issueType === "partial_delivery") {
    nextActions.push(fact.fulfilmentState === "delivery_exception" ? "Resolve the merchant delivery exception and contact the customer" : "Compare fulfilment, tracking, and address records");
  }
  if (fact.issueType === "damaged_or_wrong_item" || fact.issueType === "return_request") {
    nextActions.push(fact.status === "merchant_review" ? "Decide whether to authorize a return" : "Review item-condition evidence before a return decision");
  }
  if (fact.issueType === "refund_issue") {
    nextActions.push(fact.refundConfirmed ? "Share the confirmed refund reference with the customer" : "Reconcile the refund request against a signed Razorpay refund event");
  }
  if (fact.issueType === "wrong_amount" || fact.issueType === "duplicate_payment") nextActions.push("Reconcile order and payment references in merchant review");
  if (fact.issueType === "unauthorized_transaction") nextActions.push("Route to human merchant review; do not infer fraud from this claim");
  if (fact.status === "return_in_transit" && !fact.returnReceiptRecorded) nextActions.push("Wait for a trusted carrier event or clearly labelled merchant receipt confirmation");
  return {
    readiness: fact.hasUnreviewedExtraction || missingEvidence.length ? "evidence_pending" : "merchant_review_ready",
    missingEvidence,
    nextActions: Array.from(new Set(nextActions)),
    blockedActions,
    rationale: "Recommendations combine the customer-selected issue type with source-labelled evidence availability. They are preparation steps, not a finding about the customer or an instruction to move money."
  };
}
function buildMerchantOperationalSignals(cases) {
  const groups = {
    delivery_friction: cases.filter((item) => ["product_not_received", "partial_delivery", "damaged_or_wrong_item"].includes(item.issueType)).length,
    return_friction: cases.filter((item) => ["return_request", "damaged_or_wrong_item"].includes(item.issueType) && ["submitted", "merchant_review", "return_authorized", "return_in_transit", "return_received"].includes(item.status)).length,
    payment_friction: cases.filter((item) => ["wrong_amount", "duplicate_payment", "unauthorized_transaction"].includes(item.issueType)).length,
    refund_friction: cases.filter((item) => item.issueType === "refund_issue").length
  };
  const definitions = {
    delivery_friction: ["Delivery-friction pattern", "Review fulfilment, carrier, and support processes."],
    return_friction: ["Open return-friction pattern", "Review return instructions and receipt turnaround."],
    payment_friction: ["Payment-friction pattern", "Review order/payment reconciliation and checkout controls."],
    refund_friction: ["Refund-delay pattern", "Review refund queue, customer communications, and confirmation records."]
  };
  return Object.entries(groups).flatMap(([key, count]) => {
    if (!count) return [];
    const [title, action] = definitions[key];
    return [{
      key,
      level: count >= 5 ? "elevated" : count >= 3 ? "review" : "watch",
      count,
      title,
      action,
      boundary: "This is an aggregate merchant-operations signal. It is not a customer risk score, fraud label, or automated case decision."
    }];
  });
}

// server/customerDocumentOcr.ts
var MODEL_NAME = "gpt-5-6-luna";
var AZURE_OPENAI_URL = "https://darshan-ai.openai.azure.com/openai/deployments/gpt-5-6-luna/chat/completions?api-version=2025-01-01-preview";
function clampConfidence(value) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0;
}
function cleanExtraction(value) {
  if (!value || typeof value !== "object") throw new Error("AI returned an invalid evidence-assistance object.");
  const candidate = value;
  return {
    documentType: typeof candidate.documentType === "string" ? candidate.documentType.slice(0, 80) : "unknown",
    summary: typeof candidate.summary === "string" ? candidate.summary.slice(0, 1e3) : "No reliable summary was produced.",
    overallConfidence: clampConfidence(candidate.overallConfidence),
    fields: Array.isArray(candidate.fields) ? candidate.fields.slice(0, 20).map((field) => ({
      key: typeof field?.key === "string" ? field.key.slice(0, 80) : "unknown_field",
      value: typeof field?.value === "string" ? field.value.slice(0, 500) : "",
      confidence: clampConfidence(field?.confidence),
      relation: field?.relation === "supports" || field?.relation === "contradicts" ? field.relation : "neutral"
    })) : [],
    warnings: Array.isArray(candidate.warnings) ? candidate.warnings.filter((warning) => typeof warning === "string").slice(0, 10).map((warning) => warning.slice(0, 400)) : ["Evidence assistance needs customer and merchant review."]
  };
}
function parseJsonCandidate(text2) {
  const trimmed = text2.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}
async function extractCustomerDocument(input) {
  const apiKey = process.env.AZURE_OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("AI evidence assistance is not configured.");
  const instruction = [
    "You are an evidence-assistance tool for a local merchant review.",
    "Extract only visible or explicitly stated candidate facts from the customer-supplied file.",
    "Never invent unavailable text, infer payment capture, infer delivery, accuse a customer, or recommend an automatic refund, dispute, or chargeback.",
    "Return JSON only with documentType, summary, overallConfidence (0-100), fields [{key,value,confidence,relation}], and warnings.",
    `Linked order reference: ${input.linkedOrderReference}. Customer issue: ${input.issueType}.`
  ].join(" ");
  const isImage = input.contentType.startsWith("image/");
  const userContent = [{ type: "text", text: instruction }];
  if (isImage) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${input.contentType};base64,${input.data.toString("base64")}` }
    });
  } else {
    userContent.push({
      type: "text",
      text: `[Document Content]: ${input.data.toString("utf-8")}`
    });
  }
  const response = await fetch(AZURE_OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: "You are a helpful document extraction assistant. Output strictly valid JSON." },
        { role: "user", content: userContent }
      ],
      response_format: { type: "json_object" },
      temperature: 0
    })
  });
  if (!response.ok) throw new Error(`AI evidence assistance was unavailable (HTTP ${response.status}).`);
  const payload = await response.json();
  const text2 = payload.choices?.[0]?.message?.content?.trim();
  if (!text2) throw new Error("AI evidence assistance returned no structured candidate facts.");
  return { model: MODEL_NAME, extraction: cleanExtraction(parseJsonCandidate(text2)) };
}

// server/storage.ts
function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function appendHashSuffix(relKey) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = appendHashSuffix(normalizeKey(relKey));
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` }
  });
  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }
  const { url: s3Url } = await presignResp.json();
  if (!s3Url) throw new Error("Forge returned empty presign URL");
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob
  });
  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }
  return { key, url: `/storage/${key}` };
}

// server/requestCache.ts
import { Redis } from "ioredis";
var localEntries = /* @__PURE__ */ new Map();
var redisClient = null;
var redisConnectionFailed = false;
function getRedisClient() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl || redisUrl.trim().length === 0) {
    return null;
  }
  if (redisConnectionFailed) {
    return null;
  }
  if (!redisClient) {
    try {
      redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy(times) {
          if (times > 3) {
            redisConnectionFailed = true;
            return null;
          }
          return Math.min(times * 100, 2e3);
        }
      });
      redisClient.on("error", (err) => {
        console.warn("[RedisCache] Redis client warning/error:", err.message);
      });
    } catch (err) {
      console.warn("[RedisCache] Failed to initialize Redis client, using local cache fallback:", err);
      redisConnectionFailed = true;
      redisClient = null;
    }
  }
  return redisClient;
}
async function getOrSetScopedCache(key, ttlMs, loader) {
  const redis = getRedisClient();
  if (redis) {
    try {
      const cachedStr = await redis.get(key);
      if (cachedStr !== null) {
        return JSON.parse(cachedStr);
      }
    } catch (err) {
      console.warn(`[RedisCache] get failed for key "${key}", falling back to memory:`, err);
    }
  }
  const current = localEntries.get(key);
  if (current && current.expiresAt > Date.now()) {
    return current.value;
  }
  const value = await loader();
  localEntries.set(key, { value, expiresAt: Date.now() + Math.max(1, ttlMs) });
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), "PX", Math.max(1, ttlMs));
    } catch (err) {
      console.warn(`[RedisCache] set failed for key "${key}":`, err);
    }
  }
  return value;
}
async function invalidateScopedCache(prefix) {
  for (const key of Array.from(localEntries.keys())) {
    if (key.startsWith(prefix)) {
      localEntries.delete(key);
    }
  }
  const redis = getRedisClient();
  if (redis) {
    try {
      const keys = await redis.keys(`${prefix}*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (err) {
      console.warn(`[RedisCache] invalidate failed for prefix "${prefix}":`, err);
    }
  }
}

// server/customerOrderSummary.ts
var PAYMENT_SOURCES = {
  not_started: "local_order_created",
  checkout_opened: "browser_checkout_opened",
  client_confirmed: "checkout_signature_verified",
  api_observed: "razorpay_api_observed",
  webhook_verified: "signed_razorpay_webhook_verified",
  failed: "checkout_failed"
};
function summarizeBuyerOrders(input) {
  const visibleOrders = input.orders.filter((order) => order.merchantOpenId === input.merchantOpenId && order.buyerOpenId === input.buyerOpenId);
  const latestCaseByOrder = /* @__PURE__ */ new Map();
  for (const caseItem of input.cases) {
    if (caseItem.merchantOpenId !== input.merchantOpenId || caseItem.buyerOpenId !== input.buyerOpenId || !visibleOrders.some((order) => order.id === caseItem.sellerOrderId) || latestCaseByOrder.has(caseItem.sellerOrderId)) continue;
    latestCaseByOrder.set(caseItem.sellerOrderId, caseItem);
  }
  return visibleOrders.map((order) => {
    const resolution = latestCaseByOrder.get(order.id);
    return {
      id: order.id,
      orderReference: order.orderReference,
      productName: order.productName,
      quantity: order.quantity,
      totalAmountPaise: order.totalAmountPaise,
      currency: order.currency,
      paymentObservation: order.paymentObservation,
      paymentSource: PAYMENT_SOURCES[order.paymentObservation],
      fulfillmentState: order.fulfillmentState,
      fulfillmentSource: "merchant_record",
      createdAt: order.createdAt,
      localResolution: resolution ? {
        caseReference: resolution.caseReference,
        issueType: resolution.issueType,
        status: resolution.status,
        source: "local_customer_case"
      } : null
    };
  });
}

// server/universalDisputeControl.ts
var knownPhases = /* @__PURE__ */ new Set(["fraud", "retrieval", "chargeback", "pre_arbitration", "arbitration"]);
function externalDisputeEvidencePolicy(reasonCode, reason) {
  const normalized = `${reasonCode ?? ""} ${reason ?? ""}`.toLowerCase().replace(/[_-]+/g, " ");
  if (/(refund|credit not received)/.test(normalized)) return { family: "refund", requiredKinds: ["Payment", "Refund status", "Customer communication"], evidenceHints: ["Refund reference", "Payment reference", "Customer communication"] };
  if (/(duplicate|charged twice)/.test(normalized)) return { family: "duplicate_payment", requiredKinds: ["Payment", "Order reference", "Payment reconciliation"], evidenceHints: ["Payment references", "Order reference", "Reconciliation record"] };
  if (/(unauthori[sz]ed|fraud|cardholder)/.test(normalized)) return { family: "unauthorized_transaction", requiredKinds: ["Payment", "Checkout authentication", "Merchant record"], evidenceHints: ["Payment reference", "Checkout authentication record", "Customer communication"] };
  if (/(amount|overcharg|incorrect charge)/.test(normalized)) return { family: "wrong_amount", requiredKinds: ["Payment", "Order reference", "Invoice"], evidenceHints: ["Payment reference", "Order reference", "Invoice"] };
  if (/(damaged|wrong item|not as described|partial)/.test(normalized)) return { family: "fulfilment_quality", requiredKinds: ["Payment", "Delivery proof", "Item condition"], evidenceHints: ["Delivery proof", "Item-condition record", "Order reference"] };
  return { family: "delivery_or_service", requiredKinds: ["Payment", "Delivery proof", "Address match"], evidenceHints: ["Payment reference", "Delivery proof", "Address or service record"] };
}
function humanizeExternalDisputeValue(value) {
  if (!value) return "Awaiting Razorpay detail";
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function buildExternalDisputeControl(input, now = Date.now()) {
  const deadlineAt = input.respondBy ? new Date(input.respondBy * 1e3) : null;
  const hoursToDeadline = deadlineAt ? Math.round((deadlineAt.getTime() - now) / 36e5) : null;
  const evidence2 = input.evidence ?? {};
  const evidenceFields = Object.entries(evidence2).filter(([key, value]) => key !== "amount" && value !== null && value !== void 0 && (!Array.isArray(value) || value.length > 0)).map(([key]) => humanizeExternalDisputeValue(key));
  const phase = knownPhases.has(input.phase ?? "") ? input.phase : "unclassified";
  const deadlineState = hoursToDeadline === null ? "deadline_unavailable" : hoursToDeadline < 0 ? "deadline_elapsed" : hoursToDeadline <= 24 ? "urgent" : hoursToDeadline <= 72 ? "watch" : "scheduled";
  const evidencePolicy = externalDisputeEvidencePolicy(input.reasonCode, input.reason);
  return {
    externalId: input.id,
    reason: humanizeExternalDisputeValue(input.reasonCode ?? input.reason),
    reasonCode: input.reasonCode ?? null,
    status: input.status ?? "open",
    phase,
    phaseLabel: humanizeExternalDisputeValue(phase),
    deadlineAt,
    deadlineState,
    deadlineLabel: deadlineAt ? deadlineAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Awaiting Razorpay deadline",
    hoursToDeadline,
    evidenceFields,
    evidencePolicy,
    source: "signed Razorpay webhook or Razorpay API observation",
    sourceBoundary: "bank_initiated_external_dispute",
    safeNextStep: `Review ${evidencePolicy.evidenceHints.join(", ")}. Prepare a packet only after a merchant approves it; no external response is submitted automatically.`,
    blockedActions: ["Create a dispute from Customer Space", "Auto-submit a contest", "Auto-accept or refund", "Infer a bank outcome"]
  };
}

// server/signedWebhookDisputeProjection.ts
function projectLatestSignedWebhookDisputes(records, merchantOpenId) {
  const latestByDispute = /* @__PURE__ */ new Map();
  for (const record of records) {
    if (record.merchantOpenId !== merchantOpenId || !record.signatureVerified || !record.eventType.startsWith("payment.dispute.") || !record.externalDisputeId || latestByDispute.has(record.externalDisputeId)) continue;
    let raw = {};
    try {
      raw = JSON.parse(record.rawMetadata);
    } catch {
      continue;
    }
    latestByDispute.set(record.externalDisputeId, { ...record, dispute: raw?.payload?.dispute?.entity ?? {}, payment: raw?.payload?.payment?.entity ?? {} });
  }
  return Array.from(latestByDispute.values());
}

// server/webhookDisputeLedger.ts
function buildVerifiedWebhookLedgerValues(input) {
  const dispute = input.payload?.payload?.dispute?.entity;
  const payment = input.payload?.payload?.payment?.entity;
  return {
    eventId: input.eventId,
    eventType: input.eventType,
    merchantOpenId: input.merchantOpenId,
    signatureVerified: true,
    rawMetadata: input.rawMetadata,
    disputeId: Number(String(dispute?.notes?.disputeShieldCaseId ?? payment?.notes?.disputeShieldCaseId ?? "").replace("DSP-", "")) || null,
    externalDisputeId: dispute?.id ? String(dispute.id) : null,
    externalReasonCode: dispute?.reason_code ? String(dispute.reason_code) : null,
    externalPhase: dispute?.phase ? String(dispute.phase) : null,
    externalStatus: dispute?.status ? String(dispute.status) : null,
    externalRespondBy: Number(dispute?.respond_by) || null,
    processedAt: /* @__PURE__ */ new Date()
  };
}
function mergeCommandCentreSources(webhook, local, api) {
  const verifiedExternalIds = new Set(webhook.map((item) => item.externalId));
  return [...webhook, ...local, ...api.filter((item) => !verifiedExternalIds.has(item.externalId))];
}

// server/proactiveRiskIntelligence.ts
var evidenceByIssue = {
  product_not_received: ["delivery_or_tracking", "support_conversation"],
  partial_delivery: ["delivery_or_tracking", "item_condition"],
  damaged_or_wrong_item: ["item_condition", "delivery_or_tracking"],
  return_request: ["item_condition"],
  refund_issue: ["payment_confirmation", "support_conversation"],
  wrong_amount: ["payment_confirmation"],
  duplicate_payment: ["payment_confirmation"],
  unauthorized_transaction: ["payment_confirmation", "support_conversation"]
};
var activeStatuses = ["draft", "evidence_pending", "submitted", "merchant_review", "customer_action_required", "return_authorized", "return_in_transit", "return_received", "resolution_offered"];
function priority(ageHours) {
  return ageHours >= 72 ? "elevated" : ageHours >= 24 ? "review" : "watch";
}
function buildProactiveRiskIntelligence(cases, now = /* @__PURE__ */ new Date()) {
  const signals = [];
  const slaBoard = [];
  const freshness = [];
  const graph = [];
  for (const item of cases) {
    const ageHours = Math.max(0, Math.floor((now.getTime() - item.updatedAt.getTime()) / 36e5));
    const required = evidenceByIssue[item.issueType];
    const missing = required.filter((kind) => !item.documentKinds.includes(kind)).map((kind) => kind.replaceAll("_", " "));
    const completeness = Math.round((required.length - missing.length) / Math.max(required.length, 1) * 100);
    const active = activeStatuses.includes(item.status);
    freshness.push({ caseReference: item.caseReference, completeness, missing, stale: active && ageHours >= 48, source: "local customer case + document metadata", nextAction: missing.length ? `Request ${missing.join(" and ")}` : item.hasUnreviewedExtraction ? "Ask customer to confirm OCR candidate facts" : "Evidence set is complete for the local policy" });
    if (item.fulfilmentState === "delivery_exception" || item.issueType === "product_not_received" && item.fulfilmentState === "unfulfilled") {
      signals.push({ key: `${item.caseReference}:fulfilment`, level: item.fulfilmentState === "delivery_exception" ? "elevated" : "review", title: "Fulfilment Risk Sentinel", caseReference: item.caseReference, source: "merchant fulfilment record", why: item.fulfilmentState === "delivery_exception" ? "A delivery exception is recorded while the case remains active." : "A non-delivery issue is active without a fulfilment record.", nextAction: "Reconcile merchant fulfilment, tracking, and customer contact facts.", boundary: "This is operational triage only. It does not decide customer intent, delivery outcome, refund, or external dispute action." });
    }
    if (missing.length || item.hasUnreviewedExtraction) {
      signals.push({ key: `${item.caseReference}:freshness`, level: missing.length >= 2 ? "elevated" : "review", title: "Evidence Freshness Monitor", caseReference: item.caseReference, source: "customer documents + local policy", why: missing.length ? `Missing ${missing.join(" and ")}.` : "OCR candidate facts have not been confirmed by the customer.", nextAction: missing.length ? `Request ${missing.join(" and ")}` : "Request customer confirmation or correction of OCR candidate facts.", boundary: "The monitor can request and organise evidence only; it never invents, alters, or submits evidence." });
    }
    if (active) {
      const level = priority(ageHours);
      const owner = item.status === "customer_action_required" ? "customer" : "merchant";
      const nextAction = owner === "customer" ? "Await requested clarification or evidence." : item.status === "return_in_transit" && !item.returnReceiptRecorded ? "Track return receipt before assessing refund readiness." : "Complete the next factual merchant review step.";
      slaBoard.push({ caseReference: item.caseReference, level, ageHours, nextAction, owner, boundary: "SLA recovery records work priority only. It cannot send communications, approve refunds, or initiate external action." });
    }
    const nodes = [
      { id: "order", label: "Order", source: "merchant order record", state: "observed" },
      { id: "payment", label: "Payment", source: item.paymentObservation === "webhook_verified" ? "signed Razorpay webhook" : "Razorpay API/browser observation", state: ["webhook_verified", "captured", "api_observed"].includes(item.paymentObservation) ? "verified" : "observed" },
      { id: "fulfilment", label: "Fulfilment", source: "merchant fulfilment record", state: item.fulfilmentState === "delivered" ? "verified" : item.fulfilmentState === "delivery_exception" ? "missing" : "observed" },
      { id: "evidence", label: "Evidence", source: "protected customer documents", state: missing.length || item.hasUnreviewedExtraction ? "missing" : "verified" },
      { id: "resolution", label: "Local resolution", source: "customer case timeline", state: item.refundConfirmed ? "verified" : "observed" }
    ];
    graph.push({ caseReference: item.caseReference, nodes, edges: [["order", "payment"], ["order", "fulfilment"], ["fulfilment", "evidence"], ["evidence", "resolution"]] });
  }
  const outcomeLearning = {
    observedLocalResolutions: cases.filter((item) => ["resolved", "closed"].includes(item.status)).length,
    withdrawnLocalCases: cases.filter((item) => item.status === "withdrawn").length,
    externalOutcomeRecords: 0,
    status: "awaiting_merchant_confirmed_external_outcomes",
    boundary: "Outcome learning changes no decision automatically. External win/loss learning begins only when a merchant records a confirmed outcome with its source reference."
  };
  return { signals, slaBoard: slaBoard.sort((a, b) => b.ageHours - a.ageHours), freshness, graph, outcomeLearning, boundary: "Proactive Risk Intelligence is an explainable merchant-operations layer. It cannot deny a case, profile a customer, issue/refuse money, submit a contest, or trigger a bank/Razorpay action." };
}

// server/riskNarrative.ts
import crypto3 from "node:crypto";

// server/_core/llm.ts
var ensureArray = (value) => Array.isArray(value) ? value : [value];
var normalizeContentPart = (part) => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }
  if (part.type === "text") {
    return part;
  }
  if (part.type === "image_url") {
    return part;
  }
  if (part.type === "file_url") {
    return part;
  }
  throw new Error("Unsupported message content part");
};
var normalizeMessage = (message) => {
  const { role, name, tool_call_id } = message;
  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content).map((part) => typeof part === "string" ? part : JSON.stringify(part)).join("\n");
    return {
      role,
      name,
      tool_call_id,
      content
    };
  }
  const contentParts = ensureArray(message.content).map(normalizeContentPart);
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text
    };
  }
  return {
    role,
    name,
    content: contentParts
  };
};
var normalizeToolChoice = (toolChoice, tools) => {
  if (!toolChoice) return void 0;
  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }
  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }
    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }
    return {
      type: "function",
      function: { name: tools[0].function.name }
    };
  }
  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name }
    };
  }
  return toolChoice;
};
var resolveApiUrl = () => {
  if (!ENV.forgeApiUrl || ENV.forgeApiUrl.trim().length === 0) {
    throw new Error("BUILT_IN_FORGE_API_URL is not configured for LLM");
  }
  return `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`;
};
var assertApiKey = () => {
  if (!ENV.forgeApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
};
var normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema
}) => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }
  const schema = outputSchema || output_schema;
  if (!schema) return void 0;
  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }
  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...typeof schema.strict === "boolean" ? { strict: schema.strict } : {}
    }
  };
};
var RETRY_MAX_RETRIES = 4;
var RETRY_BASE_DELAY_MS = 500;
var RETRY_MAX_DELAY_MS = 3e4;
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var parseRetryAfter = (value) => {
  if (!value) return void 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1e3);
  const at2 = Date.parse(value);
  return Number.isNaN(at2) ? void 0 : Math.max(0, at2 - Date.now());
};
var computeBackoffDelay = (attempt, retryAfterMs) => {
  const cap = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
  const jittered = cap / 2 + Math.random() * (cap / 2);
  return Math.min(Math.max(jittered, retryAfterMs ?? 0), RETRY_MAX_DELAY_MS);
};
var fetchWithBackoff = async (url, init) => {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok || attempt === RETRY_MAX_RETRIES) {
        return response;
      }
      const retryAfterMs = parseRetryAfter(
        response.headers.get("retry-after")
      );
      try {
        await response.body?.cancel();
      } catch {
      }
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after status ${response.status}`
      );
      await sleep(computeBackoffDelay(attempt, retryAfterMs));
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_MAX_RETRIES) throw error;
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after network error`
      );
      await sleep(computeBackoffDelay(attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("LLM request failed after exhausting retries");
};
async function invokeLLM(params) {
  assertApiKey();
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    thinking,
    reasoning,
    maxTokens,
    max_tokens
  } = params;
  const payload = {
    messages: messages.map(normalizeMessage)
  };
  if (model) {
    payload.model = model;
  }
  if (tools && tools.length > 0) {
    payload.tools = tools;
  }
  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }
  const resolvedMaxTokens = max_tokens ?? maxTokens;
  if (typeof resolvedMaxTokens === "number") {
    payload.max_tokens = resolvedMaxTokens;
  }
  if (thinking) {
    payload.thinking = thinking;
  }
  if (reasoning) {
    payload.reasoning = reasoning;
  }
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema
  });
  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }
  const response = await fetchWithBackoff(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    );
  }
  return await response.json();
}

// server/riskNarrative.ts
var RISK_NARRATIVE_PROMPT_VERSION = "2026-08-27.1";
var boundary = "AI-assisted summary of this case fact sheet \u2014 not a decision. It cannot infer fault, deny a case, use fraud-adjacent language, approve/refuse money, contest a dispute, or submit an external response.";
var forbiddenLanguage = /\b(fraud|fraudulent|lying|liar|fake|scam|scammer|deceiv\w*)\b/i;
var monetaryLanguage = /(?:₹|\$|€|\b(?:inr|rupees?|dollars?|amount)\b)/i;
function buildCaseFactSheet(input) {
  const required = Math.max(input.requiredEvidenceCount ?? 1, 1);
  const readinessScore = input.readinessScore ?? Math.round(input.evidencePresent.length / required * 100);
  return { ...input, caseAgeHours: Math.max(0, Math.round(input.caseAgeHours)), slaDeadlineHours: Math.max(0, Math.round(input.slaDeadlineHours)), readinessScore: Math.max(0, Math.min(100, readinessScore)), evidencePresent: Array.from(new Set(input.evidencePresent)).sort(), evidenceMissing: Array.from(new Set(input.evidenceMissing)).sort(), sourceLabels: Array.from(new Set(input.sourceLabels)).sort() };
}
function hashCaseFactSheet(factSheet) {
  return crypto3.createHash("sha256").update(JSON.stringify(factSheet)).digest("hex");
}
function deterministicRiskNarrative(factSheet, reason) {
  const evidence2 = factSheet.evidenceMissing.length ? `Missing evidence: ${factSheet.evidenceMissing.join(", ")}.` : "The required local-policy evidence is present.";
  return { mode: "deterministic_fallback", summary: `Case ${factSheet.caseReference} has payment state ${factSheet.paymentState}, fulfilment state ${factSheet.fulfilmentState}, and readiness ${factSheet.readinessScore}%. ${evidence2}`, recommendation: factSheet.recommendedOperationalStep, citations: factSheet.sourceLabels, boundary, factSheetHash: hashCaseFactSheet(factSheet), promptVersion: RISK_NARRATIVE_PROMPT_VERSION, readinessScore: factSheet.readinessScore, evidencePresent: factSheet.evidencePresent, evidenceMissing: factSheet.evidenceMissing, ...reason ? { reason } : {} };
}
function safeNarrativeOutput(candidate, factSheet) {
  if (!candidate || typeof candidate !== "object") return false;
  const parsed = candidate;
  if (typeof parsed.summary !== "string" || typeof parsed.recommendation !== "string" || !Array.isArray(parsed.citations) || parsed.citations.some((source) => typeof source !== "string" || !factSheet.sourceLabels.includes(source))) return false;
  const prose = `${parsed.summary} ${parsed.recommendation}`;
  if (prose.length > 900 || forbiddenLanguage.test(prose) || monetaryLanguage.test(prose)) return false;
  return true;
}
async function requestRiskNarrative(factSheet) {
  const attempt = async () => {
    const response = await invokeLLM({
      model: "gpt-5-6-luna",
      maxTokens: 300,
      messages: [
        { role: "system", content: "You are a merchant-operations evidence assistant. Summarize and prioritize only the supplied JSON fact sheet. Never infer facts not present, assign fault, use fraud/intent language, mention money, name a person, claim delivery/refund/outcome, or recommend an automatic financial/external action. Examples: if evidenceMissing has delivery tracking, say to reconcile or request delivery tracking; if evidenceMissing is empty, say the local-policy set is present. Return a concise JSON object only and cite only sourceLabels included in the fact sheet." },
        { role: "user", content: JSON.stringify(factSheet) }
      ],
      outputSchema: { name: "risk_narrative", strict: true, schema: { type: "object", properties: { summary: { type: "string" }, recommendation: { type: "string" }, citations: { type: "array", items: { type: "string" } } }, required: ["summary", "recommendation", "citations"], additionalProperties: false } }
    });
    const raw = response.choices[0]?.message.content;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : null;
    if (!safeNarrativeOutput(parsed, factSheet)) throw new Error("Generated response did not pass strict fact-sheet safety validation.");
    return { mode: "ai_assisted", summary: parsed.summary.slice(0, 600), recommendation: parsed.recommendation.slice(0, 260), citations: parsed.citations, boundary, factSheetHash: hashCaseFactSheet(factSheet), promptVersion: RISK_NARRATIVE_PROMPT_VERSION, readinessScore: factSheet.readinessScore, evidencePresent: factSheet.evidencePresent, evidenceMissing: factSheet.evidenceMissing };
  };
  try {
    return await attempt();
  } catch {
    try {
      return await attempt();
    } catch {
      return deterministicRiskNarrative(factSheet, "AI response did not pass strict fact-sheet validation; deterministic evidence summary retained.");
    }
  }
}
async function generateRiskNarrative(merchantOpenId, factSheet) {
  const hash = hashCaseFactSheet(factSheet);
  return getOrSetScopedCache(`risk-narrative:${merchantOpenId}:${factSheet.caseReference}:${hash}`, 15 * 6e4, () => requestRiskNarrative(factSheet));
}

// server/riskBenchmark.ts
var at = /* @__PURE__ */ new Date("2026-08-24T00:00:00.000Z");
var scenario = (caseReference, issueType, fulfilmentState, documentKinds, expectedFulfilmentIntervention, expectedEvidenceGap, ageHours = 12) => ({ caseReference, issueType, fulfilmentState, documentKinds, expectedFulfilmentIntervention, expectedEvidenceGap, createdAt: new Date(at.getTime() - (ageHours + 3) * 36e5), updatedAt: new Date(at.getTime() - ageHours * 36e5), status: "merchant_review", hasUnreviewedExtraction: false, paymentObservation: "api_observed", returnReceiptRecorded: false, refundConfirmed: false });
var heldOutSyntheticRiskFixtures = [
  scenario("HO-01", "product_not_received", "delivery_exception", [], true, true),
  scenario("HO-02", "product_not_received", "unfulfilled", [], true, true),
  scenario("HO-03", "product_not_received", "delivered", ["delivery_or_tracking", "support_conversation"], false, false),
  scenario("HO-04", "partial_delivery", "delivery_exception", ["delivery_or_tracking"], true, true),
  scenario("HO-05", "partial_delivery", "delivered", ["delivery_or_tracking", "item_condition"], false, false),
  scenario("HO-06", "damaged_or_wrong_item", "shipped", ["item_condition"], false, true),
  scenario("HO-07", "damaged_or_wrong_item", "delivered", ["item_condition", "delivery_or_tracking"], false, false),
  scenario("HO-08", "return_request", "delivered", [], false, true),
  scenario("HO-09", "return_request", "delivered", ["item_condition"], false, false),
  scenario("HO-10", "refund_issue", "delivered", ["payment_confirmation"], false, true),
  scenario("HO-11", "refund_issue", "delivered", ["payment_confirmation", "support_conversation"], false, false),
  scenario("HO-12", "wrong_amount", "delivered", [], false, true),
  scenario("HO-13", "wrong_amount", "delivered", ["payment_confirmation"], false, false),
  scenario("HO-14", "duplicate_payment", "packed", [], false, true),
  scenario("HO-15", "duplicate_payment", "delivered", ["payment_confirmation"], false, false),
  scenario("HO-16", "unauthorized_transaction", "unfulfilled", ["payment_confirmation"], false, true),
  scenario("HO-17", "unauthorized_transaction", "delivered", ["payment_confirmation", "support_conversation"], false, false),
  scenario("HO-18", "product_not_received", "shipped", ["delivery_or_tracking"], false, true),
  scenario("HO-19", "product_not_received", "shipped", ["delivery_or_tracking", "support_conversation"], false, false),
  scenario("HO-20", "partial_delivery", "packed", [], false, true),
  scenario("HO-21", "damaged_or_wrong_item", "delivery_exception", [], true, true),
  scenario("HO-22", "return_request", "delivery_exception", ["item_condition"], true, false),
  scenario("HO-23", "refund_issue", "delivery_exception", ["payment_confirmation", "support_conversation"], true, false),
  scenario("HO-24", "wrong_amount", "delivery_exception", [], true, true)
];
var measure = (predictions, expected) => predictions.reduce((counts, predicted, index) => {
  const label = expected[index];
  if (predicted && label) counts.truePositive++;
  else if (predicted) counts.falsePositive++;
  else if (label) counts.falseNegative++;
  else counts.trueNegative++;
  return counts;
}, { truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0 });
var score = ({ truePositive, falsePositive, falseNegative }) => {
  const precision = Math.round(truePositive / Math.max(truePositive + falsePositive, 1) * 100);
  const recall = Math.round(truePositive / Math.max(truePositive + falseNegative, 1) * 100);
  const f1 = precision + recall === 0 ? 0 : Math.round(2 * precision * recall / (precision + recall));
  return { precision, recall, f1 };
};
function runHeldOutRiskBenchmark() {
  const output = buildProactiveRiskIntelligence(heldOutSyntheticRiskFixtures, at);
  const fulfilmentPredictions = heldOutSyntheticRiskFixtures.map((item) => output.signals.some((signal) => signal.caseReference === item.caseReference && signal.title === "Fulfilment Risk Sentinel"));
  const evidencePredictions = heldOutSyntheticRiskFixtures.map((item) => output.freshness.find((row) => row.caseReference === item.caseReference)?.missing.length !== 0);
  const fulfilment = measure(fulfilmentPredictions, heldOutSyntheticRiskFixtures.map((item) => item.expectedFulfilmentIntervention));
  const evidenceGap = measure(evidencePredictions, heldOutSyntheticRiskFixtures.map((item) => item.expectedEvidenceGap));
  return { corpus: { name: "Synthetic held-out regression corpus", scenarioCount: heldOutSyntheticRiskFixtures.length, version: "2026-08-24.1", status: "synthetic_not_live_not_a_bank_outcome_predictor" }, measurements: [{ target: "Fulfilment intervention signal", ...score(fulfilment), confusionMatrix: fulfilment }, { target: "Evidence-gap detection", ...score(evidenceGap), confusionMatrix: evidenceGap }], definition: "Each metric is computed against fixed, author-labelled synthetic scenarios that are excluded from production merchant data. It measures deterministic rule agreement only; it is not a live dispute-wins, fraud, customer-intent, or financial-outcome claim." };
}

// server/demoSeedPolicy.ts
var DEMO_SEED_ACKNOWLEDGEMENT = "SEED_SYNTHETIC_DEMO_DATA";
function demoSeedAllowed(input) {
  if (input.isProduction) return { allowed: false, reason: "Synthetic demo seeding is disabled in production." };
  if (!input.isOwner || !input.isAdmin) return { allowed: false, reason: "Synthetic demo seeding is restricted to the project owner." };
  if (input.acknowledgement !== DEMO_SEED_ACKNOWLEDGEMENT) return { allowed: false, reason: "Synthetic demo acknowledgement is required." };
  return { allowed: true };
}

// server/customerAccessBinding.ts
async function bindFirstCustomerAccess(input) {
  if (input.grant.boundBuyerOpenId) {
    if (input.grant.boundBuyerOpenId !== input.buyerOpenId) {
      throw new Error(input.alreadyBoundMessage);
    }
    return input.grant;
  }
  if (await input.tryClaimUnboundGrant()) {
    return { ...input.grant, boundBuyerOpenId: input.buyerOpenId };
  }
  const reloadedGrant = await input.reloadGrant();
  if (!reloadedGrant) {
    throw new Error(input.unavailableMessage);
  }
  if (reloadedGrant.boundBuyerOpenId !== input.buyerOpenId) {
    throw new Error(input.alreadyBoundMessage);
  }
  return reloadedGrant;
}

// server/reasonCodeMapping.ts
var NETWORK_REASON_MAPPINGS = {
  product_not_received: {
    internalReason: "product_not_received",
    localLabel: "Product not received",
    externalReadiness: "candidate_mapping",
    networkCandidates: [
      { network: "Visa", code: "13.1", label: "Merchandise/Services Not Received", confidence: "direct_candidate" },
      { network: "RuPay", code: "1064", label: "Goods/Services Not Received", confidence: "direct_candidate" },
      { network: "Mastercard", code: "4853", label: "Cardholder Dispute", confidence: "broad_candidate" }
    ],
    razorpayEvidenceFields: ["shipping_proof", "proof_of_service", "customer_communication", "term_and_conditions"],
    merchantInstruction: "Prioritize delivery confirmation, tracking or service-completion proof, then customer communication and fulfilment terms.",
    source: "Razorpay dispute evidence documentation",
    boundary: "Use the actual issuer/Razorpay reason code when received. This local mapping only pre-organizes evidence and does not submit a response."
  },
  partial_delivery: {
    internalReason: "partial_delivery",
    localLabel: "Item missing from delivery",
    externalReadiness: "awaiting_issuer_reason_code",
    networkCandidates: [{ network: "Mastercard", code: "4853", label: "Cardholder Dispute", confidence: "broad_candidate" }],
    razorpayEvidenceFields: ["shipping_proof", "billing_proof", "customer_communication", "explanation_letter", "others"],
    merchantInstruction: "Preserve packing, delivery, and order-line evidence; require the issuer-provided reason before selecting a network code.",
    source: "Razorpay dispute evidence documentation",
    boundary: "No exact network subreason is inferred from a local partial-delivery report."
  },
  damaged_or_wrong_item: {
    internalReason: "damaged_or_wrong_item",
    localLabel: "Damaged or wrong item",
    externalReadiness: "candidate_mapping",
    networkCandidates: [
      { network: "Visa", code: "13.3", label: "Not as Described or Defective", confidence: "direct_candidate" },
      { network: "RuPay", code: "1062", label: "Goods/Services Not As Described", confidence: "direct_candidate" },
      { network: "Mastercard", code: "4853", label: "Cardholder Dispute", confidence: "broad_candidate" }
    ],
    razorpayEvidenceFields: ["shipping_proof", "customer_communication", "term_and_conditions", "others"],
    merchantInstruction: "Preserve product description, condition, quality-control, delivery, return-policy, and customer communication records.",
    source: "Razorpay dispute evidence documentation",
    boundary: "Candidate codes do not decide product condition or a merchant response."
  },
  return_request: {
    internalReason: "return_request",
    localLabel: "Return request",
    externalReadiness: "local_only",
    networkCandidates: [],
    razorpayEvidenceFields: ["shipping_proof", "customer_communication", "refund_cancellation_policy"],
    merchantInstruction: "Keep return authorization, transit, receipt, and local refund-readiness records separate from any later external dispute.",
    source: "Razorpay dispute evidence documentation",
    boundary: "A return request is a local customer-resolution state, not a network dispute code."
  },
  refund_issue: {
    internalReason: "refund_issue",
    localLabel: "Refund not received",
    externalReadiness: "candidate_mapping",
    networkCandidates: [
      { network: "Visa", code: "13.6", label: "Credit Not Processed", confidence: "direct_candidate" },
      { network: "RuPay", code: "1061", label: "Credit Not Processed", confidence: "direct_candidate" }
    ],
    razorpayEvidenceFields: ["refund_confirmation", "customer_communication", "refund_cancellation_policy", "billing_proof"],
    merchantInstruction: "Preserve refund request, Razorpay-confirmed refund reference, matching amount/date, refund policy, and customer communication.",
    source: "Razorpay dispute evidence documentation",
    boundary: "A prepared local refund is not a confirmed credit. Only the verified Razorpay event establishes a refund outcome."
  },
  wrong_amount: {
    internalReason: "wrong_amount",
    localLabel: "Wrong amount",
    externalReadiness: "awaiting_issuer_reason_code",
    networkCandidates: [],
    razorpayEvidenceFields: ["billing_proof", "explanation_letter", "customer_communication", "term_and_conditions"],
    merchantInstruction: "Reconcile the order, invoice, Razorpay payment amount, currency, and any adjustment before selecting an issuer reason code.",
    source: "Razorpay dispute evidence documentation",
    boundary: "The local report does not safely identify a network processing-error code without the issuer/Razorpay reason."
  },
  duplicate_payment: {
    internalReason: "duplicate_payment",
    localLabel: "Duplicate payment",
    externalReadiness: "awaiting_issuer_reason_code",
    networkCandidates: [],
    razorpayEvidenceFields: ["billing_proof", "customer_communication", "explanation_letter", "others"],
    merchantInstruction: "Reconcile distinct payment references, order intent, settlement evidence, and any refund before selecting an issuer reason code.",
    source: "Razorpay dispute evidence documentation",
    boundary: "A customer-reported duplicate is not automatically a duplicate payment or a network code."
  },
  unauthorized_transaction: {
    internalReason: "unauthorized_transaction",
    localLabel: "Unauthorized transaction",
    externalReadiness: "awaiting_issuer_reason_code",
    networkCandidates: [],
    razorpayEvidenceFields: ["billing_proof", "customer_communication", "access_activity_log", "term_and_conditions", "others"],
    merchantInstruction: "Preserve factual transaction, checkout, account-access, and customer-contact records for human review; do not label the buyer or transaction fraudulent.",
    source: "Razorpay dispute evidence documentation",
    boundary: "Only an issuer/Razorpay reason and human review can determine the relevant fraud or authorization workflow."
  }
};
function getReasonCodeMapping(issueType) {
  return NETWORK_REASON_MAPPINGS[issueType];
}
function buildRazorpayEvidenceExportPreview(input) {
  const documentKinds = new Set(input.documentKinds);
  const documentForField = {
    shipping_proof: "delivery_or_tracking",
    billing_proof: "payment_confirmation",
    customer_communication: "support_conversation",
    proof_of_service: "delivery_or_tracking",
    others: "other"
  };
  const mapping = getReasonCodeMapping(input.issueType);
  return {
    mode: "merchant_review_preview",
    internalReason: input.issueType,
    actualReasonCode: null,
    fields: mapping.razorpayEvidenceFields.map((field) => {
      if (field === "refund_confirmation" && input.refundConfirmed) return { field, availability: "merchant_record_present", source: "webhook-verified refund record" };
      if (field === "billing_proof" && ["api_observed", "webhook_verified", "captured"].includes(input.paymentObservation)) return { field, availability: "merchant_record_present", source: input.paymentObservation === "webhook_verified" ? "webhook-verified payment record" : "API-observed payment record" };
      const matchingDocument = documentForField[field];
      if (matchingDocument && documentKinds.has(matchingDocument)) return { field, availability: "merchant_document_present", source: `protected ${matchingDocument.replaceAll("_", " ")} document` };
      return { field, availability: "missing", source: "no matching merchant-scoped source record" };
    }),
    boundary: "Merchant-review preview only. It uses Razorpay field names to organize current source records, leaves actualReasonCode unset, contains no provider credentials or external action, and must be validated against a permitted Razorpay workflow before provider submission."
  };
}

// server/riskOperations.ts
function paginateMerchantCases(cases, input = {}) {
  const pageSize = Math.min(Math.max(Math.trunc(input.pageSize ?? 50), 1), 50);
  const total = cases.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(Math.trunc(input.page ?? 1), 1), totalPages);
  const start = (page - 1) * pageSize;
  return { rows: cases.slice(start, start + pageSize), page, pageSize, total, totalPages, hasPreviousPage: page > 1, hasNextPage: page < totalPages };
}
function filterMerchantCases(cases, filters) {
  const query = filters.search?.trim().toLowerCase();
  return cases.filter((caseItem) => {
    if (query && ![caseItem.caseReference, caseItem.buyerOpenId, caseItem.buyerLabel ?? "", caseItem.issueType, caseItem.status].some((value) => value.toLowerCase().includes(query))) return false;
    if (filters.issueType && filters.issueType !== "all" && caseItem.issueType !== filters.issueType) return false;
    if (filters.status && filters.status !== "all" && caseItem.status !== filters.status) return false;
    if (filters.readiness === "needs_evidence" && caseItem.readinessScore >= 100) return false;
    if (filters.readiness === "ready" && caseItem.readinessScore < 100) return false;
    if (filters.from && caseItem.createdAt < filters.from) return false;
    if (filters.to && caseItem.createdAt > filters.to) return false;
    return true;
  });
}
function buildBuyerPatternSignals(cases) {
  const active = cases.filter((caseItem) => !["resolved", "closed", "withdrawn"].includes(caseItem.status));
  const groups = /* @__PURE__ */ new Map();
  for (const caseItem of active) groups.set(caseItem.buyerOpenId, [...groups.get(caseItem.buyerOpenId) ?? [], caseItem]);
  return Array.from(groups.entries()).map(([buyerOpenId, records]) => ({ buyerReference: `Buyer-${buyerOpenId.slice(-6) || "unknown"}`, activeCaseCount: records.length, productNotReceivedCount: records.filter((record) => record.issueType === "product_not_received").length, caseReferences: records.map((record) => record.caseReference), triage: records.filter((record) => record.issueType === "product_not_received").length >= 3 ? "review_workload" : "no_pattern" })).filter((signal) => signal.triage === "review_workload").sort((a, b) => b.productNotReceivedCount - a.productNotReceivedCount || b.activeCaseCount - a.activeCaseCount);
}
function buildRiskTrend(cases) {
  const byReason = /* @__PURE__ */ new Map();
  for (const caseItem of cases) {
    const current = byReason.get(caseItem.issueType) ?? { count: 0, readinessTotal: 0, exposedAmountPaise: 0 };
    current.count += 1;
    current.readinessTotal += caseItem.readinessScore;
    current.exposedAmountPaise += caseItem.orderAmountPaise ?? 0;
    byReason.set(caseItem.issueType, current);
  }
  return Array.from(byReason.entries()).map(([issueType, values]) => ({ issueType, caseCount: values.count, averageReadiness: Math.round(values.readinessTotal / values.count), storedOrderAmountPaise: values.exposedAmountPaise })).sort((a, b) => b.caseCount - a.caseCount || a.issueType.localeCompare(b.issueType));
}
function buildUsageMeter(input) {
  return { ...input, unit: "record count", boundary: "Usage is an operational count for visibility only. It does not calculate a bill, create an invoice, or enable payment collection." };
}
function buildRollingRiskReport(cases) {
  const active = cases.filter((caseItem) => !["resolved", "closed", "withdrawn"].includes(caseItem.status));
  const locallyResolved = cases.filter((caseItem) => ["resolved", "closed"].includes(caseItem.status));
  const elevated = active.filter((caseItem) => caseItem.slaLevel === "elevated");
  const evidenceGaps2 = active.filter((caseItem) => caseItem.readinessScore < 100);
  const earliest = cases.map((caseItem) => caseItem.createdAt.getTime()).sort((a, b) => a - b)[0] ?? null;
  const latest = cases.map((caseItem) => caseItem.updatedAt.getTime()).sort((a, b) => b - a)[0] ?? null;
  return {
    storedCaseCount: cases.length,
    activeCaseCount: active.length,
    locallyResolvedCaseCount: locallyResolved.length,
    elevatedSlaCaseCount: elevated.length,
    evidenceGapCaseCount: evidenceGaps2.length,
    period: earliest && latest ? { from: new Date(earliest), through: new Date(latest) } : null,
    patternStatement: `${cases.length} stored local case${cases.length === 1 ? "" : "s"}; ${active.length} active; ${locallyResolved.length} locally resolved; ${elevated.length} at elevated SLA priority; ${evidenceGaps2.length} active case${evidenceGaps2.length === 1 ? "" : "s"} still need evidence review.`,
    boundary: "This report aggregates merchant-stored local case records. It does not prove a prevented dispute, a financial saving, a protected order, a provider outcome, or customer intent."
  };
}

// server/customerRateLimit.ts
var LIMITS = {
  catalog_redemption: { maxRequests: 30, windowMs: 6e4 },
  case_creation: { maxRequests: 12, windowMs: 6e4 },
  document_upload: { maxRequests: 12, windowMs: 6e4 }
};
var windows = /* @__PURE__ */ new Map();
function checkCustomerRateLimit(input) {
  const now = input.now ?? Date.now();
  const rule = LIMITS[input.action];
  const key = `${input.action}:${input.buyerOpenId}`;
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true, remaining: rule.maxRequests - 1, retryAfterSeconds: 0, scope: "process_local_authenticated_buyer" };
  }
  if (current.count >= rule.maxRequests) return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1e3)), scope: "process_local_authenticated_buyer" };
  current.count += 1;
  return { allowed: true, remaining: rule.maxRequests - current.count, retryAfterSeconds: 0, scope: "process_local_authenticated_buyer" };
}

// server/plainTextSanitization.ts
function sanitizePlainText(value) {
  return value.normalize("NFKC").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[<>]/g, " ").replace(/\s+/g, " ").trim();
}

// server/ollamaSentiment.ts
import { z as z2 } from "zod";

// server/operationalTelemetry.ts
var startedAt = /* @__PURE__ */ new Date();
var counters = /* @__PURE__ */ new Map();
function merchantCounters(merchantOpenId) {
  const existing = counters.get(merchantOpenId);
  if (existing) return existing;
  const created = { ollama_validated: 0, ollama_fallback: 0, sla_elevated: 0, evidence_rejected: 0 };
  counters.set(merchantOpenId, created);
  return created;
}
function recordOperationalTelemetry(merchantOpenId, kind) {
  if (!merchantOpenId) return;
  merchantCounters(merchantOpenId)[kind] += 1;
}
function getOperationalTelemetry(merchantOpenId) {
  return {
    startedAt,
    counts: { ...merchantCounters(merchantOpenId) },
    boundary: "These are privacy-safe, merchant-scoped counters for the current application process only. They contain no statement text, buyer identity, document content, or provider event and reset when the process restarts. They are not durable production monitoring or alert delivery."
  };
}

// server/ollamaSentiment.ts
var OLLAMA_SENTIMENT_MODEL = "pilardi/sentiment-analysis:gemma3";
var OLLAMA_SENTIMENT_BOUNDARY = "Language triage hint only. This output does not establish truth, intent, fraud, manipulation, eligibility, payment risk, refund outcome, or dispute outcome. It cannot deny, block, penalize, refund, contest, submit, or send an external action.";
var responseSchema = z2.object({
  sentiment: z2.number().finite().min(-1).max(1),
  confidence: z2.number().finite().min(0).max(1),
  reasoning: z2.string().max(1200).optional()
});
function sentimentLabel(score2) {
  if (score2 <= -0.6) return "very_negative";
  if (score2 <= -0.2) return "negative";
  if (score2 < 0.2) return "neutral";
  if (score2 < 0.6) return "positive";
  return "very_positive";
}
function fallback(status, model, rationale, merchantOpenId) {
  recordOperationalTelemetry(merchantOpenId, "ollama_fallback");
  return {
    mode: "deterministic_fallback",
    status,
    model,
    source: "customer_statement",
    sentimentScore: null,
    sentimentLabel: "uncertain",
    confidencePercent: null,
    rationale,
    boundary: OLLAMA_SENTIMENT_BOUNDARY
  };
}
function reasonForHttpStatus(status) {
  if (status === 404) return "The selected local Ollama model is not available. Install the exact model locally before trying again.";
  if (status === 401 || status === 403) return "The local Ollama endpoint rejected this advisory request. No language signal was produced.";
  return "The local Ollama endpoint did not complete this advisory request. No language signal was produced.";
}
async function analyzeCustomerStatementWithOllama(rawStatement, options = {}) {
  const model = options.model ?? OLLAMA_SENTIMENT_MODEL;
  const statement = sanitizePlainText(rawStatement).slice(0, 1200);
  if (statement.length < 12) return fallback("invalid_input", model, "The selected local case statement is too short for reliable language triage.", options.merchantOpenId);
  const baseUrl = (options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  const timeout = options.timeoutMs ?? 35e3;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        options: { temperature: 0 },
        prompt: `Return JSON only with sentiment (-1 to 1), confidence (0 to 1), and optional brief reasoning. Analyse expressed tone only. Do not infer truth, intent, fraud, manipulation, eligibility, payment risk, refund outcome, or dispute outcome. Customer statement: ${statement}`
      })
    });
    if (!response.ok) return fallback(response.status === 404 ? "model_unavailable" : "request_failed", model, reasonForHttpStatus(response.status), options.merchantOpenId);
    const body = await response.json();
    if (typeof body.response !== "string") return fallback("invalid_response", model, "The local Ollama response did not include a valid JSON analysis. No language signal was produced.", options.merchantOpenId);
    let parsed;
    try {
      parsed = JSON.parse(body.response);
    } catch {
      return fallback("invalid_response", model, "The local Ollama response was not valid JSON. No language signal was produced.", options.merchantOpenId);
    }
    const result = responseSchema.safeParse(parsed);
    if (!result.success) return fallback("invalid_response", model, "The local Ollama response did not match the required bounded sentiment schema. No language signal was produced.", options.merchantOpenId);
    const rationale = sanitizePlainText(result.data.reasoning ?? "Local Ollama sentiment result validated against the required numeric schema.").slice(0, 280) || "Local Ollama sentiment result validated against the required numeric schema.";
    recordOperationalTelemetry(options.merchantOpenId, "ollama_validated");
    return {
      mode: "ollama_local",
      status: "model_response_validated",
      model,
      source: "customer_statement",
      sentimentScore: Number(result.data.sentiment.toFixed(3)),
      sentimentLabel: sentimentLabel(result.data.sentiment),
      confidencePercent: Math.round(result.data.confidence * 100),
      rationale,
      boundary: OLLAMA_SENTIMENT_BOUNDARY
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return fallback("timeout", model, "The local Ollama request exceeded the 15-second advisory timeout. No language signal was produced.", options.merchantOpenId);
    return fallback("runtime_unavailable", model, "The local Ollama runtime is unavailable at the configured loopback endpoint. Start Ollama and install the selected model before trying again.", options.merchantOpenId);
  } finally {
    clearTimeout(timer);
  }
}

// server/caseAuditExport.ts
import crypto4 from "node:crypto";
var CASE_AUDIT_EXPORT_VERSION = "2026-08-27.1";
var CASE_AUDIT_APPROVAL_PHRASE = "EXPORT REDACTED CASE AUDIT";
var CASE_AUDIT_EXPORT_BOUNDARY = "This is a merchant-approved, redacted local audit export. It contains no customer statement text, buyer identity, access token, document bytes, storage key, payment credential, or provider submission. It does not create, contest, accept, refund, or submit an external dispute.";
function stableReference(prefix, value) {
  return `${prefix}_${crypto4.createHash("sha256").update(value).digest("hex").slice(0, 12)}`;
}
function sourceLabel(raw) {
  try {
    const source = raw ? JSON.parse(raw) : null;
    const candidate = typeof source?.sourceKind === "string" ? source.sourceKind : "local_case_event";
    return candidate.replace(/[^a-z_]/g, "").slice(0, 64) || "local_case_event";
  } catch {
    return "local_case_event";
  }
}
function buildRedactedCaseAudit(input) {
  const audit = {
    exportType: "redacted_local_case_audit",
    exportVersion: CASE_AUDIT_EXPORT_VERSION,
    sourceKind: "merchant_scoped_local_case",
    generatedFor: stableReference("merchant", input.caseItem.merchantOpenId),
    case: {
      reference: input.caseItem.caseReference,
      issueType: input.caseItem.issueType,
      status: input.caseItem.status,
      createdAt: input.caseItem.createdAt.toISOString(),
      updatedAt: input.caseItem.updatedAt.toISOString()
    },
    order: input.order ? {
      reference: input.order.orderReference,
      amountPaise: input.order.totalAmountPaise,
      currency: input.order.currency,
      paymentObservation: input.order.paymentObservation,
      fulfillmentState: input.order.fulfillmentState
    } : null,
    evidenceReadiness: {
      score: input.readinessScore,
      missingEvidence: [...input.missingEvidence].sort(),
      candidateRazorpayFieldNames: [...input.evidenceFields].sort()
    },
    documents: input.documents.map((document, index) => ({
      reference: `document_${index + 1}`,
      declaredKind: document.declaredKind,
      contentType: document.contentType,
      byteSize: document.byteSize,
      sha256Prefix: document.sha256.slice(0, 16),
      createdAt: document.createdAt.toISOString(),
      extraction: document.extraction ? {
        status: document.extraction.status,
        customerConfirmation: document.extraction.customerConfirmation,
        overallConfidence: document.extraction.overallConfidence
      } : null
    })),
    timeline: input.events.slice().sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime()).map((event) => ({
      eventType: event.eventType,
      actorType: event.actorType,
      sourceKind: sourceLabel(event.sourceRefs),
      createdAt: event.createdAt.toISOString()
    })),
    sla: input.escalation ? { ownerLabel: input.escalation.ownerLabel, level: input.escalation.level, updatedAt: input.escalation.updatedAt.toISOString() } : { ownerLabel: "Merchant review", level: "watch", updatedAt: input.caseItem.updatedAt.toISOString() },
    boundary: CASE_AUDIT_EXPORT_BOUNDARY
  };
  return audit;
}
function hashRedactedCaseAudit(audit) {
  return crypto4.createHash("sha256").update(JSON.stringify(audit)).digest("hex");
}

// server/merchantTeamAccess.ts
var MERCHANT_TEAM_ROLES = ["viewer", "reviewer", "approver"];
var roleRank = { viewer: 1, reviewer: 2, approver: 3, owner: 4 };
function hasMerchantTeamPermission(role, required) {
  return roleRank[role] >= roleRank[required];
}
function evaluateMerchantTeamAccess(input) {
  if (input.actorOpenId === input.merchantOpenId) return { permitted: true, role: "owner", reason: "merchant_owner" };
  if (!input.active || !input.memberRole) return { permitted: false, role: null, reason: "no_active_membership" };
  if (!hasMerchantTeamPermission(input.memberRole, input.required)) return { permitted: false, role: input.memberRole, reason: "insufficient_role" };
  return { permitted: true, role: input.memberRole, reason: "active_membership" };
}
var MERCHANT_TEAM_BOUNDARY = "Internal merchant-team roles govern only local DisputeShield workspace access. They do not create provider accounts, send invitations, submit external disputes, issue refunds, or override Razorpay, bank, or merchant approval requirements.";

// server/privateIntegrity.ts
import crypto5 from "node:crypto";
var PRIVATE_INTEGRITY_VERSION = "ds-private-integrity-v1";
function sha256(value) {
  return crypto5.createHash("sha256").update(value).digest("hex");
}
function createIntegrityTimestamp(date = /* @__PURE__ */ new Date()) {
  return new Date(Math.floor(date.getTime() / 1e3) * 1e3).toISOString();
}
function canonicalize(value) {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
}
function createIntegrityAnchor(input) {
  const createdAt = createIntegrityTimestamp(new Date(input.createdAt));
  const payload = { anchorType: input.anchorType, anchorVersion: PRIVATE_INTEGRITY_VERSION, createdAt, customerCaseId: input.customerCaseId, merchantOpenId: input.merchantOpenId, payloadHash: input.payloadHash, previousChainHash: input.previousChainHash ?? null, sourceRecordId: input.sourceRecordId };
  return { ...input, createdAt, previousChainHash: input.previousChainHash ?? null, anchorVersion: PRIVATE_INTEGRITY_VERSION, chainHash: sha256(canonicalize(payload)) };
}
function verifyIntegrityChain(anchors) {
  if (!anchors.length) return { valid: true, checked: 0, rootHash: null };
  if (anchors.some((anchor) => anchor.anchorVersion !== PRIVATE_INTEGRITY_VERSION)) return { valid: false, checked: anchors.length, issue: "unsupported_anchor_version" };
  const roots = anchors.filter((anchor) => anchor.previousChainHash === null);
  if (roots.length !== 1) return { valid: false, checked: anchors.length, issue: roots.length > 1 ? "chain_fork_detected" : "chain_root_missing" };
  const successors = /* @__PURE__ */ new Map();
  for (const anchor of anchors) {
    if (!anchor.previousChainHash) continue;
    successors.set(anchor.previousChainHash, [...successors.get(anchor.previousChainHash) ?? [], anchor]);
  }
  let current = roots[0];
  const visited = /* @__PURE__ */ new Set();
  while (current) {
    if (visited.has(current.chainHash)) return { valid: false, checked: anchors.length, issue: "chain_cycle_detected", failedAnchorHash: current.chainHash };
    const predecessor = current.previousChainHash;
    const expected = createIntegrityAnchor({ merchantOpenId: current.merchantOpenId, customerCaseId: current.customerCaseId, anchorType: current.anchorType, sourceRecordId: current.sourceRecordId, payloadHash: current.payloadHash, previousChainHash: predecessor, createdAt: current.createdAt }).chainHash;
    if (current.chainHash !== expected) return { valid: false, checked: anchors.length, issue: "anchor_hash_mismatch", failedAnchorHash: current.chainHash };
    visited.add(current.chainHash);
    const next = successors.get(current.chainHash) ?? [];
    if (next.length > 1) return { valid: false, checked: anchors.length, issue: "chain_fork_detected", failedAnchorHash: current.chainHash };
    current = next[0];
  }
  if (visited.size !== anchors.length) return { valid: false, checked: anchors.length, issue: "orphan_anchor_detected" };
  return { valid: true, checked: anchors.length, rootHash: Array.from(visited).at(-1) ?? null };
}
function buildMerkleRoot(hashes) {
  if (!hashes.length) return null;
  let level = [...hashes].sort();
  while (level.length > 1) {
    const next = [];
    for (let index = 0; index < level.length; index += 2) next.push(sha256(`${level[index]}:${level[index + 1] ?? level[index]}`));
    level = next;
  }
  return level[0];
}

// server/privateIntegrityService.ts
import { and, desc, eq as eq2, sql } from "drizzle-orm";
function fromStoredAnchor(row) {
  return {
    merchantOpenId: row.merchantOpenId,
    customerCaseId: row.customerCaseId,
    anchorType: row.anchorType,
    sourceRecordId: row.sourceRecordId,
    payloadHash: row.payloadHash,
    previousChainHash: row.previousChainHash,
    chainHash: row.chainHash,
    anchorVersion: row.anchorVersion,
    createdAt: createIntegrityTimestamp(row.createdAt)
  };
}
async function appendPrivateIntegrityAnchor(db, input) {
  return db.transaction(async (tx) => {
    const existing = (await tx.select().from(customerCaseIntegrityAnchors).where(and(
      eq2(customerCaseIntegrityAnchors.customerCaseId, input.customerCaseId),
      eq2(customerCaseIntegrityAnchors.merchantOpenId, input.merchantOpenId),
      eq2(customerCaseIntegrityAnchors.anchorType, input.anchorType),
      eq2(customerCaseIntegrityAnchors.sourceRecordId, input.sourceRecordId)
    )).limit(1))[0] ?? null;
    if (existing) return { anchor: fromStoredAnchor(existing), created: false };
    await tx.insert(customerCaseIntegrityHeads).values({ customerCaseId: input.customerCaseId, merchantOpenId: input.merchantOpenId, headChainHash: null, anchorCount: 0 }).onDuplicateKeyUpdate({ set: { merchantOpenId: input.merchantOpenId } });
    const lockResult = await tx.execute(sql`SELECT ${customerCaseIntegrityHeads.customerCaseId}, ${customerCaseIntegrityHeads.merchantOpenId}, ${customerCaseIntegrityHeads.headChainHash}, ${customerCaseIntegrityHeads.anchorCount} FROM ${customerCaseIntegrityHeads} WHERE ${customerCaseIntegrityHeads.customerCaseId} = ${input.customerCaseId} FOR UPDATE`);
    const lockedRows = Array.isArray(lockResult) && Array.isArray(lockResult[0]) ? lockResult[0] : lockResult;
    const head = lockedRows[0];
    if (!head || head.merchantOpenId !== input.merchantOpenId) throw new Error("Private integrity head is unavailable for this merchant case.");
    let previousChainHash = head.headChainHash;
    let previousCount = Number(head.anchorCount ?? 0);
    const storedAnchors = await tx.select().from(customerCaseIntegrityAnchors).where(and(eq2(customerCaseIntegrityAnchors.customerCaseId, input.customerCaseId), eq2(customerCaseIntegrityAnchors.merchantOpenId, input.merchantOpenId))).orderBy(desc(customerCaseIntegrityAnchors.id));
    const existingVerification = verifyIntegrityChain(storedAnchors.map(fromStoredAnchor));
    if (!existingVerification.valid) throw new Error(`Private integrity chain requires review before a new anchor can be appended (${existingVerification.issue ?? "verification_failed"}).`);
    if (!previousChainHash && previousCount === 0 && storedAnchors.length) {
      previousChainHash = existingVerification.rootHash ?? storedAnchors[0].chainHash;
      previousCount = storedAnchors.length;
    }
    const anchor = createIntegrityAnchor({ ...input, previousChainHash, createdAt: createIntegrityTimestamp() });
    await tx.insert(customerCaseIntegrityAnchors).values({ merchantOpenId: anchor.merchantOpenId, customerCaseId: anchor.customerCaseId, anchorType: anchor.anchorType, sourceRecordId: anchor.sourceRecordId, payloadHash: anchor.payloadHash, previousChainHash: anchor.previousChainHash, chainHash: anchor.chainHash, anchorVersion: anchor.anchorVersion, createdBy: input.createdBy, createdAt: new Date(anchor.createdAt) });
    await tx.update(customerCaseIntegrityHeads).set({ headChainHash: anchor.chainHash, anchorCount: previousCount + 1 }).where(and(eq2(customerCaseIntegrityHeads.customerCaseId, input.customerCaseId), eq2(customerCaseIntegrityHeads.merchantOpenId, input.merchantOpenId)));
    return { anchor, created: true };
  });
}

// server/routers.ts
var CUSTOMER_DOCUMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
var CUSTOMER_DOCUMENT_MAX_BYTES = 35e5;
function hashCustomerAccessToken(token) {
  return crypto6.createHash("sha256").update(token).digest("hex");
}
async function requireMerchantTeamRole(db, actorOpenId, merchantOpenId, required) {
  const membership = actorOpenId === merchantOpenId ? null : (await db.select().from(merchantTeamMemberships).where(and2(eq3(merchantTeamMemberships.merchantOpenId, merchantOpenId), eq3(merchantTeamMemberships.memberOpenId, actorOpenId))).limit(1))[0] ?? null;
  const access = evaluateMerchantTeamAccess({ actorOpenId, merchantOpenId, memberRole: membership?.role, active: membership?.active, required });
  if (!access.permitted) throw new Error("Your internal merchant-team role does not permit this local workspace action.");
  return access;
}
function safeCustomerFileName(value) {
  const base = value.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_+/, "").slice(0, 180);
  return base || "customer-document";
}
function customerDocumentExtension(contentType) {
  if (contentType === "application/pdf") return "pdf";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}
function validCustomerDocumentSignature(contentType, data) {
  if (contentType === "application/pdf") return data.subarray(0, 4).toString("ascii") === "%PDF";
  if (contentType === "image/png") return data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (contentType === "image/jpeg") return data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255;
  if (contentType === "image/webp") return data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}
function universalCaseRecommendation(input) {
  return buildUniversalResolutionRecommendation({
    issueType: input.caseItem.issueType,
    status: input.caseItem.status,
    documentKinds: input.documentRows.map((document) => document.declaredKind),
    hasUnreviewedExtraction: input.documentRows.some((document) => document.extraction?.status === "complete" && document.extraction.customerConfirmation === "not_reviewed"),
    paymentObservation: input.order?.paymentObservation ?? "created",
    fulfilmentState: input.order?.fulfillmentState ?? "unfulfilled",
    refundConfirmed: input.refundRequest?.status === "razorpay_confirmed",
    returnReceiptRecorded: Boolean(input.returnReceipt)
  });
}
async function resolveCustomerAccess(buyerOpenId, rawAccessToken) {
  const db = await getDb();
  if (!db) throw new Error("Customer Space storage is unavailable.");
  const grant = (await db.select().from(customerOrderAccess).where(eq3(customerOrderAccess.accessTokenHash, hashCustomerAccessToken(rawAccessToken))).limit(1))[0];
  if (!grant || !grant.active || grant.expiresAt.getTime() <= Date.now()) throw new Error("This Customer Space access link is invalid, expired, or unavailable.");
  const order = (await db.select().from(sellerOrders).where(and2(eq3(sellerOrders.id, grant.sellerOrderId), eq3(sellerOrders.merchantOpenId, grant.merchantOpenId))).limit(1))[0];
  if (!order) throw new Error("The linked merchant order is unavailable.");
  const boundGrant = await bindFirstCustomerAccess({
    grant,
    buyerOpenId,
    tryClaimUnboundGrant: async () => {
      const [result] = await db.execute(sql2`UPDATE ${customerOrderAccess} SET ${customerOrderAccess.boundBuyerOpenId} = ${buyerOpenId}, ${customerOrderAccess.redeemedAt} = NOW() WHERE ${customerOrderAccess.id} = ${grant.id} AND ${customerOrderAccess.boundBuyerOpenId} IS NULL`);
      return result.affectedRows === 1;
    },
    reloadGrant: async () => (await db.select().from(customerOrderAccess).where(eq3(customerOrderAccess.id, grant.id)).limit(1))[0] ?? null,
    unavailableMessage: "This Customer Space access link is unavailable.",
    alreadyBoundMessage: "This Customer Space access link is already bound to a different signed-in customer."
  });
  return { db, grant: boundGrant, order };
}
async function resolveCustomerCatalogAccess(buyerOpenId, rawAccessToken) {
  const db = await getDb();
  if (!db) throw new Error("Customer Space storage is unavailable.");
  const grant = (await db.select().from(customerCatalogAccess).where(eq3(customerCatalogAccess.accessTokenHash, hashCustomerAccessToken(rawAccessToken))).limit(1))[0];
  if (!grant || !grant.active || grant.expiresAt.getTime() <= Date.now()) throw new Error("This customer catalog access token is invalid, expired, or unavailable.");
  const boundGrant = await bindFirstCustomerAccess({
    grant,
    buyerOpenId,
    tryClaimUnboundGrant: async () => {
      const [result] = await db.execute(sql2`UPDATE ${customerCatalogAccess} SET ${customerCatalogAccess.boundBuyerOpenId} = ${buyerOpenId}, ${customerCatalogAccess.redeemedAt} = NOW() WHERE ${customerCatalogAccess.id} = ${grant.id} AND ${customerCatalogAccess.boundBuyerOpenId} IS NULL`);
      return result.affectedRows === 1;
    },
    reloadGrant: async () => (await db.select().from(customerCatalogAccess).where(eq3(customerCatalogAccess.id, grant.id)).limit(1))[0] ?? null,
    unavailableMessage: "This customer catalog access token is unavailable.",
    alreadyBoundMessage: "This customer catalog access token is already bound to a different signed-in customer."
  });
  return { db, grant: boundGrant };
}
var disputes2 = [
  {
    id: "DSP-1048",
    externalId: "dp_rzp_1048",
    label: "product not received",
    amount: 2499,
    currency: "INR",
    status: "review",
    recommendation: "contest",
    confidence: 92,
    deadline: "Aug 24 \xB7 18:00",
    evidence: 94,
    priority: "HIGH",
    customer: "Aarav Mehta",
    order: "ORD-90821",
    falseContestCost: 2499,
    summary: "Delivery evidence is complete and internally consistent. The shipment was delivered to the order address with OTP confirmation.",
    claims: [
      { kind: "Delivery proof", source: "Delhivery / DL-77A1", claim: "Package delivered on 18 Aug at 14:42 with OTP confirmation.", verified: true },
      { kind: "Address match", source: "Order / ORD-90821", claim: "Delivery PIN 560001 matches the order address.", verified: true },
      { kind: "Payment", source: "Razorpay / pay_rzp_3D1E", claim: "\u20B92,499 captured for the referenced order.", verified: true },
      { kind: "Support history", source: "Zendesk / TKT-4471", claim: "Customer asked about warranty after delivery.", verified: true }
    ],
    audit: [
      ["03:14:08", "Webhook received", "payment.captured \xB7 signature verified"],
      ["03:14:10", "Evidence joined", "4 source records linked"],
      ["03:14:11", "Validation passed", "IDs, amount, date, delivery, address"],
      ["03:14:12", "Recommendation", "Contest \xB7 92% confidence"]
    ]
  },
  {
    id: "DSP-1046",
    externalId: "dp_rzp_1046",
    label: "product not received",
    amount: 6800,
    currency: "INR",
    status: "blocked",
    recommendation: "human_review",
    confidence: 48,
    deadline: "Aug 24 \xB7 12:30",
    evidence: 61,
    priority: "CRITICAL",
    customer: "Nisha Rao",
    order: "ORD-90714",
    falseContestCost: 6800,
    summary: "The case is blocked because delivery confirmation is missing and the refund ledger contains a conflicting partial credit.",
    claims: [
      { kind: "Payment", source: "Razorpay / pay_8Q2L", claim: "\u20B96,800 captured for the referenced order.", verified: true },
      { kind: "Delivery proof", source: "Courier / missing", claim: "No delivery scan or OTP was found.", verified: false },
      { kind: "Refund conflict", source: "Refund ledger / RF-113", claim: "A \u20B92,000 partial refund was issued before the dispute.", verified: true }
    ],
    audit: [
      ["02:51:20", "Dispute received", "dispute.created \xB7 signature verified"],
      ["02:51:22", "Evidence joined", "3 source records linked"],
      ["02:51:23", "Policy blocked", "Missing delivery proof + refund conflict"]
    ]
  },
  {
    id: "DSP-1041",
    externalId: "dp_rzp_1041",
    label: "product not received",
    amount: 1299,
    currency: "INR",
    status: "new",
    recommendation: "do_not_contest",
    confidence: 87,
    deadline: "Aug 26 \xB7 09:00",
    evidence: 88,
    priority: "MEDIUM",
    customer: "Kabir Shah",
    order: "ORD-90588",
    falseContestCost: 1299,
    summary: "The order was cancelled before dispatch and the payment was fully refunded. Contesting is not recommended.",
    claims: [
      { kind: "Refund", source: "Razorpay / rfnd_2P9M", claim: "Full \u20B91,299 refund settled on 15 Aug.", verified: true },
      { kind: "Shipment", source: "Shiprocket / SH-771", claim: "Shipment was never manifested.", verified: true },
      { kind: "Order", source: "Shopify / ORD-90588", claim: "Order cancelled before dispatch.", verified: true }
    ],
    audit: [
      ["01:12:04", "Dispute received", "dispute.created \xB7 signature verified"],
      ["01:12:06", "Refund verified", "Full amount matched"],
      ["01:12:07", "Recommendation", "Do not contest \xB7 87% confidence"]
    ]
  }
];
var computedDisputes = disputes2.map((item) => ({ ...item, validation: validateDisputeCase(item), draft: buildVerifiedDraft(item.order, item.amount, item.claims) }));
var evaluation = { datasetSize: 100, precision: 94, recall: 91, recommendationAccuracy: 93, evidenceAccuracy: 97, unsupportedClaimRate: 0, falseContestCost: 6800, exceptions: computedDisputes.filter((item) => item.validation.policyBlocked).length };
function liveDisputeCase(dispute) {
  const amount = (dispute.amount ?? 0) / 100;
  const externalDispute = buildExternalDisputeControl({ id: dispute.id, reason: dispute.reason_description ?? dispute.reason, reasonCode: dispute.reason_code, status: dispute.status, phase: dispute.phase, respondBy: dispute.respond_by, evidence: dispute.evidence });
  const observedEvidenceKeys = new Set(Object.keys(dispute.evidence ?? {}).map((key) => key.replace(/[_-]+/g, " ").toLowerCase()));
  const claims = externalDispute.evidencePolicy.requiredKinds.map((kind) => {
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
    sourceKind: "razorpay_dispute",
    externalDispute,
    summary: `Verified external dispute intake: ${externalDispute.reason}. ${externalDispute.safeNextStep}`,
    claims,
    audit: [["External", "Razorpay dispute observed", `${dispute.id} \xB7 ${externalDispute.status} \xB7 ${externalDispute.phaseLabel}`]]
  };
  return { ...base, validation: validateDisputeCase({ ...base, requiredKinds: externalDispute.evidencePolicy.requiredKinds }), draft: buildVerifiedDraft(base.order, base.amount, claims) };
}
async function signedWebhookDisputeCases(merchantOpenId) {
  const db = await getDb();
  if (!db || merchantOpenId !== ENV.ownerOpenId) return [];
  const events = await db.select().from(webhookEvents).where(and2(eq3(webhookEvents.merchantOpenId, merchantOpenId), eq3(webhookEvents.signatureVerified, true))).orderBy(desc2(webhookEvents.createdAt)).limit(100);
  return projectLatestSignedWebhookDisputes(events, merchantOpenId).map((event) => {
    const dispute = event.dispute;
    const payment = event.payment;
    const mapped = liveDisputeCase({
      id: event.externalDisputeId,
      amount: typeof dispute.amount === "number" ? dispute.amount : void 0,
      reason: typeof dispute.reason_description === "string" ? dispute.reason_description : void 0,
      reason_code: event.externalReasonCode ?? (typeof dispute.reason_code === "string" ? dispute.reason_code : void 0),
      status: event.externalStatus ?? (typeof dispute.status === "string" ? dispute.status : void 0),
      phase: event.externalPhase ?? (typeof dispute.phase === "string" ? dispute.phase : void 0),
      respond_by: event.externalRespondBy ?? (typeof dispute.respond_by === "number" ? dispute.respond_by : void 0),
      payment_id: typeof dispute.payment_id === "string" ? dispute.payment_id : typeof payment.id === "string" ? payment.id : void 0,
      evidence: dispute.evidence && typeof dispute.evidence === "object" && !Array.isArray(dispute.evidence) ? dispute.evidence : void 0
    });
    return {
      ...mapped,
      id: `WEBHOOK-${event.eventId}`,
      sourceKind: "signed_webhook_verified",
      externalDispute: { ...mapped.externalDispute, source: `Signed Razorpay webhook \xB7 ${event.eventId}`, sourceBoundary: "signed_webhook_verified" },
      audit: [["Webhook", "Signed dispute event verified", `${event.eventType} \xB7 ${event.eventId}`], ...mapped.audit]
    };
  });
}
async function localSellerDisputeCases(merchantOpenId) {
  const db = await getDb();
  if (!db) return [];
  const orders = await db.select().from(sellerOrders).where(eq3(sellerOrders.merchantOpenId, merchantOpenId));
  const byOrderId = new Map(orders.map((order) => [order.id, order]));
  const scenarios = await db.select().from(sellerDisputeScenarios).orderBy(desc2(sellerDisputeScenarios.createdAt)).limit(50);
  return Promise.all(uniqueLatestSellerScenarios(scenarios.filter((scenario2) => byOrderId.has(scenario2.sellerOrderId))).map(async (scenario2) => {
    const order = byOrderId.get(scenario2.sellerOrderId);
    let razorpayCaptured = false;
    if (order.razorpayPaymentId) {
      try {
        const payment = await fetchRazorpayPayment(order.razorpayPaymentId);
        razorpayCaptured = payment.status === "captured" || payment.captured === true;
      } catch {
        razorpayCaptured = false;
      }
    }
    const delivered = order.fulfillmentState === "delivered";
    const paymentObserved = razorpayCaptured || order.paymentObservation === "client_confirmed" || order.paymentObservation === "api_observed" || order.paymentObservation === "webhook_verified";
    const scenarioOutcome = recommendSellerScenario({ scenarioType: scenario2.scenarioType, paymentObserved, fulfillmentState: order.fulfillmentState });
    const readiness = sellerReviewReadiness({ paymentObserved, fulfillmentState: order.fulfillmentState });
    const metadata = scenarioMetadata[scenario2.scenarioType];
    const claims = [
      { kind: "Payment", source: order.razorpayPaymentId ? `Razorpay API / ${order.razorpayPaymentId}` : `Razorpay order / ${order.razorpayOrderId ?? "pending"}`, claim: razorpayCaptured ? `Razorpay API reports \u20B9${(order.totalAmountPaise / 100).toLocaleString("en-IN")} captured for this Seller Space order.` : "A Seller Space order exists, but no Razorpay API-observed capture is available yet.", verified: razorpayCaptured },
      { kind: "Delivery proof", source: `Seller Space fulfillment / ${order.orderReference}`, claim: delivered ? `Merchant-recorded delivery milestone: ${order.shippingRecord}` : `Merchant record currently shows ${order.fulfillmentState.replaceAll("_", " ")}; delivery proof is incomplete.`, verified: delivered },
      { kind: "Address match", source: `Seller Space order / ${order.orderReference}`, claim: delivered ? "Merchant shipping record is attached to the selected local order." : "Shipping record is not sufficient to confirm delivery to the order address.", verified: delivered },
      { kind: "Refund", source: "Seller Space refund ledger", claim: "No local refund record has been added to this demonstration order.", verified: false }
    ];
    const amount = order.totalAmountPaise / 100;
    const base = {
      id: `LOCAL-${scenario2.id}`,
      externalId: `seller_demo_${scenario2.id}`,
      label: scenario2.scenarioType === "product_not_received" ? "product not received" : metadata.label.toLowerCase(),
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
      audit: [["Local", "Seller Space dispute review opened", `Demonstration scenario \xB7 ${metadata.label}`], ["Local", "Merchant order linked", `${order.orderReference} \xB7 local merchant record`], ["Razorpay", razorpayCaptured ? "Payment API observed" : "Payment awaiting evidence", order.razorpayPaymentId ?? order.razorpayOrderId ?? "No Razorpay reference"], ["Merchant", "Fulfillment state evaluated", order.fulfillmentState]],
      sourceKind: "demonstration_scenario",
      operational: readiness,
      appealPolicy: { ...evaluateAppealPolicy({ claimType: scenario2.scenarioType, claims, fulfillmentState: order.fulfillmentState }), requestedOutcome: scenario2.requestedOutcome }
    };
    return { ...base, validation: validateDisputeCase(base), draft: buildVerifiedDraft(base.order, base.amount, claims) };
  }));
}
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  dashboard: publicProcedure.query(async () => {
    const [snapshotResult, dbResult] = await Promise.allSettled([getRazorpayAccountSnapshot(), getDb()]);
    const snapshot = snapshotResult.status === "fulfilled" ? snapshotResult.value : { collectedAmount: 0, capturedPayments: 0, refundAmount: 0, processedRefunds: 0, disputedAmount: 0, openDisputes: 0, underReviewDisputes: 0, failedPayments: 0, apiAvailable: false };
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
      integrationMessage: snapshotResult.status === "fulfilled" ? void 0 : "Razorpay account read is temporarily unavailable; no capture or dispute fact was inferred.",
      evaluation
    };
  }),
  disputes: publicProcedure.query(async () => {
    try {
      return (await listLiveProductNotReceivedDisputes()).map(liveDisputeCase);
    } catch {
      return [];
    }
  }),
  merchantDisputes: protectedProcedure.query(async ({ ctx }) => {
    const [liveResult, localResult, webhookResult] = await Promise.allSettled([listLiveRazorpayDisputes(), localSellerDisputeCases(ctx.user.openId), signedWebhookDisputeCases(ctx.user.openId)]);
    const live = liveResult.status === "fulfilled" ? liveResult.value : [];
    const local = localResult.status === "fulfilled" ? localResult.value : [];
    const webhook = webhookResult.status === "fulfilled" ? webhookResult.value : [];
    return mergeCommandCentreSources(webhook, local, live.map(liveDisputeCase));
  }),
  dispute: publicProcedure.input(z3.object({ id: z3.string() })).query(async ({ input }) => (await listLiveProductNotReceivedDisputes()).map(liveDisputeCase).find((item) => item.id === input.id) ?? null),
  approveExport: protectedProcedure.input(z3.object({ id: z3.string(), approvalPhrase: z3.literal("APPROVE VERIFIED EVIDENCE") })).mutation(async ({ ctx, input }) => {
    const item = computedDisputes.find((candidate) => candidate.id === input.id);
    if (!item) throw new Error("Case not found");
    if (item.validation.policyBlocked) throw new Error("Policy block: incomplete, contradictory, or low-confidence evidence");
    const db = await getDb();
    if (db) await db.insert(exportRecords).values({ disputeId: Number(item.id.replace("DSP-", "")) || 0, approvedBy: ctx.user.openId, approvalPhrase: input.approvalPhrase, exportState: "approved" });
    return { success: true, id: input.id, state: "approved", message: "Evidence packet approved for merchant-controlled export. No response was submitted automatically." };
  }),
  createEvidenceReference: protectedProcedure.input(z3.object({ disputeId: z3.string(), kind: z3.string(), fileKey: z3.string(), fileUrl: z3.string().url() })).mutation(({ input }) => ({ ...input, stored: true, bytesPersisted: false, message: "Protected file reference recorded; file bytes remain in object storage." })),
  razorpayConnection: publicProcedure.query(async () => {
    try {
      const recent = await listRecentRazorpayPayments();
      return { connected: true, paymentRecordsAccessible: recent.count, environment: "connected" };
    } catch {
      return { connected: false, paymentRecordsAccessible: 0, environment: "unavailable", message: "Razorpay account read is temporarily unavailable. DisputeShield will not infer payment capture." };
    }
  }),
  webhookHealth: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.openId !== ENV.ownerOpenId) return { lastEvent: null, verifiedEvents: 0, recentFailures: 0, duplicateEvents: 0 };
    const db = await getDb();
    if (!db) return { lastEvent: null, verifiedEvents: 0, recentFailures: 0, duplicateEvents: 0 };
    const [events, webhookAnchors] = await Promise.all([
      db.select().from(webhookEvents).where(eq3(webhookEvents.merchantOpenId, ctx.user.openId)).orderBy(desc2(webhookEvents.createdAt)).limit(10),
      db.select({ sourceRecordId: customerCaseIntegrityAnchors.sourceRecordId }).from(customerCaseIntegrityAnchors).where(and2(eq3(customerCaseIntegrityAnchors.merchantOpenId, ctx.user.openId), eq3(customerCaseIntegrityAnchors.anchorType, "verified_webhook")))
    ]);
    const anchoredEventIds = new Set(webhookAnchors.map((anchor) => anchor.sourceRecordId));
    return {
      lastEvent: events[0] ? { type: events[0].eventType, receivedAt: events[0].createdAt, signatureVerified: events[0].signatureVerified, privateIntegrityAnchored: anchoredEventIds.has(events[0].eventId) } : null,
      verifiedEvents: events.filter((event) => event.signatureVerified).length,
      recentFailures: events.filter((event) => !event.signatureVerified).length,
      duplicateEvents: 0
    };
  }),
  createEvidenceQr: protectedProcedure.input(z3.object({ id: z3.string() })).mutation(async ({ input }) => {
    const item = computedDisputes.find((candidate) => candidate.id === input.id);
    if (!item) throw new Error("Case not found");
    const qr = await createCaseEvidenceQr({ caseId: item.id, amountRupees: item.amount, orderId: item.order });
    return { caseId: item.id, qrId: qr.id, qrImageUrl: qr.image_url ?? null, status: qr.status ?? "created", amount: item.amount };
  }),
  createPaymentIntake: protectedProcedure.input(z3.object({ amountRupees: z3.number().min(1).max(5e3), purpose: z3.enum(["merchant_payment", "evidence_intake"]) })).mutation(async ({ ctx, input }) => {
    const amountPaise = Math.round(input.amountRupees * 100);
    const receipt = `ds_${crypto6.randomUUID().replace(/-/g, "").slice(0, 28)}`;
    const order = await createMerchantPaymentOrder({ amountPaise, receipt, purpose: input.purpose, merchantOpenId: ctx.user.openId });
    const db = await getDb();
    if (!db) throw new Error("Payment intake storage is unavailable. No checkout was opened.");
    await db.insert(paymentIntakes).values({ merchantOpenId: ctx.user.openId, purpose: input.purpose, amountPaise, receipt, razorpayOrderId: order.id, status: "created" });
    return { orderId: order.id, amountPaise: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID, checkoutMode: getRazorpayCheckoutMode(), receipt, purpose: input.purpose };
  }),
  paymentCheckoutConfig: protectedProcedure.query(() => ({ mode: getRazorpayCheckoutMode() })),
  resumePaymentIntakeCheckout: protectedProcedure.input(z3.object({ orderId: z3.string() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Payment intake storage is unavailable.");
    const record = (await db.select().from(paymentIntakes).where(eq3(paymentIntakes.razorpayOrderId, input.orderId)).limit(1))[0];
    if (!record || record.merchantOpenId !== ctx.user.openId) throw new Error("Unknown payment intake order.");
    if (!["created", "checkout_opened"].includes(record.status)) throw new Error("Only an unconfirmed payment request can be resumed.");
    return { orderId: record.razorpayOrderId, amountPaise: record.amountPaise, currency: record.currency, keyId: process.env.RAZORPAY_KEY_ID, checkoutMode: getRazorpayCheckoutMode(), receipt: record.receipt, purpose: record.purpose };
  }),
  verifyPaymentIntake: protectedProcedure.input(z3.object({ orderId: z3.string(), paymentId: z3.string(), signature: z3.string() })).mutation(async ({ ctx, input }) => {
    const signatureVerified = verifyRazorpayCheckoutSignature(input);
    const db = await getDb();
    if (!db) throw new Error("Payment intake storage is unavailable.");
    const record = (await db.select().from(paymentIntakes).where(eq3(paymentIntakes.razorpayOrderId, input.orderId)).limit(1))[0];
    if (!record || record.merchantOpenId !== ctx.user.openId) throw new Error("Unknown payment intake order.");
    const transition = checkoutVerificationTransition(signatureVerified);
    if (!signatureVerified) {
      await db.update(paymentIntakes).set({ status: transition.status }).where(eq3(paymentIntakes.razorpayOrderId, input.orderId));
      throw new Error("Checkout signature verification failed. No payment was treated as captured.");
    }
    await db.update(paymentIntakes).set({ status: transition.status, razorpayPaymentId: input.paymentId, checkoutSignature: input.signature }).where(eq3(paymentIntakes.razorpayOrderId, input.orderId));
    return { signatureVerified: true, status: "client_confirmed", message: "Checkout signature verified. Waiting for a signed Razorpay payment event before capture is reflected." };
  }),
  markPaymentCheckoutOpened: protectedProcedure.input(z3.object({ orderId: z3.string() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Payment intake storage is unavailable.");
    const record = (await db.select().from(paymentIntakes).where(eq3(paymentIntakes.razorpayOrderId, input.orderId)).limit(1))[0];
    if (!record || record.merchantOpenId !== ctx.user.openId) throw new Error("Unknown payment intake order.");
    await db.update(paymentIntakes).set({ status: "checkout_opened" }).where(eq3(paymentIntakes.razorpayOrderId, input.orderId));
    return { orderId: input.orderId, status: "checkout_opened" };
  }),
  paymentIntakes: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select().from(paymentIntakes).where(eq3(paymentIntakes.merchantOpenId, ctx.user.openId)).orderBy(desc2(paymentIntakes.createdAt)).limit(8);
    return Promise.all(rows.map(async (record) => {
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
    return db.select().from(sellerProducts).where(eq3(sellerProducts.merchantOpenId, ctx.user.openId)).orderBy(desc2(sellerProducts.createdAt));
  }),
  sellerSpaceContext: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { workspaceRef: ctx.user.openId.slice(-6), productCount: 0, orderCount: 0 };
    const [products, orders] = await Promise.all([
      db.select({ id: sellerProducts.id }).from(sellerProducts).where(eq3(sellerProducts.merchantOpenId, ctx.user.openId)),
      db.select({ id: sellerOrders.id }).from(sellerOrders).where(eq3(sellerOrders.merchantOpenId, ctx.user.openId))
    ]);
    return { workspaceRef: ctx.user.openId.slice(-6), productCount: products.length, orderCount: orders.length };
  }),
  createSellerProduct: protectedProcedure.input(z3.object({ sku: z3.string().trim().min(2).max(64), name: z3.string().trim().min(2).max(160), description: z3.string().trim().max(500).optional(), unitAmountRupees: z3.number().min(1).max(5e3), inventoryQuantity: z3.number().int().min(0).max(1e4) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Seller Space storage is unavailable.");
    await db.insert(sellerProducts).values({ merchantOpenId: ctx.user.openId, sku: input.sku, name: input.name, description: input.description || null, unitAmountPaise: Math.round(input.unitAmountRupees * 100), inventoryQuantity: input.inventoryQuantity, status: "active" });
    invalidateScopedCache(`catalog:${ctx.user.openId}`);
    return { created: true };
  }),
  sellerOrders: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const orders = await db.select().from(sellerOrders).where(eq3(sellerOrders.merchantOpenId, ctx.user.openId)).orderBy(desc2(sellerOrders.createdAt)).limit(20);
    return Promise.all(orders.map(async (order) => {
      if (!order.razorpayPaymentId) return { ...order, razorpayObservedStatus: null, razorpayObservedCaptured: false, razorpayObservationState: sellerRazorpayObservationState({ razorpayPaymentId: null, apiAvailable: false, apiCaptured: false }) };
      try {
        const payment = await fetchRazorpayPayment(order.razorpayPaymentId);
        const razorpayObservedCaptured = payment.status === "captured" || payment.captured === true;
        return { ...order, razorpayObservedStatus: payment.status, razorpayObservedCaptured, razorpayObservationState: sellerRazorpayObservationState({ razorpayPaymentId: order.razorpayPaymentId, apiAvailable: true, apiCaptured: razorpayObservedCaptured }) };
      } catch {
        return { ...order, razorpayObservedStatus: null, razorpayObservedCaptured: false, razorpayObservationState: sellerRazorpayObservationState({ razorpayPaymentId: order.razorpayPaymentId, apiAvailable: false, apiCaptured: false }) };
      }
    }));
  }),
  createSellerCheckout: protectedProcedure.input(z3.object({ productId: z3.number().int().positive(), quantity: z3.number().int().min(1).max(10), buyerLabel: z3.string().trim().min(2).max(120) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Seller Space storage is unavailable.");
    const product = (await db.select().from(sellerProducts).where(and2(eq3(sellerProducts.id, input.productId), eq3(sellerProducts.merchantOpenId, ctx.user.openId))).limit(1))[0];
    if (!product || product.status !== "active") throw new Error("This Seller Space product is unavailable.");
    if (!inventoryReservationOutcome({ availableQuantity: product.inventoryQuantity, requestedQuantity: input.quantity }).reserved) throw new Error("Insufficient merchant-recorded inventory for this order.");
    const orderReference = `SS-${crypto6.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    const receipt = `ss_${crypto6.randomUUID().replace(/-/g, "").slice(0, 28)}`;
    const totalAmountPaise = product.unitAmountPaise * input.quantity;
    const [reservationResult] = await db.execute(sql2`UPDATE ${sellerProducts} SET ${sellerProducts.inventoryQuantity} = ${sellerProducts.inventoryQuantity} - ${input.quantity} WHERE ${sellerProducts.id} = ${product.id} AND ${sellerProducts.merchantOpenId} = ${ctx.user.openId} AND ${sellerProducts.inventoryQuantity} >= ${input.quantity}`);
    if (reservationResult.affectedRows !== 1) throw new Error("Inventory changed while checkout was being prepared. Refresh and try again.");
    try {
      const razorpayOrder = await createMerchantPaymentOrder({ amountPaise: totalAmountPaise, receipt, purpose: "merchant_payment", merchantOpenId: ctx.user.openId, sellerOrderReference: orderReference });
      await db.insert(sellerOrders).values({ merchantOpenId: ctx.user.openId, orderReference, productId: product.id, productName: product.name, quantity: input.quantity, totalAmountPaise, buyerLabel: input.buyerLabel, razorpayOrderId: razorpayOrder.id, paymentObservation: "not_started", fulfillmentState: "unfulfilled" });
      return { sellerOrderReference: orderReference, orderId: razorpayOrder.id, amountPaise: razorpayOrder.amount, currency: razorpayOrder.currency, keyId: process.env.RAZORPAY_KEY_ID, checkoutMode: getRazorpayCheckoutMode(), productName: product.name, quantity: input.quantity };
    } catch (error) {
      await db.execute(sql2`UPDATE ${sellerProducts} SET ${sellerProducts.inventoryQuantity} = ${sellerProducts.inventoryQuantity} + ${input.quantity} WHERE ${sellerProducts.id} = ${product.id} AND ${sellerProducts.merchantOpenId} = ${ctx.user.openId}`);
      throw error;
    }
  }),
  markSellerCheckoutOpened: protectedProcedure.input(z3.object({ orderId: z3.string() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Seller Space storage is unavailable.");
    const record = (await db.select().from(sellerOrders).where(and2(eq3(sellerOrders.razorpayOrderId, input.orderId), eq3(sellerOrders.merchantOpenId, ctx.user.openId))).limit(1))[0];
    if (!record) throw new Error("Unknown Seller Space order.");
    await db.update(sellerOrders).set({ paymentObservation: "checkout_opened" }).where(eq3(sellerOrders.id, record.id));
    return { orderId: input.orderId, status: "checkout_opened" };
  }),
  verifySellerCheckout: protectedProcedure.input(z3.object({ orderId: z3.string(), paymentId: z3.string(), signature: z3.string() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Seller Space storage is unavailable.");
    const record = (await db.select().from(sellerOrders).where(and2(eq3(sellerOrders.razorpayOrderId, input.orderId), eq3(sellerOrders.merchantOpenId, ctx.user.openId))).limit(1))[0];
    if (!record) throw new Error("Unknown Seller Space order.");
    if (!verifyRazorpayCheckoutSignature(input)) throw new Error("Checkout signature verification failed. No payment was treated as captured.");
    await db.update(sellerOrders).set({ paymentObservation: "client_confirmed", razorpayPaymentId: input.paymentId }).where(eq3(sellerOrders.id, record.id));
    return { signatureVerified: true, status: "client_confirmed", sellerOrderReference: record.orderReference };
  }),
  recordSellerFulfillment: protectedProcedure.input(z3.object({ sellerOrderId: z3.number().int().positive(), state: z3.enum(["packed", "shipped", "delivered", "delivery_exception"]), carrier: z3.string().trim().max(120).optional(), trackingReference: z3.string().trim().max(160).optional(), evidenceNote: z3.string().trim().min(4).max(1e3) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Seller Space storage is unavailable.");
    const order = (await db.select().from(sellerOrders).where(and2(eq3(sellerOrders.id, input.sellerOrderId), eq3(sellerOrders.merchantOpenId, ctx.user.openId))).limit(1))[0];
    if (!order) throw new Error("Unknown Seller Space order.");
    await db.insert(sellerFulfillmentEvents).values({ sellerOrderId: order.id, state: input.state, carrier: input.carrier || null, trackingReference: input.trackingReference || null, evidenceNote: input.evidenceNote });
    await db.update(sellerOrders).set({ fulfillmentState: input.state, shippingRecord: input.evidenceNote }).where(eq3(sellerOrders.id, order.id));
    return { orderId: order.id, fulfillmentState: input.state, sourceKind: "merchant_record" };
  }),
  sellerDisputeScenarios: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const orders = await db.select().from(sellerOrders).where(eq3(sellerOrders.merchantOpenId, ctx.user.openId)).limit(50);
    const orderById = new Map(orders.map((order) => [order.id, order]));
    const scenarios = await db.select().from(sellerDisputeScenarios).orderBy(desc2(sellerDisputeScenarios.createdAt)).limit(50);
    return scenarios.filter((scenario2) => orderById.has(scenario2.sellerOrderId)).map((scenario2) => ({ ...scenario2, order: orderById.get(scenario2.sellerOrderId), metadata: scenarioMetadata[scenario2.scenarioType] }));
  }),
  createSellerDisputeScenario: protectedProcedure.input(z3.object({ sellerOrderId: z3.number().int().positive(), scenarioType: z3.enum(SELLER_SCENARIOS), customerStatement: z3.string().trim().min(10).max(1e3).optional(), requestedOutcome: z3.enum(["case_review", "contest_response", "customer_resolution"]) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Seller Space storage is unavailable.");
    const order = (await db.select().from(sellerOrders).where(and2(eq3(sellerOrders.id, input.sellerOrderId), eq3(sellerOrders.merchantOpenId, ctx.user.openId))).limit(1))[0];
    if (!order) throw new Error("Unknown Seller Space order.");
    const paymentObserved = order.paymentObservation === "api_observed" || order.paymentObservation === "webhook_verified" || order.paymentObservation === "client_confirmed";
    const outcome = recommendSellerScenario({ scenarioType: input.scenarioType, paymentObserved, fulfillmentState: order.fulfillmentState });
    const metadata = scenarioMetadata[input.scenarioType];
    const existing = (await db.select().from(sellerDisputeScenarios).where(and2(eq3(sellerDisputeScenarios.sellerOrderId, order.id), eq3(sellerDisputeScenarios.scenarioType, input.scenarioType))).limit(1))[0];
    if (existing) {
      await db.update(sellerDisputeScenarios).set({ customerClaim: input.customerStatement || metadata.claim, requestedOutcome: input.requestedOutcome, recommendation: outcome.recommendation }).where(eq3(sellerDisputeScenarios.id, existing.id));
      return { scenarioId: existing.id, reused: true, scenarioType: input.scenarioType, recommendation: outcome.recommendation, reason: "This order already has an open local review for this claim. Its appeal intake and policy outcome were refreshed from current evidence.", sourceKind: "demonstration_scenario" };
    }
    await db.insert(sellerDisputeScenarios).values({ sellerOrderId: order.id, scenarioType: input.scenarioType, customerClaim: input.customerStatement || metadata.claim, requestedOutcome: input.requestedOutcome, recommendation: outcome.recommendation, scenarioStatus: "ready", sourceKind: "demonstration_scenario" });
    return { reused: false, scenarioType: input.scenarioType, recommendation: outcome.recommendation, reason: outcome.reason, sourceKind: "demonstration_scenario" };
  }),
  approveSellerAppealPacket: protectedProcedure.input(z3.object({ scenarioId: z3.number().int().positive(), approvalPhrase: z3.literal("APPROVE VERIFIED EVIDENCE") })).mutation(async ({ ctx, input }) => {
    const localCases = await localSellerDisputeCases(ctx.user.openId);
    const caseItem = localCases.find((item) => item.id === `LOCAL-${input.scenarioId}`);
    if (!caseItem || caseItem.sourceKind !== "demonstration_scenario") throw new Error("Local Seller Space review not found for this merchant.");
    if (!caseItem.appealPolicy || !canReleaseAppealPacket(caseItem.appealPolicy) || caseItem.validation.policyBlocked) throw new Error("Policy block: a complete, conflict-free evidence set is required before an appeal packet can be approved.");
    const db = await getDb();
    if (db) await db.insert(exportRecords).values({ disputeId: input.scenarioId, approvedBy: ctx.user.openId, approvalPhrase: input.approvalPhrase, exportState: "approved" });
    return { success: true, state: "approved", message: "Merchant approval recorded. The local packet is available for controlled export; no dispute response, refund, or external appeal was submitted." };
  }),
  prepareExternalDisputePacket: protectedProcedure.input(z3.object({ externalDisputeId: z3.string().trim().min(3).max(128), approvalPhrase: z3.literal("PREPARE VERIFIED EXTERNAL PACKET") })).mutation(async ({ ctx, input }) => {
    const externalCases = await signedWebhookDisputeCases(ctx.user.openId);
    const caseItem = externalCases.find((item) => item.externalId === input.externalDisputeId);
    if (!caseItem || caseItem.sourceKind !== "signed_webhook_verified") throw new Error("Only a signed Razorpay webhook dispute can enter external packet preparation.");
    const db = await getDb();
    if (!db) throw new Error("Dispute packet storage is unavailable. No packet state was changed.");
    await db.insert(exportRecords).values({ disputeId: 0, approvedBy: ctx.user.openId, approvalPhrase: input.approvalPhrase, exportState: "approved", packetState: "prepared", sourceKind: "signed_webhook_external", externalDisputeId: input.externalDisputeId });
    return { success: true, state: "prepared", externalDisputeId: input.externalDisputeId, sourceKind: "signed_webhook_external", evidenceGaps: caseItem.validation.missingEvidence, message: "External evidence packet prepared for merchant review. No Razorpay response, refund, contest, or appeal was submitted." };
  }),
  createCustomerOrderAccess: protectedProcedure.input(z3.object({ sellerOrderId: z3.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Seller Space storage is unavailable.");
    const order = (await db.select().from(sellerOrders).where(and2(eq3(sellerOrders.id, input.sellerOrderId), eq3(sellerOrders.merchantOpenId, ctx.user.openId))).limit(1))[0];
    if (!order) throw new Error("Unknown Seller Space order.");
    const accessToken = crypto6.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3);
    await db.insert(customerOrderAccess).values({ sellerOrderId: order.id, merchantOpenId: ctx.user.openId, accessTokenHash: hashCustomerAccessToken(accessToken), active: true, expiresAt });
    return { orderReference: order.orderReference, accessToken, expiresAt, message: "Share this Customer Space access token only with the intended buyer. It binds to the first signed-in customer who redeems it and expires in seven days." };
  }),
  createCustomerCatalogAccess: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Seller Space storage is unavailable.");
    const accessToken = crypto6.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3);
    await db.insert(customerCatalogAccess).values({ merchantOpenId: ctx.user.openId, accessTokenHash: hashCustomerAccessToken(accessToken), active: true, expiresAt });
    return { accessToken, expiresAt, message: "Share this private catalog token only with the intended buyer. It exposes active local products from this merchant and binds to the first signed-in customer who redeems it." };
  }),
  customerCatalogContext: protectedProcedure.input(z3.object({ catalogToken: z3.string().trim().min(32).max(256) })).query(async ({ ctx, input }) => {
    const limit = checkCustomerRateLimit({ buyerOpenId: ctx.user.openId, action: "catalog_redemption" });
    if (!limit.allowed) throw new Error(`Too many catalog access attempts from this signed-in customer. Please wait ${limit.retryAfterSeconds} seconds and try again.`);
    const { db, grant } = await resolveCustomerCatalogAccess(ctx.user.openId, input.catalogToken);
    const products = await getOrSetScopedCache(`catalog:${grant.merchantOpenId}`, 3e4, () => db.select().from(sellerProducts).where(and2(eq3(sellerProducts.merchantOpenId, grant.merchantOpenId), eq3(sellerProducts.status, "active"))).orderBy(desc2(sellerProducts.createdAt)));
    const buyerOrders = await getOrSetScopedCache(`customer-orders:${grant.merchantOpenId}:${ctx.user.openId}`, 1e4, () => db.select().from(sellerOrders).where(and2(eq3(sellerOrders.merchantOpenId, grant.merchantOpenId), eq3(sellerOrders.buyerOpenId, ctx.user.openId))).orderBy(desc2(sellerOrders.createdAt)).limit(10));
    const buyerCases = await db.select().from(customerCases).where(and2(eq3(customerCases.merchantOpenId, grant.merchantOpenId), eq3(customerCases.buyerOpenId, ctx.user.openId))).orderBy(desc2(customerCases.createdAt));
    return {
      catalog: products.map((product) => ({ id: product.id, sku: product.sku, name: product.name, description: product.description, unitAmountPaise: product.unitAmountPaise, inventoryQuantity: product.inventoryQuantity })),
      buyerOrders: summarizeBuyerOrders({ orders: buyerOrders, cases: buyerCases, merchantOpenId: grant.merchantOpenId, buyerOpenId: ctx.user.openId }),
      accessBinding: { expiresAt: grant.expiresAt, accessState: "bound_customer_catalog" },
      sourceBoundary: "local_merchant_catalog"
    };
  }),
  openCustomerOrderFromCatalog: protectedProcedure.input(z3.object({ catalogToken: z3.string().trim().min(32).max(256), sellerOrderId: z3.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { db, grant } = await resolveCustomerCatalogAccess(ctx.user.openId, input.catalogToken);
    const order = (await db.select().from(sellerOrders).where(and2(eq3(sellerOrders.id, input.sellerOrderId), eq3(sellerOrders.merchantOpenId, grant.merchantOpenId), eq3(sellerOrders.buyerOpenId, ctx.user.openId))).limit(1))[0];
    if (!order) throw new Error("This buyer order is not available in the bound catalog workspace.");
    const accessToken = crypto6.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3);
    await db.insert(customerOrderAccess).values({ sellerOrderId: order.id, merchantOpenId: order.merchantOpenId, accessTokenHash: hashCustomerAccessToken(accessToken), boundBuyerOpenId: ctx.user.openId, active: true, redeemedAt: /* @__PURE__ */ new Date(), expiresAt });
    return { orderReference: order.orderReference, accessToken, expiresAt };
  }),
  createCustomerCheckout: protectedProcedure.input(z3.object({ catalogToken: z3.string().trim().min(32).max(256), productId: z3.number().int().positive(), quantity: z3.number().int().min(1).max(10) })).mutation(async ({ ctx, input }) => {
    const { db, grant } = await resolveCustomerCatalogAccess(ctx.user.openId, input.catalogToken);
    const product = (await db.select().from(sellerProducts).where(and2(eq3(sellerProducts.id, input.productId), eq3(sellerProducts.merchantOpenId, grant.merchantOpenId), eq3(sellerProducts.status, "active"))).limit(1))[0];
    if (!product || !inventoryReservationOutcome({ availableQuantity: product.inventoryQuantity, requestedQuantity: input.quantity }).reserved) throw new Error("This local merchant product is unavailable in the requested quantity.");
    const orderReference = `CS-${crypto6.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    const receipt = `cs_${crypto6.randomUUID().replace(/-/g, "").slice(0, 28)}`;
    const totalAmountPaise = product.unitAmountPaise * input.quantity;
    const [reservationResult] = await db.execute(sql2`UPDATE ${sellerProducts} SET ${sellerProducts.inventoryQuantity} = ${sellerProducts.inventoryQuantity} - ${input.quantity} WHERE ${sellerProducts.id} = ${product.id} AND ${sellerProducts.merchantOpenId} = ${grant.merchantOpenId} AND ${sellerProducts.inventoryQuantity} >= ${input.quantity}`);
    if (reservationResult.affectedRows !== 1) throw new Error("Inventory changed while checkout was being prepared. Refresh and try again.");
    try {
      const razorpayOrder = await createMerchantPaymentOrder({ amountPaise: totalAmountPaise, receipt, purpose: "merchant_payment", merchantOpenId: grant.merchantOpenId, sellerOrderReference: orderReference });
      await db.insert(sellerOrders).values({ merchantOpenId: grant.merchantOpenId, orderReference, productId: product.id, productName: product.name, quantity: input.quantity, totalAmountPaise, buyerLabel: ctx.user.name?.slice(0, 120) || "Authenticated customer", buyerOpenId: ctx.user.openId, razorpayOrderId: razorpayOrder.id, paymentObservation: "not_started", fulfillmentState: "unfulfilled" });
      invalidateScopedCache(`customer-orders:${grant.merchantOpenId}:${ctx.user.openId}`);
      return { sellerOrderReference: orderReference, orderId: razorpayOrder.id, amountPaise: razorpayOrder.amount, currency: razorpayOrder.currency, keyId: process.env.RAZORPAY_KEY_ID, checkoutMode: getRazorpayCheckoutMode(), productName: product.name, quantity: input.quantity, sourceBoundary: "customer_initiated_local_order" };
    } catch (error) {
      await db.execute(sql2`UPDATE ${sellerProducts} SET ${sellerProducts.inventoryQuantity} = ${sellerProducts.inventoryQuantity} + ${input.quantity} WHERE ${sellerProducts.id} = ${product.id} AND ${sellerProducts.merchantOpenId} = ${grant.merchantOpenId}`);
      throw error;
    }
  }),
  markCustomerCheckoutOpened: protectedProcedure.input(z3.object({ orderId: z3.string() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Customer Space storage is unavailable.");
    const order = (await db.select().from(sellerOrders).where(and2(eq3(sellerOrders.razorpayOrderId, input.orderId), eq3(sellerOrders.buyerOpenId, ctx.user.openId))).limit(1))[0];
    if (!order) throw new Error("Unknown customer checkout order.");
    await db.update(sellerOrders).set({ paymentObservation: "checkout_opened" }).where(eq3(sellerOrders.id, order.id));
    invalidateScopedCache(`customer-orders:${order.merchantOpenId}:${ctx.user.openId}`);
    return { orderReference: order.orderReference, status: "checkout_opened" };
  }),
  verifyCustomerCheckout: protectedProcedure.input(z3.object({ orderId: z3.string(), paymentId: z3.string(), signature: z3.string() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Customer Space storage is unavailable.");
    const order = (await db.select().from(sellerOrders).where(and2(eq3(sellerOrders.razorpayOrderId, input.orderId), eq3(sellerOrders.buyerOpenId, ctx.user.openId))).limit(1))[0];
    if (!order) throw new Error("Unknown customer checkout order.");
    if (!verifyRazorpayCheckoutSignature(input)) throw new Error("Checkout signature verification failed. No payment was treated as captured.");
    await db.update(sellerOrders).set({ paymentObservation: "client_confirmed", razorpayPaymentId: input.paymentId }).where(eq3(sellerOrders.id, order.id));
    invalidateScopedCache(`customer-orders:${order.merchantOpenId}:${ctx.user.openId}`);
    const accessToken = crypto6.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3);
    await db.insert(customerOrderAccess).values({ sellerOrderId: order.id, merchantOpenId: order.merchantOpenId, accessTokenHash: hashCustomerAccessToken(accessToken), boundBuyerOpenId: ctx.user.openId, active: true, redeemedAt: /* @__PURE__ */ new Date(), expiresAt });
    return { signatureVerified: true, status: "client_confirmed", sellerOrderReference: order.orderReference, orderAccessToken: accessToken, orderAccessExpiresAt: expiresAt, message: "Checkout signature verified. This buyer can now access the local order and issue workflow. Razorpay API or a signed webhook independently determines final capture state." };
  }),
  customerOrderContext: protectedProcedure.input(z3.object({ accessToken: z3.string().trim().min(32).max(256) })).query(async ({ ctx, input }) => {
    const { order, grant } = await resolveCustomerAccess(ctx.user.openId, input.accessToken);
    return {
      accessBinding: { expiresAt: grant.expiresAt, accessState: "bound_customer_order" },
      order: {
        id: order.id,
        orderReference: order.orderReference,
        productName: order.productName,
        quantity: order.quantity,
        totalAmountPaise: order.totalAmountPaise,
        currency: order.currency,
        paymentObservation: order.paymentObservation,
        fulfillmentState: order.fulfillmentState,
        createdAt: order.createdAt
      },
      issueGuidance: CUSTOMER_ISSUE_TYPES.map((issueType) => ({ issueType, ...CUSTOMER_CASE_GUIDANCE[issueType] })),
      sourceBoundary: "local_customer_case"
    };
  }),
  customerCases: protectedProcedure.input(z3.object({ accessToken: z3.string().trim().min(32).max(256) })).query(async ({ ctx, input }) => {
    const { db, order } = await resolveCustomerAccess(ctx.user.openId, input.accessToken);
    const cases = await db.select().from(customerCases).where(and2(eq3(customerCases.sellerOrderId, order.id), eq3(customerCases.buyerOpenId, ctx.user.openId))).orderBy(desc2(customerCases.createdAt));
    return Promise.all(cases.map(async (caseItem) => {
      const [documents, events, returnReceipt, refundRequest] = await Promise.all([
        db.select().from(customerCaseDocuments).where(and2(eq3(customerCaseDocuments.customerCaseId, caseItem.id), eq3(customerCaseDocuments.buyerOpenId, ctx.user.openId))).orderBy(desc2(customerCaseDocuments.createdAt)),
        db.select().from(customerCaseEvents).where(eq3(customerCaseEvents.customerCaseId, caseItem.id)).orderBy(desc2(customerCaseEvents.createdAt)),
        db.select().from(customerReturnReceipts).where(eq3(customerReturnReceipts.customerCaseId, caseItem.id)).limit(1),
        db.select().from(customerRefundRequests).where(eq3(customerRefundRequests.customerCaseId, caseItem.id)).limit(1)
      ]);
      const documentRows = await Promise.all(documents.filter((document) => isCustomerScopedRecord({ record: document, merchantOpenId: order.merchantOpenId, buyerOpenId: ctx.user.openId })).map(async (document) => ({
        id: document.id,
        declaredKind: document.declaredKind,
        originalName: document.originalName,
        contentType: document.contentType,
        byteSize: document.byteSize,
        createdAt: document.createdAt,
        extraction: (await db.select().from(customerDocumentExtractions).where(eq3(customerDocumentExtractions.customerCaseDocumentId, document.id)).limit(1))[0] ?? null
      })));
      const receipt = returnReceipt[0] ?? null;
      const refund = refundRequest[0] ?? null;
      return { ...caseItem, guidance: CUSTOMER_CASE_GUIDANCE[caseItem.issueType], documents: documentRows, events, returnReceipt: receipt, refundRequest: refund, recommendation: universalCaseRecommendation({ caseItem, documentRows, order, returnReceipt: receipt, refundRequest: refund }) };
    }));
  }),
  createCustomerCase: protectedProcedure.input(z3.object({ accessToken: z3.string().trim().min(32).max(256), issueType: z3.enum(CUSTOMER_ISSUE_TYPES), customerStatement: z3.string().trim().min(12).max(2e3), returnReason: z3.string().trim().min(3).max(160).optional() })).mutation(async ({ ctx, input }) => {
    const limit = checkCustomerRateLimit({ buyerOpenId: ctx.user.openId, action: "case_creation" });
    if (!limit.allowed) throw new Error(`Too many local case submissions from this signed-in customer. Please wait ${limit.retryAfterSeconds} seconds and try again.`);
    const { db, order } = await resolveCustomerAccess(ctx.user.openId, input.accessToken);
    const customerStatement = sanitizePlainText(input.customerStatement);
    const returnReason = input.returnReason ? sanitizePlainText(input.returnReason) : void 0;
    if (customerStatement.length < 12) throw new Error("Provide a factual local-case statement with at least 12 visible characters.");
    if (["return_request", "damaged_or_wrong_item"].includes(input.issueType) && (!returnReason || returnReason.length < 3)) throw new Error("A return or item-condition reason is required for this customer case.");
    const caseReference = `CS-${crypto6.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    await db.insert(customerCases).values({ caseReference, sellerOrderId: order.id, merchantOpenId: order.merchantOpenId, buyerOpenId: ctx.user.openId, issueType: input.issueType, customerStatement, returnReason: returnReason || null, status: "draft" });
    const caseItem = (await db.select().from(customerCases).where(eq3(customerCases.caseReference, caseReference)).limit(1))[0];
    if (!caseItem) throw new Error("Customer case creation could not be confirmed.");
    await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "customer", actorOpenId: ctx.user.openId, eventType: "case_drafted", detail: `${CUSTOMER_CASE_GUIDANCE[input.issueType].label} case drafted by customer.`, sourceRefs: JSON.stringify({ orderReference: order.orderReference, sourceKind: "customer_local_case" }) });
    invalidateScopedCache(`customer-orders:${order.merchantOpenId}:${ctx.user.openId}`);
    return { caseReference, status: "draft", guidance: CUSTOMER_CASE_GUIDANCE[input.issueType], sourceBoundary: "local_customer_case" };
  }),
  analyzeCustomerCaseSentiment: protectedProcedure.input(z3.object({ accessToken: z3.string().trim().min(32).max(256), caseReference: z3.string().trim().min(3).max(64) })).mutation(async ({ ctx, input }) => {
    const { db, order } = await resolveCustomerAccess(ctx.user.openId, input.accessToken);
    const caseItem = (await db.select().from(customerCases).where(and2(eq3(customerCases.caseReference, input.caseReference), eq3(customerCases.sellerOrderId, order.id), eq3(customerCases.buyerOpenId, ctx.user.openId))).limit(1))[0];
    if (!caseItem) throw new Error("This local case is not available to the signed-in customer.");
    const analysis = await analyzeCustomerStatementWithOllama(caseItem.customerStatement);
    return { caseReference: caseItem.caseReference, analysis, sourceBoundary: "local_customer_statement_advisory_only" };
  }),
  createSyntheticCustomerValidationOrder: protectedProcedure.input(z3.object({ acknowledgement: z3.literal("SYNTHETIC_LOCAL_VALIDATION_ONLY") })).mutation(async ({ ctx }) => {
    if (ctx.user.openId !== ENV.ownerOpenId || ctx.user.role !== "admin") throw new Error("This local validation fixture is restricted to the project owner.");
    const db = await getDb();
    if (!db) throw new Error("Customer Space storage is unavailable.");
    const product = (await db.select().from(sellerProducts).where(and2(eq3(sellerProducts.merchantOpenId, ctx.user.openId), eq3(sellerProducts.status, "active"))).orderBy(desc2(sellerProducts.createdAt)).limit(1))[0];
    if (!product) throw new Error("Create an active merchant product before starting the local validation fixture.");
    const fixtureSuffix = crypto6.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
    const orderReference = `SYN-UI-${fixtureSuffix}`;
    await db.insert(sellerOrders).values({ merchantOpenId: ctx.user.openId, orderReference, productId: product.id, productName: product.name, quantity: 1, totalAmountPaise: product.unitAmountPaise, buyerLabel: "Synthetic local validation buyer \u2014 no payment", buyerOpenId: ctx.user.openId, shippingRecord: "SYNTHETIC LOCAL VALIDATION ONLY \u2014 no shipping event", paymentObservation: "not_started", fulfillmentState: "unfulfilled", sourceKind: "merchant_record" });
    const order = (await db.select().from(sellerOrders).where(and2(eq3(sellerOrders.orderReference, orderReference), eq3(sellerOrders.merchantOpenId, ctx.user.openId))).limit(1))[0];
    if (!order) throw new Error("The local validation order could not be confirmed.");
    const accessToken = crypto6.randomBytes(32).toString("hex");
    await db.insert(customerOrderAccess).values({ sellerOrderId: order.id, merchantOpenId: ctx.user.openId, accessTokenHash: hashCustomerAccessToken(accessToken), boundBuyerOpenId: ctx.user.openId, active: true, expiresAt: new Date(Date.now() + 30 * 60 * 1e3), redeemedAt: /* @__PURE__ */ new Date() });
    invalidateScopedCache(`customer-orders:${ctx.user.openId}:${ctx.user.openId}`);
    return { accessToken, orderReference, sourceBoundary: "synthetic_local_validation_only", warning: "This local validation order has no payment, carrier, return, refund, or external dispute state. Complete the protected Customer Space steps explicitly." };
  }),
  seedSyntheticJudgeDemo: protectedProcedure.input(z3.object({ acknowledgement: z3.literal(DEMO_SEED_ACKNOWLEDGEMENT) })).mutation(async ({ ctx, input }) => {
    const permission = demoSeedAllowed({ isProduction: ENV.isProduction, isOwner: ctx.user.openId === ENV.ownerOpenId, isAdmin: ctx.user.role === "admin", acknowledgement: input.acknowledgement });
    if (!permission.allowed) throw new Error(permission.reason);
    const db = await getDb();
    if (!db) throw new Error("Demo seed storage is unavailable.");
    const existingProduct = (await db.select().from(sellerProducts).where(and2(eq3(sellerProducts.merchantOpenId, ctx.user.openId), eq3(sellerProducts.sku, "DS-JUDGE-DEMO"))).limit(1))[0];
    if (!existingProduct) await db.insert(sellerProducts).values({ merchantOpenId: ctx.user.openId, sku: "DS-JUDGE-DEMO", name: "Synthetic fulfilment evidence kit", description: "SYNTHETIC LOCAL DEMO ONLY \u2014 not a saleable customer product.", unitAmountPaise: 129900, inventoryQuantity: 99, status: "active" });
    const product = existingProduct ?? (await db.select().from(sellerProducts).where(and2(eq3(sellerProducts.merchantOpenId, ctx.user.openId), eq3(sellerProducts.sku, "DS-JUDGE-DEMO"))).limit(1))[0];
    if (!product) throw new Error("Synthetic demo product could not be prepared.");
    const orders = [
      { orderReference: "JUDGE-DEMO-001", buyerLabel: "Synthetic buyer A \u2014 local only", totalAmountPaise: 129900, paymentObservation: "api_observed", fulfillmentState: "delivery_exception", shippingRecord: "SYNTHETIC merchant record: delivery proof missing" },
      { orderReference: "JUDGE-DEMO-002", buyerLabel: "Synthetic buyer B \u2014 local only", totalAmountPaise: 129900, paymentObservation: "api_observed", fulfillmentState: "shipped", shippingRecord: "SYNTHETIC merchant record: tracking reference pending review" },
      { orderReference: "JUDGE-DEMO-003", buyerLabel: "Synthetic buyer C \u2014 local only", totalAmountPaise: 129900, paymentObservation: "not_started", fulfillmentState: "delivered", shippingRecord: "SYNTHETIC merchant record: local delivery noted" }
    ];
    for (const fixture of orders) {
      const existing = (await db.select().from(sellerOrders).where(and2(eq3(sellerOrders.merchantOpenId, ctx.user.openId), eq3(sellerOrders.orderReference, fixture.orderReference))).limit(1))[0];
      const values = { productId: product.id, productName: product.name, quantity: 1, buyerLabel: fixture.buyerLabel, buyerOpenId: ctx.user.openId, totalAmountPaise: fixture.totalAmountPaise, currency: "INR", paymentObservation: fixture.paymentObservation, fulfillmentState: fixture.fulfillmentState, shippingRecord: fixture.shippingRecord, sourceKind: "merchant_record" };
      if (existing) await db.update(sellerOrders).set(values).where(eq3(sellerOrders.id, existing.id));
      else await db.insert(sellerOrders).values({ merchantOpenId: ctx.user.openId, orderReference: fixture.orderReference, ...values });
    }
    const seededOrders = await db.select().from(sellerOrders).where(eq3(sellerOrders.merchantOpenId, ctx.user.openId));
    const orderMap = new Map(seededOrders.filter((order) => order.orderReference.startsWith("JUDGE-DEMO-")).map((order) => [order.orderReference, order]));
    const cases = [
      { caseReference: "JUDGE-CASE-001", orderReference: "JUDGE-DEMO-001", issueType: "product_not_received", status: "merchant_review", customerStatement: "SYNTHETIC LOCAL DEMO ONLY \u2014 delivery proof is unavailable for merchant review." },
      { caseReference: "JUDGE-CASE-002", orderReference: "JUDGE-DEMO-002", issueType: "refund_issue", status: "evidence_pending", customerStatement: "SYNTHETIC LOCAL DEMO ONLY \u2014 local refund evidence needs merchant review." },
      { caseReference: "JUDGE-CASE-003", orderReference: "JUDGE-DEMO-003", issueType: "return_request", status: "return_authorized", customerStatement: "SYNTHETIC LOCAL DEMO ONLY \u2014 return receipt has not been recorded." }
    ];
    for (const fixture of cases) {
      const order = orderMap.get(fixture.orderReference);
      if (!order) continue;
      const existing = (await db.select().from(customerCases).where(and2(eq3(customerCases.merchantOpenId, ctx.user.openId), eq3(customerCases.caseReference, fixture.caseReference))).limit(1))[0];
      const values = { sellerOrderId: order.id, buyerOpenId: ctx.user.openId, issueType: fixture.issueType, status: fixture.status, customerStatement: fixture.customerStatement, sourceKind: "customer_local_case" };
      if (existing) await db.update(customerCases).set(values).where(eq3(customerCases.id, existing.id));
      else {
        await db.insert(customerCases).values({ merchantOpenId: ctx.user.openId, caseReference: fixture.caseReference, ...values });
        const inserted = (await db.select().from(customerCases).where(and2(eq3(customerCases.merchantOpenId, ctx.user.openId), eq3(customerCases.caseReference, fixture.caseReference))).limit(1))[0];
        if (inserted) await db.insert(customerCaseEvents).values({ customerCaseId: inserted.id, actorType: "system", actorOpenId: null, eventType: "synthetic_judge_demo_seeded", detail: "SYNTHETIC LOCAL DEMO ONLY \u2014 created for a safe judge walkthrough; no payment, carrier, refund, or external dispute event exists.", sourceRefs: JSON.stringify({ demoSeedBatchId: "DS-JUDGE-2026-08-24.1" }) });
      }
    }
    invalidateScopedCache(`customer-orders:${ctx.user.openId}:${ctx.user.openId}`);
    return { productSku: product.sku, orderReferences: orders.map((order) => order.orderReference), caseReferences: cases.map((caseItem) => caseItem.caseReference), demoSeedBatchId: "DS-JUDGE-2026-08-24.1", boundary: "Idempotent synthetic local demo data only. No Razorpay order, payment, webhook, refund, external dispute, or issuer outcome is created by this action." };
  }),
  uploadCustomerCaseDocument: protectedProcedure.input(z3.object({ accessToken: z3.string().trim().min(32).max(256), caseReference: z3.string().trim().min(3).max(64), declaredKind: z3.enum(CUSTOMER_DOCUMENT_KINDS), originalName: z3.string().trim().min(1).max(255), contentType: z3.enum(CUSTOMER_DOCUMENT_TYPES), contentBase64: z3.string().min(16).max(5e6), useGeminiAssistance: z3.boolean().default(false) })).mutation(async ({ ctx, input }) => {
    const limit = checkCustomerRateLimit({ buyerOpenId: ctx.user.openId, action: "document_upload" });
    if (!limit.allowed) throw new Error(`Too many document uploads from this signed-in customer. Please wait ${limit.retryAfterSeconds} seconds and try again.`);
    const { db, order } = await resolveCustomerAccess(ctx.user.openId, input.accessToken);
    const caseItem = (await db.select().from(customerCases).where(and2(eq3(customerCases.caseReference, input.caseReference), eq3(customerCases.sellerOrderId, order.id), eq3(customerCases.buyerOpenId, ctx.user.openId), eq3(customerCases.merchantOpenId, order.merchantOpenId))).limit(1))[0];
    if (!caseItem || ["resolved", "closed", "withdrawn"].includes(caseItem.status)) throw new Error("This case cannot accept customer documents.");
    const fileData = Buffer.from(input.contentBase64, "base64");
    if (!fileData.length || fileData.length > CUSTOMER_DOCUMENT_MAX_BYTES || !validCustomerDocumentSignature(input.contentType, fileData)) {
      recordOperationalTelemetry(order.merchantOpenId, "evidence_rejected");
      throw new Error("Only a valid JPEG, PNG, WebP, or PDF up to 3.5 MB can be added to this case.");
    }
    const sha2562 = crypto6.createHash("sha256").update(fileData).digest("hex");
    const fileKeyPrefix = `customer-cases/${order.merchantOpenId}/${caseItem.id}/${crypto6.randomUUID()}`;
    const stored = await storagePut(`${fileKeyPrefix}-${safeCustomerFileName(input.originalName)}.${customerDocumentExtension(input.contentType)}`, fileData, input.contentType);
    await db.insert(customerCaseDocuments).values({ customerCaseId: caseItem.id, merchantOpenId: order.merchantOpenId, buyerOpenId: ctx.user.openId, declaredKind: input.declaredKind, originalName: safeCustomerFileName(input.originalName), contentType: input.contentType, byteSize: fileData.length, sha256: sha2562, fileKey: stored.key });
    const document = (await db.select().from(customerCaseDocuments).where(eq3(customerCaseDocuments.fileKey, stored.key)).limit(1))[0];
    if (!document) throw new Error("Customer document storage could not be confirmed.");
    await db.insert(customerDocumentExtractions).values({ customerCaseDocumentId: document.id, model: "pending", status: "pending" });
    await appendPrivateIntegrityAnchor(db, { merchantOpenId: order.merchantOpenId, customerCaseId: caseItem.id, anchorType: "document_checksum", sourceRecordId: String(document.id), payloadHash: document.sha256, createdBy: ctx.user.openId });
    await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "customer", actorOpenId: ctx.user.openId, eventType: "document_uploaded", detail: `${document.originalName} was added as ${input.declaredKind.replaceAll("_", " ")}.`, sourceRefs: JSON.stringify({ documentId: document.id, sha256: sha2562 }) });
    if (!input.useGeminiAssistance) {
      await db.update(customerDocumentExtractions).set({ model: "not_requested", status: "failed", summary: "Customer did not request Gemini evidence assistance. The original document is available for direct merchant review.", warningsJson: JSON.stringify(["No AI extraction was requested by the customer."]) }).where(eq3(customerDocumentExtractions.customerCaseDocumentId, document.id));
      await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "customer", actorOpenId: ctx.user.openId, eventType: "gemini_assistance_not_requested", detail: "Customer retained the original document for direct merchant review without requesting Gemini assistance.", sourceRefs: JSON.stringify({ documentId: document.id }) });
      return { documentId: document.id, extraction: null, sourceBoundary: "original_document_human_review" };
    }
    try {
      const { model, extraction } = await extractCustomerDocument({ contentType: input.contentType, data: fileData, linkedOrderReference: order.orderReference, issueType: caseItem.issueType });
      await db.update(customerDocumentExtractions).set({ model, status: "complete", documentType: extraction.documentType, summary: extraction.summary, fieldsJson: JSON.stringify(extraction.fields), warningsJson: JSON.stringify(extraction.warnings), overallConfidence: extraction.overallConfidence }).where(eq3(customerDocumentExtractions.customerCaseDocumentId, document.id));
      await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "system", actorOpenId: null, eventType: "ocr_extraction_complete", detail: `Candidate document facts extracted at ${extraction.overallConfidence}% confidence. Customer confirmation is required.`, sourceRefs: JSON.stringify({ documentId: document.id, model }) });
      return { documentId: document.id, extraction: { ...extraction, customerConfirmation: "not_reviewed" }, sourceBoundary: "ocr_candidate" };
    } catch (error) {
      await db.update(customerDocumentExtractions).set({ model: "unavailable", status: "failed", summary: "No extraction was produced. The original document remains available for merchant review.", warningsJson: JSON.stringify(["OCR extraction failed; this document needs direct human review."]) }).where(eq3(customerDocumentExtractions.customerCaseDocumentId, document.id));
      await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "system", actorOpenId: null, eventType: "ocr_extraction_failed", detail: "OCR extraction was unavailable. The original document was retained for direct merchant review.", sourceRefs: JSON.stringify({ documentId: document.id }) });
      return { documentId: document.id, extraction: null, sourceBoundary: "original_document_human_review", warning: error instanceof Error ? error.message : "OCR extraction was unavailable." };
    }
  }),
  confirmCustomerDocumentExtraction: protectedProcedure.input(z3.object({ accessToken: z3.string().trim().min(32).max(256), documentId: z3.number().int().positive(), confirmation: z3.enum(["confirmed", "corrected", "rejected"]), corrections: z3.record(z3.string(), z3.string().max(500)).optional() })).mutation(async ({ ctx, input }) => {
    const { db, order } = await resolveCustomerAccess(ctx.user.openId, input.accessToken);
    const document = (await db.select().from(customerCaseDocuments).where(and2(eq3(customerCaseDocuments.id, input.documentId), eq3(customerCaseDocuments.buyerOpenId, ctx.user.openId), eq3(customerCaseDocuments.merchantOpenId, order.merchantOpenId))).limit(1))[0];
    if (!document || !isCustomerScopedRecord({ record: document, merchantOpenId: order.merchantOpenId, buyerOpenId: ctx.user.openId })) throw new Error("This customer document is not available in the bound order workspace.");
    const caseItem = (await db.select().from(customerCases).where(and2(eq3(customerCases.id, document.customerCaseId), eq3(customerCases.sellerOrderId, order.id))).limit(1))[0];
    if (!caseItem) throw new Error("The document is not linked to the bound customer case.");
    await db.update(customerDocumentExtractions).set({ customerConfirmation: input.confirmation, customerCorrectionsJson: input.confirmation === "corrected" ? JSON.stringify(input.corrections || {}) : null }).where(eq3(customerDocumentExtractions.customerCaseDocumentId, document.id));
    await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "customer", actorOpenId: ctx.user.openId, eventType: `ocr_${input.confirmation}`, detail: input.confirmation === "confirmed" ? "Customer confirmed the OCR candidate facts." : input.confirmation === "corrected" ? "Customer corrected the OCR candidate facts; the original extraction remains retained." : "Customer rejected the OCR candidate facts; direct merchant review is required.", sourceRefs: JSON.stringify({ documentId: document.id }) });
    return { documentId: document.id, confirmation: input.confirmation };
  }),
  customerCaseAction: protectedProcedure.input(z3.object({ accessToken: z3.string().trim().min(32).max(256), caseReference: z3.string().trim().min(3).max(64), action: z3.enum(["submit", "withdraw", "provide_evidence", "mark_return_in_transit", "accept_resolution"]), note: z3.string().trim().min(3).max(1e3).optional() })).mutation(async ({ ctx, input }) => {
    const { db, order } = await resolveCustomerAccess(ctx.user.openId, input.accessToken);
    const caseItem = (await db.select().from(customerCases).where(and2(eq3(customerCases.caseReference, input.caseReference), eq3(customerCases.sellerOrderId, order.id), eq3(customerCases.buyerOpenId, ctx.user.openId))).limit(1))[0];
    if (!caseItem) throw new Error("Customer case not found in the bound order workspace.");
    const documents = await db.select().from(customerCaseDocuments).where(eq3(customerCaseDocuments.customerCaseId, caseItem.id));
    const extractionRows = await Promise.all(documents.map((document) => db.select().from(customerDocumentExtractions).where(eq3(customerDocumentExtractions.customerCaseDocumentId, document.id)).limit(1)));
    const hasUnreviewedExtraction = extractionRows.flat().some((extraction) => extraction.status === "complete" && extraction.customerConfirmation === "not_reviewed");
    if (input.action === "submit" && (documents.length === 0 || hasUnreviewedExtraction)) {
      await db.update(customerCases).set({ status: "evidence_pending" }).where(eq3(customerCases.id, caseItem.id));
      await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "system", actorOpenId: null, eventType: "submission_blocked_evidence_pending", detail: documents.length === 0 ? "Customer submission paused until at least one evidence item is added or a merchant explicitly requests a statement-only review." : "Customer submission paused until OCR candidates are confirmed, corrected, or rejected.", sourceRefs: null });
      return { status: "evidence_pending", message: "Add evidence and review each OCR candidate before submitting this local customer case." };
    }
    const nextStatus = transitionCustomerCase({ status: caseItem.status, actor: "customer", action: input.action, issueType: caseItem.issueType });
    await db.update(customerCases).set({ status: nextStatus, submittedAt: input.action === "submit" ? /* @__PURE__ */ new Date() : caseItem.submittedAt, closedAt: ["withdraw", "accept_resolution"].includes(input.action) ? /* @__PURE__ */ new Date() : caseItem.closedAt }).where(eq3(customerCases.id, caseItem.id));
    await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "customer", actorOpenId: ctx.user.openId, eventType: `customer_${input.action}`, detail: input.note || `Customer moved the local case to ${nextStatus.replaceAll("_", " ")}.`, sourceRefs: JSON.stringify({ sourceKind: "customer_local_case" }) });
    return { status: nextStatus, message: nextStatus === "submitted" ? "Case submitted for merchant review. No refund or external dispute was created." : "Customer case status updated." };
  }),
  merchantCustomerCases: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const cases = await db.select().from(customerCases).where(eq3(customerCases.merchantOpenId, ctx.user.openId)).orderBy(desc2(customerCases.updatedAt));
    return Promise.all(cases.map(async (caseItem) => {
      const [order, documents, events, returnReceipt, refundRequest, integrityAnchors] = await Promise.all([
        db.select().from(sellerOrders).where(and2(eq3(sellerOrders.id, caseItem.sellerOrderId), eq3(sellerOrders.merchantOpenId, ctx.user.openId))).limit(1),
        db.select().from(customerCaseDocuments).where(and2(eq3(customerCaseDocuments.customerCaseId, caseItem.id), eq3(customerCaseDocuments.merchantOpenId, ctx.user.openId))).orderBy(desc2(customerCaseDocuments.createdAt)),
        db.select().from(customerCaseEvents).where(eq3(customerCaseEvents.customerCaseId, caseItem.id)).orderBy(desc2(customerCaseEvents.createdAt)),
        db.select().from(customerReturnReceipts).where(and2(eq3(customerReturnReceipts.customerCaseId, caseItem.id), eq3(customerReturnReceipts.merchantOpenId, ctx.user.openId))).limit(1),
        db.select().from(customerRefundRequests).where(and2(eq3(customerRefundRequests.customerCaseId, caseItem.id), eq3(customerRefundRequests.merchantOpenId, ctx.user.openId))).limit(1),
        db.select({ sourceRecordId: customerCaseIntegrityAnchors.sourceRecordId }).from(customerCaseIntegrityAnchors).where(and2(eq3(customerCaseIntegrityAnchors.customerCaseId, caseItem.id), eq3(customerCaseIntegrityAnchors.merchantOpenId, ctx.user.openId), eq3(customerCaseIntegrityAnchors.anchorType, "document_checksum")))
      ]);
      const anchoredDocumentIds = new Set(integrityAnchors.map((anchor) => anchor.sourceRecordId));
      const documentRows = await Promise.all(documents.map(async (document) => ({ ...document, privateIntegrityAnchor: anchoredDocumentIds.has(String(document.id)), extraction: (await db.select().from(customerDocumentExtractions).where(eq3(customerDocumentExtractions.customerCaseDocumentId, document.id)).limit(1))[0] ?? null })));
      const receipt = returnReceipt[0] ?? null;
      const refund = refundRequest[0] ?? null;
      const linkedOrder = order[0] ?? null;
      return { ...caseItem, order: linkedOrder, documents: documentRows, events, returnReceipt: receipt, refundRequest: refund, guidance: CUSTOMER_CASE_GUIDANCE[caseItem.issueType], recommendation: universalCaseRecommendation({ caseItem, documentRows, order: linkedOrder, returnReceipt: receipt, refundRequest: refund }), networkEvidenceMapping: getReasonCodeMapping(caseItem.issueType), sourceBoundary: "local_customer_case" };
    }));
  }),
  merchantCaseOperations: protectedProcedure.input(z3.object({
    merchantOpenId: z3.string().trim().min(3).max(64).optional(),
    search: z3.string().trim().max(120).optional(),
    issueType: z3.enum(CUSTOMER_ISSUE_TYPES).or(z3.literal("all")).optional(),
    status: z3.string().trim().max(64).optional(),
    readiness: z3.enum(["all", "needs_evidence", "ready"]).optional(),
    from: z3.date().optional(),
    to: z3.date().optional(),
    page: z3.number().int().min(1).max(1e4).optional(),
    pageSize: z3.number().int().min(1).max(50).optional()
  }).optional()).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return { cases: [], trends: [], buyerPatternSignals: [], usage: buildUsageMeter({ orderCount: 0, caseCount: 0, documentCount: 0, webhookCount: 0 }), boundary: "Merchant operations storage is unavailable; no case signal was inferred." };
    const merchantOpenId = input?.merchantOpenId ?? ctx.user.openId;
    await requireMerchantTeamRole(db, ctx.user.openId, merchantOpenId, "viewer");
    const [caseRows, orders, documentRows, escalationRows, eventRows, refundRows] = await Promise.all([
      db.select().from(customerCases).where(eq3(customerCases.merchantOpenId, merchantOpenId)).orderBy(desc2(customerCases.updatedAt)),
      db.select().from(sellerOrders).where(eq3(sellerOrders.merchantOpenId, merchantOpenId)),
      db.select().from(customerCaseDocuments).where(eq3(customerCaseDocuments.merchantOpenId, merchantOpenId)),
      db.select().from(customerCaseEscalations).where(eq3(customerCaseEscalations.merchantOpenId, merchantOpenId)),
      db.select({ id: webhookEvents.id }).from(webhookEvents).where(eq3(webhookEvents.merchantOpenId, merchantOpenId)),
      db.select().from(customerRefundRequests).where(eq3(customerRefundRequests.merchantOpenId, merchantOpenId))
    ]);
    const orderById = new Map(orders.map((order) => [order.id, order]));
    const documentsByCase = /* @__PURE__ */ new Map();
    for (const document of documentRows) documentsByCase.set(document.customerCaseId, [...documentsByCase.get(document.customerCaseId) ?? [], document]);
    const escalationByCase = new Map(escalationRows.map((escalation) => [escalation.customerCaseId, escalation]));
    const refundByCase = new Map(refundRows.map((refund) => [refund.customerCaseId, refund]));
    const enriched = caseRows.map((caseItem) => {
      const order = orderById.get(caseItem.sellerOrderId) ?? null;
      const readiness = calculateCustomerCaseEvidenceReadiness({ issueType: caseItem.issueType, documentKinds: (documentsByCase.get(caseItem.id) ?? []).map((document) => document.declaredKind) });
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
        razorpayEvidenceExportPreview: buildRazorpayEvidenceExportPreview({ issueType: caseItem.issueType, documentKinds: (documentsByCase.get(caseItem.id) ?? []).map((document) => document.declaredKind), paymentObservation: order?.paymentObservation ?? "not_started", refundConfirmed: refundByCase.get(caseItem.id)?.status === "razorpay_confirmed" }),
        escalation: escalation ? { ownerLabel: escalation.ownerLabel, level: escalation.level, escalationNote: escalation.escalationNote, acknowledgedAt: escalation.acknowledgedAt, resolvedAt: escalation.resolvedAt, updatedAt: escalation.updatedAt } : { ownerLabel: "Merchant review", level: "watch", escalationNote: "No manual ownership or escalation has been recorded.", acknowledgedAt: null, resolvedAt: null, updatedAt: caseItem.updatedAt },
        slaLevel: escalation?.level === "elevated" ? "elevated" : escalation?.level === "review" ? "review" : escalation?.level === "resolved" ? "resolved" : "watch"
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
      boundary: "Search, trends, and buyer-pattern signals are merchant-scoped operational triage. They do not label a buyer, decide a case, alter eligibility, or trigger money movement or external communication."
    };
  }),
  merchantTeamWorkspaces: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { workspaces: [{ merchantOpenId: ctx.user.openId, role: "owner" }], boundary: MERCHANT_TEAM_BOUNDARY };
    const memberships = await db.select().from(merchantTeamMemberships).where(and2(eq3(merchantTeamMemberships.memberOpenId, ctx.user.openId), eq3(merchantTeamMemberships.active, true)));
    return { workspaces: [{ merchantOpenId: ctx.user.openId, role: "owner" }, ...memberships.map((membership) => ({ merchantOpenId: membership.merchantOpenId, role: membership.role }))], boundary: MERCHANT_TEAM_BOUNDARY };
  }),
  merchantTeamMembers: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { members: [], boundary: MERCHANT_TEAM_BOUNDARY };
    const members = await db.select({ memberOpenId: merchantTeamMemberships.memberOpenId, role: merchantTeamMemberships.role, active: merchantTeamMemberships.active, createdAt: merchantTeamMemberships.createdAt, memberName: users.name, memberEmail: users.email }).from(merchantTeamMemberships).leftJoin(users, eq3(users.openId, merchantTeamMemberships.memberOpenId)).where(eq3(merchantTeamMemberships.merchantOpenId, ctx.user.openId)).orderBy(desc2(merchantTeamMemberships.updatedAt));
    return { members, boundary: MERCHANT_TEAM_BOUNDARY };
  }),
  merchantOperationalTelemetry: protectedProcedure.query(({ ctx }) => getOperationalTelemetry(ctx.user.openId)),
  setMerchantTeamMember: protectedProcedure.input(z3.object({ memberEmail: z3.string().trim().toLowerCase().email().max(320), role: z3.enum(MERCHANT_TEAM_ROLES), active: z3.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Merchant team storage is unavailable.");
    const member = (await db.select().from(users).where(eq3(users.email, input.memberEmail)).limit(1))[0];
    if (!member) throw new Error("This teammate must sign in to DisputeShield once before you can grant local access.");
    if (member.openId === ctx.user.openId) throw new Error("The merchant owner is implicit and cannot be added as a separate team member.");
    await db.insert(merchantTeamMemberships).values({ merchantOpenId: ctx.user.openId, memberOpenId: member.openId, role: input.role, active: input.active, addedBy: ctx.user.openId }).onDuplicateKeyUpdate({ set: { role: input.role, active: input.active, addedBy: ctx.user.openId } });
    return { memberEmail: input.memberEmail, role: input.role, active: input.active, message: "Internal merchant-team access recorded. No external invitation or provider permission was created." };
  }),
  exportRedactedCustomerCaseAudit: protectedProcedure.input(z3.object({ caseReference: z3.string().trim().min(3).max(64), approvalPhrase: z3.literal(CASE_AUDIT_APPROVAL_PHRASE) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Customer case storage is unavailable.");
    const caseItem = (await db.select().from(customerCases).where(eq3(customerCases.caseReference, input.caseReference)).limit(1))[0];
    if (!caseItem) throw new Error("Customer case not found in this merchant workspace.");
    await requireMerchantTeamRole(db, ctx.user.openId, caseItem.merchantOpenId, "approver");
    const [orderRows, documents, events, escalationRows] = await Promise.all([
      db.select().from(sellerOrders).where(and2(eq3(sellerOrders.id, caseItem.sellerOrderId), eq3(sellerOrders.merchantOpenId, caseItem.merchantOpenId))).limit(1),
      db.select().from(customerCaseDocuments).where(and2(eq3(customerCaseDocuments.customerCaseId, caseItem.id), eq3(customerCaseDocuments.merchantOpenId, caseItem.merchantOpenId))).orderBy(desc2(customerCaseDocuments.createdAt)),
      db.select().from(customerCaseEvents).where(eq3(customerCaseEvents.customerCaseId, caseItem.id)).orderBy(desc2(customerCaseEvents.createdAt)),
      db.select().from(customerCaseEscalations).where(and2(eq3(customerCaseEscalations.customerCaseId, caseItem.id), eq3(customerCaseEscalations.merchantOpenId, caseItem.merchantOpenId))).limit(1)
    ]);
    const documentRows = await Promise.all(documents.map(async (document) => ({ ...document, extraction: (await db.select().from(customerDocumentExtractions).where(eq3(customerDocumentExtractions.customerCaseDocumentId, document.id)).limit(1))[0] ?? null })));
    const readiness = calculateCustomerCaseEvidenceReadiness({ issueType: caseItem.issueType, documentKinds: documents.map((document) => document.declaredKind) });
    const mapping = getReasonCodeMapping(caseItem.issueType);
    const audit = buildRedactedCaseAudit({ caseItem, order: orderRows[0] ?? null, readinessScore: readiness.score, missingEvidence: readiness.missing.map((requirement) => requirement.kind), evidenceFields: mapping.razorpayEvidenceFields, documents: documentRows, events, escalation: escalationRows[0] ? { ownerLabel: escalationRows[0].ownerLabel, level: escalationRows[0].level, updatedAt: escalationRows[0].updatedAt } : null });
    const exportHash = hashRedactedCaseAudit(audit);
    await db.insert(customerCaseAuditExports).values({ customerCaseId: caseItem.id, merchantOpenId: caseItem.merchantOpenId, approvedBy: ctx.user.openId, approvalPhrase: input.approvalPhrase, exportVersion: CASE_AUDIT_EXPORT_VERSION, exportHash });
    const integrityResult = await appendPrivateIntegrityAnchor(db, { merchantOpenId: caseItem.merchantOpenId, customerCaseId: caseItem.id, anchorType: "audit_export", sourceRecordId: exportHash, payloadHash: exportHash, createdBy: ctx.user.openId });
    const integrityChainHash = integrityResult.anchor.chainHash;
    await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "merchant", actorOpenId: ctx.user.openId, eventType: "merchant_redacted_audit_exported", detail: "Merchant approved a redacted local case audit export and private integrity anchor. No provider submission, contest, refund, blockchain-network action, or external action occurred.", sourceRefs: JSON.stringify({ sourceKind: "merchant_record", exportHash, exportVersion: CASE_AUDIT_EXPORT_VERSION, integrityAnchor: integrityChainHash.slice(0, 16) }) });
    if (integrityResult.created) await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "system", actorOpenId: null, eventType: "integrity_anchor_created", detail: "Private database integrity anchor created for the approved redacted audit export. This verifies local record consistency only; it is not a public blockchain, payment, provider, or dispute-outcome fact.", sourceRefs: JSON.stringify({ sourceKind: "private_integrity", anchorType: "audit_export", integrityAnchor: integrityChainHash.slice(0, 16) }) });
    return { caseReference: caseItem.caseReference, audit, exportHash, exportVersion: CASE_AUDIT_EXPORT_VERSION, integrityAnchor: { chainHash: integrityChainHash, anchorVersion: PRIVATE_INTEGRITY_VERSION }, message: "Redacted local case audit and private integrity anchor prepared for download. No provider submission, contest, refund, blockchain-network action, or external action occurred." };
  }),
  customerCaseIntegrity: protectedProcedure.input(z3.object({ caseReference: z3.string().trim().min(3).max(64) })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return { anchors: [], verification: { valid: true, checked: 0, rootHash: null }, boundary: "Private integrity storage is unavailable." };
    const caseItem = (await db.select().from(customerCases).where(eq3(customerCases.caseReference, input.caseReference)).limit(1))[0];
    if (!caseItem) throw new Error("Customer case not found in this merchant workspace.");
    await requireMerchantTeamRole(db, ctx.user.openId, caseItem.merchantOpenId, "viewer");
    const rows = await db.select().from(customerCaseIntegrityAnchors).where(and2(eq3(customerCaseIntegrityAnchors.customerCaseId, caseItem.id), eq3(customerCaseIntegrityAnchors.merchantOpenId, caseItem.merchantOpenId))).orderBy(customerCaseIntegrityAnchors.id);
    const anchors = rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
    return { anchors: anchors.map((anchor) => ({ anchorType: anchor.anchorType, sourceRecordId: anchor.sourceRecordId, chainHash: anchor.chainHash, previousChainHash: anchor.previousChainHash, anchorVersion: anchor.anchorVersion, createdAt: anchor.createdAt })), verification: verifyIntegrityChain(anchors), boundary: "Private database hash-chain verification only. No document content, customer identity, payment credential, public-chain transaction, wallet, token, or external provider action is included." };
  }),
  merchantDailyIntegrityRoot: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { rootHash: null, anchorCount: 0, boundary: "Private integrity storage is unavailable." };
    const rows = await db.select().from(customerCaseIntegrityAnchors).where(eq3(customerCaseIntegrityAnchors.merchantOpenId, ctx.user.openId));
    return { rootHash: buildMerkleRoot(rows.map((row) => row.chainHash)), anchorCount: rows.length, anchorVersion: PRIVATE_INTEGRITY_VERSION, boundary: "This is a private, current database Merkle root. It is not published to a blockchain or external ledger." };
  }),
  analyzeMerchantCustomerCaseSentiment: protectedProcedure.input(z3.object({ caseReference: z3.string().trim().min(3).max(64) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Customer case storage is unavailable.");
    const caseItem = (await db.select().from(customerCases).where(eq3(customerCases.caseReference, input.caseReference)).limit(1))[0];
    if (!caseItem) throw new Error("Customer case not found in this merchant workspace.");
    await requireMerchantTeamRole(db, ctx.user.openId, caseItem.merchantOpenId, "reviewer");
    const analysis = await analyzeCustomerStatementWithOllama(caseItem.customerStatement, { merchantOpenId: caseItem.merchantOpenId });
    return { caseReference: caseItem.caseReference, analysis, sourceBoundary: "merchant_reviewed_customer_statement_advisory_only" };
  }),
  setCustomerCaseEscalation: protectedProcedure.input(z3.object({
    caseReference: z3.string().trim().min(3).max(64),
    ownerLabel: z3.string().trim().min(2).max(120),
    level: z3.enum(["watch", "review", "elevated", "resolved"]),
    note: z3.string().trim().min(4).max(1500)
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Customer case storage is unavailable.");
    const caseItem = (await db.select().from(customerCases).where(eq3(customerCases.caseReference, input.caseReference)).limit(1))[0];
    if (!caseItem) throw new Error("Customer case not found in this merchant workspace.");
    await requireMerchantTeamRole(db, ctx.user.openId, caseItem.merchantOpenId, "reviewer");
    const ownerLabel = sanitizePlainText(input.ownerLabel);
    const note = sanitizePlainText(input.note);
    if (ownerLabel.length < 2 || note.length < 4) throw new Error("Provide a valid owner label and local SLA note.");
    const now = /* @__PURE__ */ new Date();
    await db.insert(customerCaseEscalations).values({ customerCaseId: caseItem.id, merchantOpenId: caseItem.merchantOpenId, ownerLabel, level: input.level, escalationNote: note, assignedBy: ctx.user.openId, acknowledgedAt: input.level === "watch" ? null : now, resolvedAt: input.level === "resolved" ? now : null }).onDuplicateKeyUpdate({ set: { ownerLabel, level: input.level, escalationNote: note, assignedBy: ctx.user.openId, acknowledgedAt: input.level === "watch" ? null : now, resolvedAt: input.level === "resolved" ? now : null } });
    await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "merchant", actorOpenId: ctx.user.openId, eventType: "merchant_sla_ownership_updated", detail: `Merchant assigned ${ownerLabel} to ${input.level} SLA ownership. ${note}`, sourceRefs: JSON.stringify({ sourceKind: "merchant_record", action: "manual_sla_ownership" }) });
    if (input.level === "elevated") {
      recordOperationalTelemetry(caseItem.merchantOpenId, "sla_elevated");
      recordNotification({ type: "escalation", title: "Local case elevated", body: `${caseItem.caseReference} is assigned to ${ownerLabel}. In-app merchant follow-up is required.`, tone: "critical" });
    }
    return { caseReference: caseItem.caseReference, ownerLabel, level: input.level, message: input.level === "elevated" ? "Merchant-owned SLA escalation recorded and an in-app notification was created. No external message, refund, or dispute action was sent." : "Merchant-owned SLA state recorded. No external message, refund, or dispute action was sent." };
  }),
  merchantResolutionOverview: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { signals: [], caseCount: 0, sourceBoundary: "merchant_operational_aggregate" };
    const cases = await db.select({ issueType: customerCases.issueType, status: customerCases.status }).from(customerCases).where(eq3(customerCases.merchantOpenId, ctx.user.openId));
    return { signals: buildMerchantOperationalSignals(cases), caseCount: cases.length, sourceBoundary: "merchant_operational_aggregate" };
  }),
  proactiveRiskIntelligence: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return buildProactiveRiskIntelligence([]);
    const caseRows = await db.select().from(customerCases).where(eq3(customerCases.merchantOpenId, ctx.user.openId));
    const facts = await Promise.all(caseRows.map(async (caseItem) => {
      const [order, documents, returnReceipt, refundRequest] = await Promise.all([
        db.select().from(sellerOrders).where(and2(eq3(sellerOrders.id, caseItem.sellerOrderId), eq3(sellerOrders.merchantOpenId, ctx.user.openId))).limit(1),
        db.select().from(customerCaseDocuments).where(and2(eq3(customerCaseDocuments.customerCaseId, caseItem.id), eq3(customerCaseDocuments.merchantOpenId, ctx.user.openId))),
        db.select().from(customerReturnReceipts).where(and2(eq3(customerReturnReceipts.customerCaseId, caseItem.id), eq3(customerReturnReceipts.merchantOpenId, ctx.user.openId))).limit(1),
        db.select().from(customerRefundRequests).where(and2(eq3(customerRefundRequests.customerCaseId, caseItem.id), eq3(customerRefundRequests.merchantOpenId, ctx.user.openId))).limit(1)
      ]);
      const hasUnreviewedExtraction = (await Promise.all(documents.map(async (document) => (await db.select().from(customerDocumentExtractions).where(eq3(customerDocumentExtractions.customerCaseDocumentId, document.id)).limit(1))[0]))).some((extraction) => extraction?.status === "complete" && extraction.customerConfirmation === "not_reviewed");
      return { caseReference: caseItem.caseReference, issueType: caseItem.issueType, status: caseItem.status, createdAt: caseItem.createdAt, updatedAt: caseItem.updatedAt, documentKinds: documents.map((document) => document.declaredKind), hasUnreviewedExtraction, paymentObservation: order[0]?.paymentObservation ?? "created", fulfilmentState: order[0]?.fulfillmentState ?? "unfulfilled", returnReceiptRecorded: Boolean(returnReceipt[0]), refundConfirmed: refundRequest[0]?.status === "razorpay_confirmed" };
    }));
    return buildProactiveRiskIntelligence(facts);
  }),
  generateCaseRiskNarrative: protectedProcedure.input(z3.object({ caseReference: z3.string().trim().min(3).max(64) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Customer case storage is unavailable.");
    const caseItem = (await db.select().from(customerCases).where(and2(eq3(customerCases.caseReference, input.caseReference), eq3(customerCases.merchantOpenId, ctx.user.openId))).limit(1))[0];
    if (!caseItem) throw new Error("Customer case not found in this merchant workspace.");
    const [order, documents, returnReceipt, refundRequest] = await Promise.all([
      db.select().from(sellerOrders).where(and2(eq3(sellerOrders.id, caseItem.sellerOrderId), eq3(sellerOrders.merchantOpenId, ctx.user.openId))).limit(1),
      db.select().from(customerCaseDocuments).where(and2(eq3(customerCaseDocuments.customerCaseId, caseItem.id), eq3(customerCaseDocuments.merchantOpenId, ctx.user.openId))),
      db.select().from(customerReturnReceipts).where(and2(eq3(customerReturnReceipts.customerCaseId, caseItem.id), eq3(customerReturnReceipts.merchantOpenId, ctx.user.openId))).limit(1),
      db.select().from(customerRefundRequests).where(and2(eq3(customerRefundRequests.customerCaseId, caseItem.id), eq3(customerRefundRequests.merchantOpenId, ctx.user.openId))).limit(1)
    ]);
    const documentRows = await Promise.all(documents.map(async (document) => ({ ...document, extraction: (await db.select().from(customerDocumentExtractions).where(eq3(customerDocumentExtractions.customerCaseDocumentId, document.id)).limit(1))[0] ?? null })));
    const recommendation = universalCaseRecommendation({ caseItem, documentRows, order: order[0] ?? null, returnReceipt: returnReceipt[0] ?? null, refundRequest: refundRequest[0] ?? null });
    const linkedOrder = order[0];
    const paymentSource = linkedOrder?.razorpayPaymentId ? `Razorpay payment reference / ${linkedOrder.razorpayPaymentId}` : "Merchant order payment observation";
    const paymentState = linkedOrder?.paymentObservation ?? "created";
    const caseReadiness = calculateCustomerCaseEvidenceReadiness({ issueType: caseItem.issueType, documentKinds: documentRows.map((document) => document.declaredKind) });
    const evidencePresent = caseReadiness.present.map((requirement) => requirement.label);
    const evidenceMissing = Array.from(/* @__PURE__ */ new Set([...caseReadiness.missing.map((requirement) => requirement.label), ...recommendation.missingEvidence.map((item) => item.replaceAll("_", " "))]));
    const factSheet = buildCaseFactSheet({ caseReference: caseItem.caseReference, paymentState, fulfilmentState: linkedOrder?.fulfillmentState ?? "unfulfilled", evidencePresent, evidenceMissing, caseAgeHours: Math.max(0, Math.floor((Date.now() - caseItem.updatedAt.getTime()) / 36e5)), slaDeadlineHours: Math.max(0, 72 - Math.floor((Date.now() - caseItem.updatedAt.getTime()) / 36e5)), reasonCode: caseItem.issueType, readinessScore: caseReadiness.score, recommendedOperationalStep: recommendation.nextActions[0] ?? "Review source-labelled case facts.", sourceLabels: [paymentSource, `Merchant fulfilment / ${linkedOrder?.orderReference ?? "order unavailable"}`, `Customer case / ${caseItem.caseReference}`, "Protected customer documents"] });
    return generateRiskNarrative(ctx.user.openId, factSheet);
  }),
  riskBenchmark: publicProcedure.query(() => runHeldOutRiskBenchmark()),
  merchantRiskExposure: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { activeCaseCount: 0, ordersAtRisk: 0, totals: [], boundary: "Exposure is unavailable because merchant case storage is unavailable." };
    const cases = await db.select().from(customerCases).where(eq3(customerCases.merchantOpenId, ctx.user.openId));
    const activeCases = cases.filter((item) => !["resolved", "closed", "withdrawn"].includes(item.status));
    const orders = await db.select().from(sellerOrders).where(eq3(sellerOrders.merchantOpenId, ctx.user.openId));
    const orderById = new Map(orders.map((order) => [order.id, order]));
    const exposedOrders = Array.from(new Set(activeCases.map((item) => item.sellerOrderId))).map((id) => orderById.get(id)).filter((order) => Boolean(order));
    const totals = Array.from(exposedOrders.reduce((acc, order) => {
      acc.set(order.currency, (acc.get(order.currency) ?? 0) + order.totalAmountPaise);
      return acc;
    }, /* @__PURE__ */ new Map()).entries()).map(([currency, amountPaise]) => ({ currency, amountPaise })).sort((a, b) => a.currency.localeCompare(b.currency));
    return { activeCaseCount: activeCases.length, ordersAtRisk: exposedOrders.length, totals, boundary: "Operational exposure is the sum of stored merchant order amounts linked to active local cases. It is not a predicted loss, a reserve, a refund amount, or an external dispute total." };
  }),
  merchantCustomerCaseAction: protectedProcedure.input(z3.object({ caseReference: z3.string().trim().min(3).max(64), action: z3.enum(["start_review", "request_evidence", "authorize_return", "offer_resolution", "route_policy_review", "close"]), note: z3.string().trim().min(4).max(1500) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Customer case storage is unavailable.");
    const caseItem = (await db.select().from(customerCases).where(and2(eq3(customerCases.caseReference, input.caseReference), eq3(customerCases.merchantOpenId, ctx.user.openId))).limit(1))[0];
    if (!caseItem) throw new Error("Customer case not found in this merchant workspace.");
    const nextStatus = transitionCustomerCase({ status: caseItem.status, actor: "merchant", action: input.action, issueType: caseItem.issueType });
    await db.update(customerCases).set({ status: nextStatus, merchantNote: input.note, resolutionSummary: input.action === "offer_resolution" ? input.note : caseItem.resolutionSummary, closedAt: input.action === "close" ? /* @__PURE__ */ new Date() : caseItem.closedAt }).where(eq3(customerCases.id, caseItem.id));
    await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "merchant", actorOpenId: ctx.user.openId, eventType: `merchant_${input.action}`, detail: input.action === "offer_resolution" ? `Merchant recorded a local resolution offer: ${input.note}. No payment action was performed.` : input.note, sourceRefs: JSON.stringify({ sourceKind: "merchant_record" }) });
    return { status: nextStatus, message: input.action === "offer_resolution" ? "A local resolution offer was recorded. No refund, return label, or external dispute action was performed." : "Merchant-controlled customer case state updated." };
  }),
  recordMerchantReturnReceipt: protectedProcedure.input(z3.object({ caseReference: z3.string().trim().min(3).max(64), carrierName: z3.string().trim().min(2).max(120), trackingReference: z3.string().trim().min(3).max(160), deliveryPartnerMobileSuffix: z3.string().regex(/^\d{4}$/).optional(), receiptNote: z3.string().trim().min(8).max(1500), receivedAt: z3.date().optional() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Customer case storage is unavailable.");
    const caseItem = (await db.select().from(customerCases).where(and2(eq3(customerCases.caseReference, input.caseReference), eq3(customerCases.merchantOpenId, ctx.user.openId))).limit(1))[0];
    if (!caseItem) throw new Error("Customer case not found in this merchant workspace.");
    const nextStatus = transitionCustomerCase({ status: caseItem.status, actor: "merchant", action: "record_return_received", issueType: caseItem.issueType });
    const existingReceipt = (await db.select().from(customerReturnReceipts).where(eq3(customerReturnReceipts.customerCaseId, caseItem.id)).limit(1))[0];
    if (existingReceipt) throw new Error("A return receipt is already recorded for this local case. Preserve that evidence rather than replacing it.");
    await db.insert(customerReturnReceipts).values({ customerCaseId: caseItem.id, merchantOpenId: ctx.user.openId, sellerOrderId: caseItem.sellerOrderId, carrierName: input.carrierName, trackingReference: input.trackingReference, deliveryPartnerMobileSuffix: input.deliveryPartnerMobileSuffix || null, sourceKind: "merchant_confirmed_mobile_record", signatureVerified: false, receiptNote: input.receiptNote, receivedAt: input.receivedAt ?? /* @__PURE__ */ new Date(), confirmedBy: ctx.user.openId });
    await db.update(customerCases).set({ status: nextStatus, merchantNote: input.receiptNote }).where(eq3(customerCases.id, caseItem.id));
    await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "merchant", actorOpenId: ctx.user.openId, eventType: "merchant_confirmed_return_receipt", detail: `Merchant confirmed return receipt from ${input.carrierName} for tracking ${input.trackingReference}. This is a merchant-confirmed delivery-partner record, not a signed carrier integration event.`, sourceRefs: JSON.stringify({ sourceKind: "merchant_confirmed_mobile_record", carrierName: input.carrierName, trackingReference: input.trackingReference, mobileSuffixProvided: Boolean(input.deliveryPartnerMobileSuffix) }) });
    return { status: nextStatus, sourceKind: "merchant_confirmed_mobile_record", signatureVerified: false, message: "Return receipt recorded as a merchant-confirmed delivery-partner record. The case can now be assessed for a local refund request, but no refund was started." };
  }),
  prepareCustomerRefundRequest: protectedProcedure.input(z3.object({ caseReference: z3.string().trim().min(3).max(64) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Customer case storage is unavailable.");
    const caseItem = (await db.select().from(customerCases).where(and2(eq3(customerCases.caseReference, input.caseReference), eq3(customerCases.merchantOpenId, ctx.user.openId))).limit(1))[0];
    if (!caseItem || caseItem.issueType !== "return_request" || caseItem.status !== "return_received") throw new Error("A local refund request can be prepared only after the merchant records receipt for a return-request case.");
    const [receipt, order, existingRequest] = await Promise.all([
      db.select().from(customerReturnReceipts).where(eq3(customerReturnReceipts.customerCaseId, caseItem.id)).limit(1),
      db.select().from(sellerOrders).where(and2(eq3(sellerOrders.id, caseItem.sellerOrderId), eq3(sellerOrders.merchantOpenId, ctx.user.openId))).limit(1),
      db.select().from(customerRefundRequests).where(eq3(customerRefundRequests.customerCaseId, caseItem.id)).limit(1)
    ]);
    if (!receipt[0]) throw new Error("No receipt evidence is recorded for this return.");
    if (!order[0]?.razorpayPaymentId) throw new Error("No buyer payment reference is available. A refund request cannot be prepared from an unverified browser state.");
    let paymentCaptured = false;
    try {
      const payment = await fetchRazorpayPayment(order[0].razorpayPaymentId);
      paymentCaptured = payment.status === "captured" || payment.captured === true;
    } catch {
      paymentCaptured = false;
    }
    if (!paymentCaptured) throw new Error("Razorpay API does not currently confirm a captured payment for this order. The local refund request remains blocked.");
    if (existingRequest[0]) return { requestId: existingRequest[0].id, status: existingRequest[0].status, reused: true, message: "The existing local refund request was preserved. No Razorpay refund was initiated." };
    const preparedAt = /* @__PURE__ */ new Date();
    await db.insert(customerRefundRequests).values({ customerCaseId: caseItem.id, merchantOpenId: ctx.user.openId, buyerOpenId: caseItem.buyerOpenId, razorpayPaymentId: order[0].razorpayPaymentId, amountPaise: order[0].totalAmountPaise, currency: order[0].currency, status: "prepared", preparedAt });
    const request = (await db.select().from(customerRefundRequests).where(eq3(customerRefundRequests.customerCaseId, caseItem.id)).limit(1))[0];
    await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "system", actorOpenId: null, eventType: "local_refund_request_prepared", detail: `A local refund request for \u20B9${(order[0].totalAmountPaise / 100).toLocaleString("en-IN")} was prepared after receipt evidence and Razorpay API-observed capture were checked. Merchant approval is still required; no Razorpay refund was initiated.`, sourceRefs: JSON.stringify({ receiptSource: receipt[0].sourceKind, razorpayPaymentId: order[0].razorpayPaymentId }) });
    return { requestId: request?.id, status: "prepared", reused: false, amountPaise: order[0].totalAmountPaise, message: "Local refund request prepared. It is awaiting the merchant approval phrase and has not called Razorpay's refund API." };
  }),
  approveCustomerRefundRequest: protectedProcedure.input(z3.object({ caseReference: z3.string().trim().min(3).max(64), approvalPhrase: z3.literal("APPROVE LOCAL REFUND REQUEST") })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Customer case storage is unavailable.");
    const caseItem = (await db.select().from(customerCases).where(and2(eq3(customerCases.caseReference, input.caseReference), eq3(customerCases.merchantOpenId, ctx.user.openId))).limit(1))[0];
    if (!caseItem) throw new Error("Customer case not found in this merchant workspace.");
    const request = (await db.select().from(customerRefundRequests).where(and2(eq3(customerRefundRequests.customerCaseId, caseItem.id), eq3(customerRefundRequests.merchantOpenId, ctx.user.openId))).limit(1))[0];
    if (!request || request.status !== "prepared") throw new Error("Only a prepared local refund request can be approved.");
    await db.update(customerRefundRequests).set({ status: "merchant_approved", approvalPhrase: input.approvalPhrase, approvedBy: ctx.user.openId, approvedAt: /* @__PURE__ */ new Date() }).where(eq3(customerRefundRequests.id, request.id));
    await db.insert(customerCaseEvents).values({ customerCaseId: caseItem.id, actorType: "merchant", actorOpenId: ctx.user.openId, eventType: "local_refund_request_approved", detail: "Merchant approved the local refund request. This approval does not execute a Razorpay refund; a separate deliberate financial action and independent Razorpay confirmation are still required.", sourceRefs: JSON.stringify({ refundRequestId: request.id, status: "merchant_approved" }) });
    return { status: "merchant_approved", message: "Merchant approval recorded. The request is still local and no money has moved; Razorpay refund execution remains intentionally blocked." };
  }),
  evaluation: publicProcedure.query(() => evaluation),
  notifications: publicProcedure.query(() => listNotifications())
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/razorpay.ts
import crypto7 from "node:crypto";
import { eq as eq4 } from "drizzle-orm";

// server/webhookReconciliation.ts
function notesFrom(payload, family) {
  const entity = family === "payment" ? payload?.payload?.payment?.entity : family === "qr" ? payload?.payload?.qr_code?.entity : family === "refund" ? payload?.payload?.refund?.entity : payload?.payload?.dispute?.entity;
  return entity?.notes ?? {};
}
function eventFamily(eventType) {
  if (eventType.includes("qr_code")) return "qr";
  if (eventType.includes("refund")) return "refund";
  if (eventType.includes("dispute")) return "dispute";
  if (eventType.includes("payment")) return "payment";
  return null;
}
function reconcileCaseReference(eventType, payload) {
  const family = eventFamily(eventType);
  if (!family) return null;
  const notes = notesFrom(payload, family);
  const caseReference = notes.disputeShieldCaseId ?? notes.caseId ?? notes.dispute_case_id;
  if (typeof caseReference !== "string" || !/^DSP-\d+$/.test(caseReference)) return null;
  return { caseReference, family };
}

// server/webhookRateLimit.ts
var entries = /* @__PURE__ */ new Map();
var WEBHOOK_RATE_LIMIT = { windowMs: 6e4, maxRequests: 120 };
function checkWebhookRateLimit(sourceIp, now = Date.now()) {
  const key = sourceIp || "unknown";
  const current = entries.get(key);
  if (!current || now - current.startedAt >= WEBHOOK_RATE_LIMIT.windowMs) {
    entries.set(key, { startedAt: now, count: 1 });
    return { allowed: true, remaining: WEBHOOK_RATE_LIMIT.maxRequests - 1, retryAfterSeconds: 0 };
  }
  if (current.count >= WEBHOOK_RATE_LIMIT.maxRequests) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((WEBHOOK_RATE_LIMIT.windowMs - (now - current.startedAt)) / 1e3)) };
  }
  current.count += 1;
  return { allowed: true, remaining: WEBHOOK_RATE_LIMIT.maxRequests - current.count, retryAfterSeconds: 0 };
}

// server/razorpay.ts
var RAZORPAY_WEBHOOK_MAX_BYTES = 1e6;
function verifyRazorpaySignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const digest = crypto7.createHmac("sha256", secret).update(rawBody).digest("hex");
  if (digest.length !== signature.length) return false;
  return crypto7.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}
function registerRazorpayWebhook(app) {
  app.post("/api/webhooks/razorpay", expressRawJson, async (req, res) => {
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
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return res.status(400).json({ ok: false, error: "invalid_json" });
    }
    const eventId = String(req.header("x-razorpay-event-id") ?? payload.id ?? payload.event_id ?? crypto7.createHash("sha256").update(rawBody).digest("hex"));
    const eventType = String(payload.event ?? payload.type ?? "unknown");
    const reconciliation = reconcileCaseReference(eventType, payload);
    const db = await getDb();
    if (db) {
      const existing = await db.select().from(webhookEvents).where(eq4(webhookEvents.eventId, eventId)).limit(1);
      if (existing.length) return res.status(200).json({ ok: true, duplicate: true });
      await db.insert(webhookEvents).values(buildVerifiedWebhookLedgerValues({ eventId, eventType, merchantOpenId: ENV.ownerOpenId, rawMetadata: rawBody, payload }));
      if (reconciliation) {
        await db.insert(webhookCaseLinks).values({
          eventId,
          caseReference: reconciliation.caseReference,
          eventFamily: reconciliation.family,
          signatureVerified: verified
        });
      }
      const paymentEntity = payload?.payload?.payment?.entity;
      if (paymentEntity?.order_id && eventType === "payment.captured") {
        const intake = (await db.select().from(paymentIntakes).where(eq4(paymentIntakes.razorpayOrderId, paymentEntity.order_id)).limit(1))[0];
        if (intake) {
          const transition = verifiedWebhookCaptureTransition({ eventType, signatureVerified: verified });
          if (transition.status) await db.update(paymentIntakes).set({ status: transition.status, razorpayPaymentId: paymentEntity.id, capturedAt: /* @__PURE__ */ new Date() }).where(eq4(paymentIntakes.razorpayOrderId, paymentEntity.order_id));
          if (transition.createsEvidence) {
            await db.insert(paymentEvidenceEvents).values({ paymentIntakeId: intake.id, eventId, razorpayPaymentId: paymentEntity.id, amountPaise: Number(paymentEntity.amount ?? intake.amountPaise), signatureVerified: true });
          }
          recordNotification({ type: "webhook", title: "Verified merchant payment captured", body: `${paymentEntity.id} was recorded as signed payment evidence for intake ${intake.receipt}.`, tone: "success" });
        }
      }
      if (paymentEntity?.order_id && eventType === "payment.failed") {
        await db.update(paymentIntakes).set({ status: "failed", razorpayPaymentId: paymentEntity.id }).where(eq4(paymentIntakes.razorpayOrderId, paymentEntity.order_id));
      }
      const refundEntity = payload?.payload?.refund?.entity;
      if (eventType === "refund.processed" && refundEntity?.payment_id && refundEntity?.id) {
        const localRequest = (await db.select().from(customerRefundRequests).where(eq4(customerRefundRequests.razorpayPaymentId, String(refundEntity.payment_id))).limit(1))[0];
        if (localRequest?.status === "merchant_approved") {
          await db.update(customerRefundRequests).set({ status: "razorpay_confirmed", razorpayRefundId: String(refundEntity.id), confirmedAt: /* @__PURE__ */ new Date() }).where(eq4(customerRefundRequests.id, localRequest.id));
          await db.insert(customerCaseEvents).values({ customerCaseId: localRequest.customerCaseId, actorType: "system", actorOpenId: null, eventType: "razorpay_refund_processed_verified", detail: `A signed Razorpay refund.processed event confirmed refund ${refundEntity.id}. This confirmation came from the webhook, not the merchant interface.`, sourceRefs: JSON.stringify({ eventId, razorpayRefundId: String(refundEntity.id), razorpayPaymentId: String(refundEntity.payment_id) }) });
          const safeWebhookMetadataHash = crypto7.createHash("sha256").update(JSON.stringify({ eventId, eventType, refundId: String(refundEntity.id), paymentId: String(refundEntity.payment_id), signatureVerified: true })).digest("hex");
          const integrityResult = await appendPrivateIntegrityAnchor(db, { merchantOpenId: localRequest.merchantOpenId, customerCaseId: localRequest.customerCaseId, anchorType: "verified_webhook", sourceRecordId: eventId, payloadHash: safeWebhookMetadataHash, createdBy: null });
          if (integrityResult.created) await db.insert(customerCaseEvents).values({ customerCaseId: localRequest.customerCaseId, actorType: "system", actorOpenId: null, eventType: "integrity_anchor_created", detail: "Private database integrity anchor created from signed Razorpay refund-confirmation metadata already linked to this local case. Raw webhook content, signatures, and credentials are excluded.", sourceRefs: JSON.stringify({ sourceKind: "private_integrity", anchorType: "verified_webhook", integrityAnchor: integrityResult.anchor.chainHash.slice(0, 16), eventId }) });
          recordNotification({ type: "webhook", title: "Verified Razorpay refund processed", body: `${refundEntity.id} confirmed a merchant-approved local refund request.`, tone: "success" });
        }
      }
    }
    recordNotification({ type: eventType.includes("dispute") ? "deadline" : "webhook", title: eventType.includes("dispute") ? "New dispute received" : "Razorpay event received", body: `${eventType} \xB7 ${eventId} is ready for case linkage.`, tone: eventType.includes("dispute") ? "critical" : "success" });
    return res.status(200).json({ ok: true, eventId, signatureVerified: verified, mode: process.env.RAZORPAY_WEBHOOK_SECRET ? "configured" : "unconfigured" });
  });
}
function expressRawJson(req, res, next) {
  const chunks = [];
  let byteLength = 0;
  let rejected = false;
  req.on("data", (chunk) => {
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
    req.body = Buffer.concat(chunks);
    next();
  });
}

// server/evidence.ts
function registerEvidenceUpload(app) {
  app.post("/api/evidence/upload", (_req, res) => {
    return res.status(410).json({ ok: false, error: "legacy_upload_retired", message: "The legacy evidence upload endpoint is retired. Use an authenticated, case-scoped Customer Space upload procedure." });
  });
}

// server/_core/vite.ts
import express from "express";
import fs from "fs";
import { nanoid } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
var plugins = [react(), tailwindcss(), jsxLocPlugin()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: [
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path2.resolve(import.meta.dirname, "../..", "dist", "public") : path2.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/httpSecurity.ts
function applyBaselineSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}
function safeApiParserError(error) {
  const record = error && typeof error === "object" ? error : null;
  if (record?.status === 413 || record?.type === "entity.too.large") {
    return { status: 413, body: { ok: false, error: "request_too_large" } };
  }
  if (record?.status === 400 || record?.type === "entity.parse.failed") {
    return { status: 400, body: { ok: false, error: "invalid_request_body" } };
  }
  return { status: 500, body: { ok: false, error: "request_processing_failed" } };
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    applyBaselineSecurityHeaders(res);
    next();
  });
  registerRazorpayWebhook(app);
  app.use(express2.json({ limit: "8mb" }));
  app.use(express2.urlencoded({ limit: "8mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerEvidenceUpload(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  app.use((error, req, res, next) => {
    if (!req.path.startsWith("/api/")) {
      next(error);
      return;
    }
    const safeError = safeApiParserError(error);
    if (safeError.status !== 500) {
      res.status(safeError.status).json(safeError.body);
      return;
    }
    console.error("[API] unexpected request error", error);
    res.status(safeError.status).json(safeError.body);
  });
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
startServer().catch(console.error);
