import crypto from "node:crypto";
import mysql from "mysql2/promise";

const approval = process.env.SYNTHETIC_FIXTURE_APPROVAL;
if (approval !== "AUTHORIZED") {
  throw new Error("Set SYNTHETIC_FIXTURE_APPROVAL=AUTHORIZED to create the labelled local validation fixture.");
}

const merchantOpenId = process.env.OWNER_OPEN_ID;
const databaseUrl = process.env.DATABASE_URL;
const forgeUrl = process.env.BUILT_IN_FORGE_API_URL?.replace(/\/+$/, "");
const forgeKey = process.env.BUILT_IN_FORGE_API_KEY;
if (!merchantOpenId || !databaseUrl || !forgeUrl || !forgeKey) {
  throw new Error("Synthetic validation fixture requires the managed owner, database, and storage configuration.");
}

const suffix = crypto.randomBytes(5).toString("hex").toUpperCase();
const orderReference = `SYNVAL-${suffix}`;
const caseReference = `LOCAL-SYN-${suffix}`;
const fixtureText = [
  "SYNTHETIC LOCAL VALIDATION DOCUMENT — NOT CUSTOMER EVIDENCE",
  "Purpose: exercise Customer Space OCR confirmation and merchant handoff safely.",
  `Fixture reference: ${caseReference}`,
  "No delivery, carrier, payment, refund, or external dispute fact is asserted by this file.",
].join("\n");
const fileHash = crypto.createHash("sha256").update(fixtureText).digest("hex");

async function putSyntheticFixture() {
  const relKey = `synthetic-validation/${caseReference}-not-evidence.txt`;
  const presign = new URL("v1/storage/presign/put", `${forgeUrl}/`);
  presign.searchParams.set("path", relKey);
  const presignResponse = await fetch(presign, { headers: { Authorization: `Bearer ${forgeKey}` } });
  if (!presignResponse.ok) throw new Error(`Fixture storage presign failed (${presignResponse.status}).`);
  const { url } = await presignResponse.json();
  const putResponse = await fetch(url, { method: "PUT", headers: { "Content-Type": "text/plain" }, body: fixtureText });
  if (!putResponse.ok) throw new Error(`Fixture storage upload failed (${putResponse.status}).`);
  return relKey;
}

const connection = await mysql.createConnection(databaseUrl);
try {
  const [products] = await connection.execute(
    "SELECT id, name, unitAmountPaise FROM sellerProducts WHERE merchantOpenId = ? AND status = 'active' ORDER BY id ASC LIMIT 1",
    [merchantOpenId],
  );
  const product = products[0];
  if (!product) throw new Error("No active merchant product exists for the owner-scoped synthetic fixture.");

  const fileKey = await putSyntheticFixture();
  await connection.beginTransaction();
  const [orderResult] = await connection.execute(
    "INSERT INTO sellerOrders (merchantOpenId, orderReference, productId, productName, quantity, totalAmountPaise, currency, buyerLabel, buyerOpenId, shippingRecord, paymentObservation, fulfillmentState, sourceKind) VALUES (?, ?, ?, ?, 1, ?, 'INR', ?, ?, ?, 'not_started', 'unfulfilled', 'merchant_record')",
    [merchantOpenId, orderReference, product.id, product.name, product.unitAmountPaise, "Synthetic local validation buyer — no payment", merchantOpenId, "SYNTHETIC validation order — no shipping event"],
  );
  const sellerOrderId = orderResult.insertId;
  const [caseResult] = await connection.execute(
    "INSERT INTO customerCases (caseReference, sellerOrderId, merchantOpenId, buyerOpenId, issueType, customerStatement, status, merchantNote, resolutionSummary, sourceKind, submittedAt) VALUES (?, ?, ?, ?, 'return_request', ?, 'submitted', ?, ?, 'customer_local_case', NOW())",
    [caseReference, sellerOrderId, merchantOpenId, merchantOpenId, "SYNTHETIC LOCAL VALIDATION ONLY — return request used to test protected OCR confirmation and merchant handoff. This is not a customer claim.", "SYNTHETIC FIXTURE — merchant review must not treat this as a real customer request.", "SYNTHETIC FIXTURE — no refund, carrier, payment, or external dispute action is permitted."],
  );
  const customerCaseId = caseResult.insertId;
  const [documentResult] = await connection.execute(
    "INSERT INTO customerCaseDocuments (customerCaseId, merchantOpenId, buyerOpenId, declaredKind, originalName, contentType, byteSize, sha256, fileKey) VALUES (?, ?, ?, 'other', ?, 'text/plain', ?, ?, ?)",
    [customerCaseId, merchantOpenId, merchantOpenId, `${caseReference}-NOT-EVIDENCE.txt`, Buffer.byteLength(fixtureText), fileHash, fileKey],
  );
  await connection.execute(
    "INSERT INTO customerDocumentExtractions (customerCaseDocumentId, model, status, documentType, summary, fieldsJson, warningsJson, overallConfidence, customerConfirmation) VALUES (?, 'synthetic-validation-fixture/no-ai-call', 'complete', 'synthetic_validation_fixture', ?, ?, ?, 100, 'confirmed')",
    [documentResult.insertId, "SYNTHETIC fixture text is visible and confirmed only to exercise the local review boundary.", JSON.stringify([{ key: "fixture_status", value: "SYNTHETIC — NOT EVIDENCE", confidence: 100, relation: "warning" }]), JSON.stringify(["No Gemini call was made. This synthetic fixture must not support a financial or external action."])],
  );
  await connection.execute(
    "INSERT INTO customerCaseEvents (customerCaseId, actorType, actorOpenId, eventType, detail, sourceRefs) VALUES (?, 'customer', ?, 'synthetic_fixture_created', ?, ?), (?, 'customer', ?, 'synthetic_ocr_confirmation_recorded', ?, ?), (?, 'system', NULL, 'synthetic_case_submitted_for_merchant_handoff', ?, ?)",
    [customerCaseId, merchantOpenId, "SYNTHETIC LOCAL VALIDATION ONLY — fixture case created with no external action.", JSON.stringify({ fixture: true }), customerCaseId, merchantOpenId, "SYNTHETIC LOCAL VALIDATION ONLY — no AI call; OCR confirmation state recorded.", JSON.stringify({ fixture: true, model: "no-ai-call" }), customerCaseId, "SYNTHETIC LOCAL VALIDATION ONLY — merchant handoff state created.", JSON.stringify({ fixture: true })],
  );
  await connection.commit();
  console.log(JSON.stringify({ created: true, fixture: "synthetic_local_validation_only", orderReference, caseReference, sellerOrderId, customerCaseId }));
} catch (error) {
  await connection.rollback().catch(() => undefined);
  throw error;
} finally {
  await connection.end();
}
