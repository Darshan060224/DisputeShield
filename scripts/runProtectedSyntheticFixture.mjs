import { appRouter } from "../server/routers.ts";

if (process.env.SYNTHETIC_FIXTURE_APPROVAL !== "AUTHORIZED") {
  throw new Error("Set SYNTHETIC_FIXTURE_APPROVAL=AUTHORIZED to run the protected synthetic fixture procedure.");
}

const ownerOpenId = process.env.OWNER_OPEN_ID;
if (!ownerOpenId) throw new Error("OWNER_OPEN_ID is required for the protected synthetic fixture procedure.");

const now = new Date();
const caller = appRouter.createCaller({
  user: {
    id: 0,
    openId: ownerOpenId,
    name: "Owner validation harness",
    email: null,
    loginMethod: "system",
    role: "admin",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  },
  req: { protocol: "https", headers: {} },
  res: {},
});

const fixture = await caller.createSyntheticCustomerValidationOrder({ acknowledgement: "SYNTHETIC_LOCAL_VALIDATION_ONLY" });
const draft = await caller.createCustomerCase({
  accessToken: fixture.accessToken,
  issueType: "return_request",
  customerStatement: "SYNTHETIC LOCAL VALIDATION ONLY — this protected case is not a customer claim and cannot support a financial or external action.",
  returnReason: "Synthetic protected Customer Space workflow validation",
});
const syntheticPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl5aZkAAAAASUVORK5CYII=";
const document = await caller.uploadCustomerCaseDocument({
  accessToken: fixture.accessToken,
  caseReference: draft.caseReference,
  declaredKind: "other",
  originalName: "SYNTHETIC-LOCAL-VALIDATION-NOT-EVIDENCE.png",
  contentType: "image/png",
  contentBase64: syntheticPng,
  useGeminiAssistance: true,
});
if (!document.extraction) {
  throw new Error("Synthetic protected workflow could not produce an OCR candidate for customer confirmation.");
}
await caller.confirmCustomerDocumentExtraction({ accessToken: fixture.accessToken, documentId: document.documentId, confirmation: "confirmed" });
const submitted = await caller.customerCaseAction({ accessToken: fixture.accessToken, caseReference: draft.caseReference, action: "submit", note: "SYNTHETIC LOCAL VALIDATION ONLY — submitted to test the merchant handoff boundary." });
const merchantReview = await caller.merchantCustomerCaseAction({ caseReference: draft.caseReference, action: "start_review", note: "SYNTHETIC LOCAL VALIDATION ONLY — merchant review validates handoff without authorizing a return, refund, or external response." });
console.log(JSON.stringify({ invokedProtectedProcedure: true, orderReference: fixture.orderReference, caseReference: draft.caseReference, documentId: document.documentId, ocrConfirmation: "confirmed", submittedStatus: submitted.status, merchantStatus: merchantReview.status, sourceBoundary: fixture.sourceBoundary }));
