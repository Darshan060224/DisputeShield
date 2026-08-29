import { describe, expect, it } from "vitest";
import { buildCustomerReturnTimeline } from "../client/src/lib/customerReturnTimeline";
import { customerCaseEvidenceState, isCustomerScopedRecord, transitionCustomerCase } from "./customerCasePolicy";

describe("synthetic Customer Space workflow", () => {
  it("moves a buyer-bound return request through reviewed evidence and merchant receipt without invoking money movement", () => {
    const merchantOpenId = "synthetic-merchant";
    const buyerOpenId = "synthetic-buyer";
    const caseRecord = { merchantOpenId, buyerOpenId };
    expect(isCustomerScopedRecord({ record: caseRecord, merchantOpenId, buyerOpenId })).toBe(true);
    expect(isCustomerScopedRecord({ record: caseRecord, merchantOpenId, buyerOpenId: "other-buyer" })).toBe(false);

    expect(customerCaseEvidenceState({ documentCount: 1, hasUnreviewedExtraction: true })).toBe("evidence_pending");
    expect(customerCaseEvidenceState({ documentCount: 1, hasUnreviewedExtraction: false })).toBe("draft");

    const submitted = transitionCustomerCase({ status: "draft", actor: "customer", action: "submit", issueType: "return_request" });
    const review = transitionCustomerCase({ status: submitted, actor: "merchant", action: "start_review", issueType: "return_request" });
    const authorized = transitionCustomerCase({ status: review, actor: "merchant", action: "authorize_return", issueType: "return_request" });
    const inTransit = transitionCustomerCase({ status: authorized, actor: "customer", action: "mark_return_in_transit", issueType: "return_request" });
    const received = transitionCustomerCase({ status: inTransit, actor: "merchant", action: "record_return_received", issueType: "return_request" });
    expect(received).toBe("return_received");

    const timeline = buildCustomerReturnTimeline({
      returnReceipt: { carrierName: "Synthetic carrier", trackingReference: "SYN-RET-001", sourceKind: "merchant_confirmed_mobile_record", signatureVerified: false },
      refundRequest: { status: "prepared", amountPaise: 79900 },
    });
    expect(timeline).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "return_receipt", source: "Merchant-confirmed delivery-partner record" }),
      expect.objectContaining({ key: "refund_prepared", source: "Local merchant workflow · no money moved" }),
    ]));

    expect(() => transitionCustomerCase({ status: received, actor: "merchant", action: "refund", issueType: "return_request" })).toThrow("not permitted");
    expect(() => transitionCustomerCase({ status: received, actor: "merchant", action: "submit_external_dispute", issueType: "return_request" })).toThrow("not permitted");
  });
});
