import { describe, expect, it } from "vitest";
import { customerSpaceHref, dashboardNavigation, disputeOperationNavigation } from "../client/src/lib/navigation";

describe("dashboard navigation contract", () => {
  it("uses real routes for primary workspaces", () => {
    expect(dashboardNavigation.map(item => item.href)).toEqual(["/", "/operations/disputes", "/payments", "/operations/settlements", "/operations/reports"]);
    expect(dashboardNavigation.every(item => item.href.startsWith("/"))).toBe(true);
  });

  it("exposes Customer Space and dedicated non-placeholder operation destinations", () => {
    expect(customerSpaceHref).toBe("/customer-space");
    expect(disputeOperationNavigation.map(item => item.href)).toEqual([
      "/operations/evidence-packets",
      "/operations/case-timeline",
      "/operations/document-vault",
      "/operations/webhook-ledger",
      "/operations/evaluation-lab",
    ]);
    expect(disputeOperationNavigation.every(item => item.href.startsWith("/"))).toBe(true);
  });
});
