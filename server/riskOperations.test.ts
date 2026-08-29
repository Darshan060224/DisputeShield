import { describe, expect, it } from "vitest";
import { buildBuyerPatternSignals, buildRiskTrend, buildRollingRiskReport, buildUsageMeter, filterMerchantCases, paginateMerchantCases } from "./riskOperations";

const now = new Date("2026-08-27T08:00:00.000Z");
const cases = [
  { caseReference: "CASE-1", buyerOpenId: "buyer-alpha", issueType: "product_not_received" as const, status: "merchant_review", createdAt: now, updatedAt: now, readinessScore: 20, orderAmountPaise: 1000 },
  { caseReference: "CASE-2", buyerOpenId: "buyer-alpha", issueType: "product_not_received" as const, status: "submitted", createdAt: now, updatedAt: now, readinessScore: 100, orderAmountPaise: 2000 },
  { caseReference: "CASE-3", buyerOpenId: "buyer-alpha", issueType: "product_not_received" as const, status: "submitted", createdAt: now, updatedAt: now, readinessScore: 50, orderAmountPaise: 3000 },
  { caseReference: "CASE-4", buyerOpenId: "buyer-beta", issueType: "refund_issue" as const, status: "closed", createdAt: now, updatedAt: now, readinessScore: 100, orderAmountPaise: 500 },
];

describe("risk operations analytics", () => {
  it("filters cases deterministically without changing case state", () => {
    expect(filterMerchantCases(cases, { search: "case-2", readiness: "ready" }).map(item => item.caseReference)).toEqual(["CASE-2"]);
    expect(filterMerchantCases(cases, { issueType: "product_not_received", readiness: "needs_evidence" })).toHaveLength(2);
  });

  it("flags repeat local workload only as triage and never as fraud or a penalty", () => {
    expect(buildBuyerPatternSignals(cases)).toEqual([expect.objectContaining({ buyerReference: "Buyer--alpha", activeCaseCount: 3, productNotReceivedCount: 3, triage: "review_workload" })]);
  });

  it("returns source-neutral trends and non-billing usage counts", () => {
    expect(buildRiskTrend(cases)[0]).toEqual(expect.objectContaining({ issueType: "product_not_received", caseCount: 3, storedOrderAmountPaise: 6000 }));
    expect(buildUsageMeter({ orderCount: 1, caseCount: 2, documentCount: 3, webhookCount: 4 }).boundary).toMatch(/does not calculate a bill/i);
  });

  it("produces a factual rolling report without a savings or protection claim", () => {
    const report = buildRollingRiskReport(cases.map((caseItem, index) => ({ ...caseItem, slaLevel: index === 0 ? "elevated" as const : "watch" as const })));
    expect(report).toEqual(expect.objectContaining({ storedCaseCount: 4, activeCaseCount: 3, locallyResolvedCaseCount: 1, elevatedSlaCaseCount: 1, evidenceGapCaseCount: 2 }));
    expect(report.boundary).toMatch(/does not prove a prevented dispute/i);
  });

  it("returns a bounded page with total-result metadata without altering the source collection", () => {
    const source = Array.from({ length: 25 }, (_, index) => ({ ...cases[0], caseReference: `CASE-${index + 1}` }));
    const page = paginateMerchantCases(source, { page: 2, pageSize: 10 });
    expect(page.rows).toHaveLength(10);
    expect(page.rows[0]?.caseReference).toBe("CASE-11");
    expect(page).toMatchObject({ page: 2, pageSize: 10, total: 25, totalPages: 3, hasPreviousPage: true, hasNextPage: true });
    expect(source).toHaveLength(25);
    expect(paginateMerchantCases(source, { page: 99, pageSize: 999 })).toMatchObject({ page: 1, pageSize: 50, totalPages: 1, hasNextPage: false });
  });
});
