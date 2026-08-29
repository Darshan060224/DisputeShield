import { describe, expect, it } from "vitest";
import { evaluateMerchantTeamAccess, hasMerchantTeamPermission } from "./merchantTeamAccess";

describe("merchant team roles", () => {
  it("keeps the merchant owner implicit and fully permitted locally", () => {
    expect(evaluateMerchantTeamAccess({ actorOpenId: "merchant", merchantOpenId: "merchant", required: "approver" })).toEqual({ permitted: true, role: "owner", reason: "merchant_owner" });
  });

  it("enforces a narrow, ordered local permission model", () => {
    expect(hasMerchantTeamPermission("viewer", "reviewer")).toBe(false);
    expect(hasMerchantTeamPermission("reviewer", "reviewer")).toBe(true);
    expect(hasMerchantTeamPermission("approver", "reviewer")).toBe(true);
    expect(evaluateMerchantTeamAccess({ actorOpenId: "member", merchantOpenId: "merchant", memberRole: "reviewer", active: true, required: "approver" })).toEqual({ permitted: false, role: "reviewer", reason: "insufficient_role" });
  });

  it("rejects inactive or absent memberships", () => {
    expect(evaluateMerchantTeamAccess({ actorOpenId: "member", merchantOpenId: "merchant", memberRole: "approver", active: false, required: "viewer" })).toEqual({ permitted: false, role: null, reason: "no_active_membership" });
  });
});
