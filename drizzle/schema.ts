import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, uniqueIndex } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const disputes = mysqlTable("disputes", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const evidence = mysqlTable("evidence", {
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const webhookEvents = mysqlTable("webhookEvents", {
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const webhookCaseLinks = mysqlTable("webhookCaseLinks", {
  id: int("id").autoincrement().primaryKey(),
  eventId: varchar("eventId", { length: 128 }).notNull().unique(),
  caseReference: varchar("caseReference", { length: 64 }).notNull(),
  eventFamily: mysqlEnum("eventFamily", ["payment", "qr", "refund", "dispute"]).notNull(),
  signatureVerified: boolean("signatureVerified").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const auditEvents = mysqlTable("auditEvents", {
  id: int("id").autoincrement().primaryKey(),
  disputeId: int("disputeId").notNull(),
  action: varchar("action", { length: 128 }).notNull(),
  actor: varchar("actor", { length: 128 }).notNull(),
  detail: text("detail").notNull(),
  sourceRefs: text("sourceRefs"),
  eventHash: varchar("eventHash", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const exportRecords = mysqlTable("exportRecords", {
  id: int("id").autoincrement().primaryKey(),
  disputeId: int("disputeId").notNull(),
  approvedBy: varchar("approvedBy", { length: 128 }).notNull(),
  approvalPhrase: varchar("approvalPhrase", { length: 128 }).notNull(),
  exportState: mysqlEnum("exportState", ["approved", "exported"]).notNull().default("approved"),
  packetState: mysqlEnum("packetState", ["prepared", "approved"]).notNull().default("prepared"),
  sourceKind: mysqlEnum("sourceKind", ["local", "signed_webhook_external"]).notNull().default("local"),
  externalDisputeId: varchar("externalDisputeId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const paymentIntakes = mysqlTable("paymentIntakes", {
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
  capturedAt: timestamp("capturedAt"),
});

export const paymentEvidenceEvents = mysqlTable("paymentEvidenceEvents", {
  id: int("id").autoincrement().primaryKey(),
  paymentIntakeId: int("paymentIntakeId").notNull(),
  eventId: varchar("eventId", { length: 128 }).notNull().unique(),
  razorpayPaymentId: varchar("razorpayPaymentId", { length: 128 }).notNull(),
  amountPaise: int("amountPaise").notNull(),
  source: varchar("source", { length: 128 }).notNull().default("Razorpay signed webhook"),
  signatureVerified: boolean("signatureVerified").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const sellerProducts = mysqlTable("sellerProducts", {
  id: int("id").autoincrement().primaryKey(),
  merchantOpenId: varchar("merchantOpenId", { length: 64 }).notNull(),
  sku: varchar("sku", { length: 64 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  unitAmountPaise: int("unitAmountPaise").notNull(),
  inventoryQuantity: int("inventoryQuantity").notNull().default(0),
  status: mysqlEnum("status", ["active", "archived"]).notNull().default("active"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const sellerOrders = mysqlTable("sellerOrders", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const sellerFulfillmentEvents = mysqlTable("sellerFulfillmentEvents", {
  id: int("id").autoincrement().primaryKey(),
  sellerOrderId: int("sellerOrderId").notNull(),
  state: mysqlEnum("state", ["packed", "shipped", "delivered", "delivery_exception"]).notNull(),
  carrier: varchar("carrier", { length: 120 }),
  trackingReference: varchar("trackingReference", { length: 160 }),
  evidenceNote: text("evidenceNote").notNull(),
  sourceKind: mysqlEnum("sourceKind", ["merchant_record"]).notNull().default("merchant_record"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const sellerDisputeScenarios = mysqlTable("sellerDisputeScenarios", {
  id: int("id").autoincrement().primaryKey(),
  sellerOrderId: int("sellerOrderId").notNull(),
  scenarioType: mysqlEnum("scenarioType", ["unauthorized_transaction", "product_not_received", "wrong_amount", "duplicate_payment", "refund_issue"]).notNull(),
  customerClaim: text("customerClaim").notNull(),
  requestedOutcome: mysqlEnum("requestedOutcome", ["case_review", "contest_response", "customer_resolution"]).notNull().default("case_review"),
  recommendation: mysqlEnum("recommendation", ["contest", "do_not_contest", "human_review"]).notNull().default("human_review"),
  scenarioStatus: mysqlEnum("scenarioStatus", ["ready", "reviewed", "closed"]).notNull().default("ready"),
  sourceKind: mysqlEnum("sourceKind", ["demonstration_scenario"]).notNull().default("demonstration_scenario"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const customerOrderAccess = mysqlTable("customerOrderAccess", {
  id: int("id").autoincrement().primaryKey(),
  sellerOrderId: int("sellerOrderId").notNull(),
  merchantOpenId: varchar("merchantOpenId", { length: 64 }).notNull(),
  accessTokenHash: varchar("accessTokenHash", { length: 128 }).notNull().unique(),
  boundBuyerOpenId: varchar("boundBuyerOpenId", { length: 64 }),
  active: boolean("active").notNull().default(true),
  expiresAt: timestamp("expiresAt").notNull(),
  redeemedAt: timestamp("redeemedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const customerCatalogAccess = mysqlTable("customerCatalogAccess", {
  id: int("id").autoincrement().primaryKey(),
  merchantOpenId: varchar("merchantOpenId", { length: 64 }).notNull(),
  accessTokenHash: varchar("accessTokenHash", { length: 128 }).notNull().unique(),
  boundBuyerOpenId: varchar("boundBuyerOpenId", { length: 64 }),
  active: boolean("active").notNull().default(true),
  expiresAt: timestamp("expiresAt").notNull(),
  redeemedAt: timestamp("redeemedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const customerCases = mysqlTable("customerCases", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const customerCaseEscalations = mysqlTable("customerCaseEscalations", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const customerCaseAuditExports = mysqlTable("customerCaseAuditExports", {
  id: int("id").autoincrement().primaryKey(),
  customerCaseId: int("customerCaseId").notNull(),
  merchantOpenId: varchar("merchantOpenId", { length: 64 }).notNull(),
  approvedBy: varchar("approvedBy", { length: 64 }).notNull(),
  approvalPhrase: varchar("approvalPhrase", { length: 128 }).notNull(),
  exportVersion: varchar("exportVersion", { length: 32 }).notNull(),
  exportHash: varchar("exportHash", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const customerCaseIntegrityAnchors = mysqlTable("customerCaseIntegrityAnchors", {
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  caseTypeSourceUnique: uniqueIndex("customerCaseIntegrityAnchors_case_type_source_unique").on(table.customerCaseId, table.anchorType, table.sourceRecordId),
}));

export const customerCaseIntegrityHeads = mysqlTable("customerCaseIntegrityHeads", {
  customerCaseId: int("customerCaseId").primaryKey(),
  merchantOpenId: varchar("merchantOpenId", { length: 64 }).notNull(),
  headChainHash: varchar("headChainHash", { length: 128 }),
  anchorCount: int("anchorCount").notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  merchantCaseUnique: uniqueIndex("customerCaseIntegrityHeads_merchant_case_unique").on(table.merchantOpenId, table.customerCaseId),
}));

export const merchantTeamMemberships = mysqlTable("merchantTeamMemberships", {
  id: int("id").autoincrement().primaryKey(),
  merchantOpenId: varchar("merchantOpenId", { length: 64 }).notNull(),
  memberOpenId: varchar("memberOpenId", { length: 64 }).notNull(),
  role: mysqlEnum("role", ["viewer", "reviewer", "approver"]).notNull().default("viewer"),
  active: boolean("active").notNull().default(true),
  addedBy: varchar("addedBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  merchantMemberUnique: uniqueIndex("merchantTeamMemberships_merchant_member_unique").on(table.merchantOpenId, table.memberOpenId),
}));

export const customerCaseDocuments = mysqlTable("customerCaseDocuments", {
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const customerDocumentExtractions = mysqlTable("customerDocumentExtractions", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const customerCaseEvents = mysqlTable("customerCaseEvents", {
  id: int("id").autoincrement().primaryKey(),
  customerCaseId: int("customerCaseId").notNull(),
  actorType: mysqlEnum("actorType", ["customer", "merchant", "system"]).notNull(),
  actorOpenId: varchar("actorOpenId", { length: 64 }),
  eventType: varchar("eventType", { length: 96 }).notNull(),
  detail: text("detail").notNull(),
  sourceRefs: text("sourceRefs"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const customerReturnReceipts = mysqlTable("customerReturnReceipts", {
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const customerRefundRequests = mysqlTable("customerRefundRequests", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const evaluationRuns = mysqlTable("evaluationRuns", {
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Dispute = typeof disputes.$inferSelect;
export type Evidence = typeof evidence.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type SellerProduct = typeof sellerProducts.$inferSelect;
export type SellerOrder = typeof sellerOrders.$inferSelect;
export type CustomerCase = typeof customerCases.$inferSelect;
export type CustomerCaseDocument = typeof customerCaseDocuments.$inferSelect;
