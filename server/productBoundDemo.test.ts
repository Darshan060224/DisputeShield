import { describe, expect, it } from "vitest";
import { productBoundDemoSteps } from "../client/src/components/ProductBoundDemo";

describe("product-bound lifecycle demo contract", () => {
  it("orders setup, purchase, verification, fulfilment, evidence, and review", () => {
    expect(productBoundDemoSteps.map(step => step.label)).toEqual([
      "Merchant creates the product",
      "Customer opens the product",
      "Customer explicitly chooses to pay",
      "Payment facts are verified",
      "Merchant records fulfilment",
      "Customer reports an issue",
      "OCR facts are confirmed",
      "Merchant reviews the case",
      "Automation checks refund readiness",
      "Merchant approves the refund",
      "Razorpay refund is initiated",
      "Refund outcome is verified",
      "External dispute arrives independently",
      "Merchant prepares the response",
    ]);
  });

  it("contains explicit hosted-checkout and bank-dispute boundaries", () => {
    expect(productBoundDemoSteps[2].kind).toBe("CHECKOUT GATE");
    expect(productBoundDemoSteps[2].text).toMatch(/Stop at the hosted Checkout/);
    expect(productBoundDemoSteps[8].kind).toBe("REFUND PREPARATION");
    expect(productBoundDemoSteps[9].kind).toBe("REFUND GATE");
    expect(productBoundDemoSteps[10].kind).toBe("RAZORPAY WRITE GATE");
    expect(productBoundDemoSteps[10].text).toMatch(/merchant-confirmed action/);
    expect(productBoundDemoSteps[11].text).toMatch(/signed refund webhook/);
    expect(productBoundDemoSteps[12].kind).toBe("RAZORPAY DEPENDENCY");
    expect(productBoundDemoSteps[12].text).toMatch(/cannot trigger it/);
    expect(productBoundDemoSteps[13].text).toMatch(/contest, appeal.*remain blocked/);
  });
});

