import { describe, expect, it } from "vitest";
import { bindFirstCustomerAccess } from "./customerAccessBinding";

describe("first customer access binding", () => {
  it("allows only one competing buyer to claim an unbound private link", async () => {
    let boundBuyerOpenId: string | null = null;
    const grant = { id: 7, boundBuyerOpenId };
    const claim = async (buyerOpenId: string) => {
      if (boundBuyerOpenId) return false;
      boundBuyerOpenId = buyerOpenId;
      return true;
    };
    const reload = async () => ({ id: 7, boundBuyerOpenId });
    const run = (buyerOpenId: string) => bindFirstCustomerAccess({
      grant,
      buyerOpenId,
      tryClaimUnboundGrant: () => claim(buyerOpenId),
      reloadGrant: reload,
      unavailableMessage: "link unavailable",
      alreadyBoundMessage: "link already bound",
    });

    const [first, second] = await Promise.allSettled([run("buyer-a"), run("buyer-b")]);
    expect([first.status, second.status]).toContain("fulfilled");
    expect([first.status, second.status]).toContain("rejected");
    expect(boundBuyerOpenId).toMatch(/buyer-[ab]/);
  });

  it("allows the bound buyer to return without a second claim", async () => {
    let attemptedClaim = false;
    const result = await bindFirstCustomerAccess({
      grant: { id: 9, boundBuyerOpenId: "buyer-a" },
      buyerOpenId: "buyer-a",
      tryClaimUnboundGrant: async () => { attemptedClaim = true; return false; },
      reloadGrant: async () => null,
      unavailableMessage: "link unavailable",
      alreadyBoundMessage: "link already bound",
    });
    expect(result.boundBuyerOpenId).toBe("buyer-a");
    expect(attemptedClaim).toBe(false);
  });
});
