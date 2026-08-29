import type { CustomerIssueType } from "./customerCasePolicy";

export type RiskOperationsCase = {
  caseReference: string;
  buyerOpenId: string;
  buyerLabel?: string;
  issueType: CustomerIssueType;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  readinessScore: number;
  orderAmountPaise: number | null;
};

export type CaseSearchFilters = {
  search?: string;
  issueType?: CustomerIssueType | "all";
  status?: string | "all";
  readiness?: "all" | "needs_evidence" | "ready";
  from?: Date;
  to?: Date;
};

export type CasePageInput = { page?: number; pageSize?: number };

export function paginateMerchantCases<T>(cases: T[], input: CasePageInput = {}) {
  const pageSize = Math.min(Math.max(Math.trunc(input.pageSize ?? 50), 1), 50);
  const total = cases.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(Math.trunc(input.page ?? 1), 1), totalPages);
  const start = (page - 1) * pageSize;
  return { rows: cases.slice(start, start + pageSize), page, pageSize, total, totalPages, hasPreviousPage: page > 1, hasNextPage: page < totalPages };
}

export function filterMerchantCases<T extends RiskOperationsCase>(cases: T[], filters: CaseSearchFilters): T[] {
  const query = filters.search?.trim().toLowerCase();
  return cases.filter(caseItem => {
    if (query && ![caseItem.caseReference, caseItem.buyerOpenId, caseItem.buyerLabel ?? "", caseItem.issueType, caseItem.status].some(value => value.toLowerCase().includes(query))) return false;
    if (filters.issueType && filters.issueType !== "all" && caseItem.issueType !== filters.issueType) return false;
    if (filters.status && filters.status !== "all" && caseItem.status !== filters.status) return false;
    if (filters.readiness === "needs_evidence" && caseItem.readinessScore >= 100) return false;
    if (filters.readiness === "ready" && caseItem.readinessScore < 100) return false;
    if (filters.from && caseItem.createdAt < filters.from) return false;
    if (filters.to && caseItem.createdAt > filters.to) return false;
    return true;
  });
}

export function buildBuyerPatternSignals(cases: RiskOperationsCase[]) {
  const active = cases.filter(caseItem => !["resolved", "closed", "withdrawn"].includes(caseItem.status));
  const groups = new Map<string, RiskOperationsCase[]>();
  for (const caseItem of active) groups.set(caseItem.buyerOpenId, [...(groups.get(caseItem.buyerOpenId) ?? []), caseItem]);
  return Array.from(groups.entries())
    .map(([buyerOpenId, records]: [string, RiskOperationsCase[]]) => ({ buyerReference: `Buyer-${buyerOpenId.slice(-6) || "unknown"}`, activeCaseCount: records.length, productNotReceivedCount: records.filter((record: RiskOperationsCase) => record.issueType === "product_not_received").length, caseReferences: records.map((record: RiskOperationsCase) => record.caseReference), triage: records.filter((record: RiskOperationsCase) => record.issueType === "product_not_received").length >= 3 ? "review_workload" as const : "no_pattern" as const }))
    .filter(signal => signal.triage === "review_workload")
    .sort((a, b) => b.productNotReceivedCount - a.productNotReceivedCount || b.activeCaseCount - a.activeCaseCount);
}

export function buildRiskTrend(cases: RiskOperationsCase[]) {
  const byReason = new Map<CustomerIssueType, { count: number; readinessTotal: number; exposedAmountPaise: number }>();
  for (const caseItem of cases) {
    const current = byReason.get(caseItem.issueType) ?? { count: 0, readinessTotal: 0, exposedAmountPaise: 0 };
    current.count += 1;
    current.readinessTotal += caseItem.readinessScore;
    current.exposedAmountPaise += caseItem.orderAmountPaise ?? 0;
    byReason.set(caseItem.issueType, current);
  }
  return Array.from(byReason.entries()).map(([issueType, values]) => ({ issueType, caseCount: values.count, averageReadiness: Math.round(values.readinessTotal / values.count), storedOrderAmountPaise: values.exposedAmountPaise })).sort((a, b) => b.caseCount - a.caseCount || a.issueType.localeCompare(b.issueType));
}

export function buildUsageMeter(input: { orderCount: number; caseCount: number; documentCount: number; webhookCount: number }) {
  return { ...input, unit: "record count", boundary: "Usage is an operational count for visibility only. It does not calculate a bill, create an invoice, or enable payment collection." };
}

export function buildRollingRiskReport(cases: Array<RiskOperationsCase & { slaLevel?: "watch" | "review" | "elevated" | "resolved" }>) {
  const active = cases.filter(caseItem => !["resolved", "closed", "withdrawn"].includes(caseItem.status));
  const locallyResolved = cases.filter(caseItem => ["resolved", "closed"].includes(caseItem.status));
  const elevated = active.filter(caseItem => caseItem.slaLevel === "elevated");
  const evidenceGaps = active.filter(caseItem => caseItem.readinessScore < 100);
  const earliest = cases.map(caseItem => caseItem.createdAt.getTime()).sort((a, b) => a - b)[0] ?? null;
  const latest = cases.map(caseItem => caseItem.updatedAt.getTime()).sort((a, b) => b - a)[0] ?? null;
  return {
    storedCaseCount: cases.length,
    activeCaseCount: active.length,
    locallyResolvedCaseCount: locallyResolved.length,
    elevatedSlaCaseCount: elevated.length,
    evidenceGapCaseCount: evidenceGaps.length,
    period: earliest && latest ? { from: new Date(earliest), through: new Date(latest) } : null,
    patternStatement: `${cases.length} stored local case${cases.length === 1 ? "" : "s"}; ${active.length} active; ${locallyResolved.length} locally resolved; ${elevated.length} at elevated SLA priority; ${evidenceGaps.length} active case${evidenceGaps.length === 1 ? "" : "s"} still need evidence review.`,
    boundary: "This report aggregates merchant-stored local case records. It does not prove a prevented dispute, a financial saving, a protected order, a provider outcome, or customer intent.",
  };
}
