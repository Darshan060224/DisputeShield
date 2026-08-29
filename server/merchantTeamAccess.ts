export const MERCHANT_TEAM_ROLES = ["viewer", "reviewer", "approver"] as const;
export type MerchantTeamRole = (typeof MERCHANT_TEAM_ROLES)[number];
export type EffectiveMerchantRole = MerchantTeamRole | "owner";

const roleRank: Record<EffectiveMerchantRole, number> = { viewer: 1, reviewer: 2, approver: 3, owner: 4 };

export function hasMerchantTeamPermission(role: EffectiveMerchantRole, required: MerchantTeamRole) {
  return roleRank[role] >= roleRank[required];
}

export function evaluateMerchantTeamAccess(input: { actorOpenId: string; merchantOpenId: string; memberRole?: MerchantTeamRole | null; active?: boolean; required: MerchantTeamRole }) {
  if (input.actorOpenId === input.merchantOpenId) return { permitted: true as const, role: "owner" as const, reason: "merchant_owner" as const };
  if (!input.active || !input.memberRole) return { permitted: false as const, role: null, reason: "no_active_membership" as const };
  if (!hasMerchantTeamPermission(input.memberRole, input.required)) return { permitted: false as const, role: input.memberRole, reason: "insufficient_role" as const };
  return { permitted: true as const, role: input.memberRole, reason: "active_membership" as const };
}

export const MERCHANT_TEAM_BOUNDARY = "Internal merchant-team roles govern only local DisputeShield workspace access. They do not create provider accounts, send invitations, submit external disputes, issue refunds, or override Razorpay, bank, or merchant approval requirements.";
