export type SellerWorkspaceDisplayInput = {
  isAuthenticated: boolean;
  workspaceReady: boolean;
  workspaceError: boolean;
  productCount: number;
  orderCount: number;
  workspaceProductCount: number;
  workspaceOrderCount: number;
  productsLoading: boolean;
  ordersLoading: boolean;
  productsError: boolean;
  ordersError: boolean;
};

export function sellerWorkspaceDisplayState(input: SellerWorkspaceDisplayInput) {
  if (!input.isAuthenticated || input.workspaceError) return "locked" as const;
  if (!input.workspaceReady) return "verifying" as const;
  const countsMismatch = input.workspaceProductCount !== input.productCount || input.workspaceOrderCount !== input.orderCount;
  if (!input.productsError && !input.ordersError && (input.productsLoading || input.ordersLoading || countsMismatch)) return "synchronizing" as const;
  return "ready" as const;
}
