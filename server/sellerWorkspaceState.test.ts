import { describe, expect, it } from "vitest";
import { sellerWorkspaceDisplayState } from "../shared/sellerWorkspaceState";

const stableInput = {
  isAuthenticated: true,
  workspaceReady: true,
  workspaceError: false,
  productCount: 1,
  orderCount: 1,
  workspaceProductCount: 1,
  workspaceOrderCount: 1,
  productsLoading: false,
  ordersLoading: false,
  productsError: false,
  ordersError: false,
};

describe("Seller Space workspace display state", () => {
  it("never labels a cached empty product/order result as an empty workspace while workspace counts disagree", () => {
    expect(sellerWorkspaceDisplayState({ ...stableInput, productCount: 0, orderCount: 0 })).toBe("synchronizing");
  });

  it("stays synchronizing while either protected product or order query is initially loading", () => {
    expect(sellerWorkspaceDisplayState({ ...stableInput, productsLoading: true })).toBe("synchronizing");
    expect(sellerWorkspaceDisplayState({ ...stableInput, ordersLoading: true })).toBe("synchronizing");
  });

  it("returns ready only when the authenticated merchant workspace and result counts agree", () => {
    expect(sellerWorkspaceDisplayState(stableInput)).toBe("ready");
  });
});
