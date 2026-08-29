import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const routerSource = readFileSync(path.resolve(process.cwd(), "server/routers.ts"), "utf8");

function procedureBlock(start: string, end: string) {
  const startIndex = routerSource.indexOf(start);
  const endIndex = routerSource.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) throw new Error(`Could not locate Customer Space boundary: ${start}`);
  return routerSource.slice(startIndex, endIndex);
}

describe("Customer Space non-financial Razorpay boundaries", () => {
  it("keeps catalog browse, case intake, OCR confirmation, and return-receipt recording outside Razorpay payment and refund actions", () => {
    const browse = procedureBlock("customerCatalogContext:", "createCustomerCheckout:");
    const caseAndDocuments = procedureBlock("createCustomerCase:", "customerCaseAction:");
    const syntheticFixture = procedureBlock("createSyntheticCustomerValidationOrder:", "uploadCustomerCaseDocument:");
    const merchantLocalOperations = procedureBlock("merchantCustomerCaseAction:", "prepareCustomerRefundRequest:");

    for (const localOperation of [browse, caseAndDocuments, syntheticFixture, merchantLocalOperations]) {
      expect(localOperation).not.toMatch(/createMerchantPaymentOrder|createCustomerCheckout|createCaseEvidenceQr|fetchRazorpayPayment|fetchRefundEvidence|refund\.processed/i);
    }
  });

  it("permits only a read-only capture lookup while preparing a local refund request and never calls a Razorpay refund write", () => {
    const preparation = procedureBlock("prepareCustomerRefundRequest:", "approveCustomerRefundRequest:");
    const approval = procedureBlock("approveCustomerRefundRequest:", "evaluation:");

    expect(preparation).toContain("fetchRazorpayPayment");
    expect(preparation).not.toMatch(/createMerchantPaymentOrder|createCustomerCheckout|createCaseEvidenceQr|fetchRefundEvidence|create.*refund/i);
    expect(approval).not.toMatch(/createMerchantPaymentOrder|createCustomerCheckout|createCaseEvidenceQr|fetchRazorpayPayment|fetchRefundEvidence|create.*refund/i);
    expect(approval).toContain("no money has moved");
  });
});
