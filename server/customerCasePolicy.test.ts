import { describe, expect, it } from "vitest";
import { calculateCustomerCaseEvidenceReadiness, customerCaseEvidenceState, isCustomerScopedRecord, transitionCustomerCase } from "./customerCasePolicy";

describe("Customer Space case policy", () => {
  it("keeps a case evidence-pending when it has no document or an unreviewed OCR result", () => {
    expect(customerCaseEvidenceState({ documentCount: 0, hasUnreviewedExtraction: false })).toBe("evidence_pending");
    expect(customerCaseEvidenceState({ documentCount: 1, hasUnreviewedExtraction: true })).toBe("evidence_pending");
    expect(customerCaseEvidenceState({ documentCount: 1, hasUnreviewedExtraction: false })).toBe("draft");
  });

  it("permits a customer to submit a complete draft and merchant to begin review", () => {
    const submitted = transitionCustomerCase({ status: "draft", actor: "customer", action: "submit", issueType: "product_not_received" });
    expect(submitted).toBe("submitted");
    expect(transitionCustomerCase({ status: submitted, actor: "merchant", action: "start_review", issueType: "product_not_received" })).toBe("merchant_review");
  });

  it("allows a return authorization only from merchant review of a return request", () => {
    expect(transitionCustomerCase({ status: "merchant_review", actor: "merchant", action: "authorize_return", issueType: "return_request" })).toBe("return_authorized");
    expect(() => transitionCustomerCase({ status: "merchant_review", actor: "merchant", action: "authorize_return", issueType: "product_not_received" })).toThrow("return can only be authorized");
  });

  it("blocks an out-of-order customer acceptance and supports the return path", () => {
    expect(() => transitionCustomerCase({ status: "merchant_review", actor: "customer", action: "accept_resolution", issueType: "return_request" })).toThrow("not permitted");
    expect(transitionCustomerCase({ status: "return_authorized", actor: "customer", action: "mark_return_in_transit", issueType: "return_request" })).toBe("return_in_transit");
  });

  it("requires a merchant receipt event after return transit before refund preparation can be considered", () => {
    expect(transitionCustomerCase({ status: "return_in_transit", actor: "merchant", action: "record_return_received", issueType: "return_request" })).toBe("return_received");
    expect(() => transitionCustomerCase({ status: "return_in_transit", actor: "customer", action: "record_return_received", issueType: "return_request" })).toThrow("not permitted");
  });

  it("never models a refund or external dispute submission as an automation transition", () => {
    expect(() => transitionCustomerCase({ status: "merchant_review", actor: "merchant", action: "refund", issueType: "refund_issue" })).toThrow("not permitted");
    expect(() => transitionCustomerCase({ status: "merchant_review", actor: "merchant", action: "submit_external_dispute", issueType: "unauthorized_transaction" })).toThrow("not permitted");
  });

  it("requires both the bound merchant and buyer to match before a customer record is visible", () => {
    const record = { merchantOpenId: "merchant-a", buyerOpenId: "buyer-a" };
    expect(isCustomerScopedRecord({ record, merchantOpenId: "merchant-a", buyerOpenId: "buyer-a" })).toBe(true);
    expect(isCustomerScopedRecord({ record, merchantOpenId: "merchant-a", buyerOpenId: "buyer-b" })).toBe(false);
    expect(isCustomerScopedRecord({ record, merchantOpenId: "merchant-b", buyerOpenId: "buyer-a" })).toBe(false);
    expect(isCustomerScopedRecord({ record: { ...record, buyerOpenId: null }, merchantOpenId: "merchant-a", buyerOpenId: "buyer-a" })).toBe(false);
  });

  it("keeps OCR-confirmation gating and irreversible actions independently blocked", () => {
    expect(customerCaseEvidenceState({ documentCount: 1, hasUnreviewedExtraction: true })).toBe("evidence_pending");
    expect(() => transitionCustomerCase({ status: "return_received", actor: "merchant", action: "refund", issueType: "return_request" })).toThrow("not permitted");
    expect(() => transitionCustomerCase({ status: "resolution_offered", actor: "customer", action: "submit_external_dispute", issueType: "wrong_amount" })).toThrow("not permitted");
  });

  it("calculates readiness from required weighted evidence for the reason code, not raw document count", () => {
    const onlyPayment = calculateCustomerCaseEvidenceReadiness({ issueType: "refund_issue", documentKinds: ["payment_confirmation", "other"] });
    expect(onlyPayment.score).toBe(60);
    expect(onlyPayment.present.map(item => item.kind)).toEqual(["payment_confirmation"]);
    expect(onlyPayment.missing.map(item => item.kind)).toEqual(["support_conversation"]);
    expect(onlyPayment.unrelatedDocumentKinds).toEqual(["other"]);
    expect(calculateCustomerCaseEvidenceReadiness({ issueType: "refund_issue", documentKinds: ["payment_confirmation", "support_conversation"] }).score).toBe(100);
  });
});
