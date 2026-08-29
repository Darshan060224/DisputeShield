export type BuyerOrderSource =
  | "local_order_created"
  | "browser_checkout_opened"
  | "checkout_signature_verified"
  | "razorpay_api_observed"
  | "signed_razorpay_webhook_verified"
  | "checkout_failed";

type BuyerOrderRow = {
  id: number;
  merchantOpenId: string;
  buyerOpenId: string | null;
  orderReference: string;
  productName: string;
  quantity: number;
  totalAmountPaise: number;
  currency: string;
  paymentObservation: "not_started" | "checkout_opened" | "client_confirmed" | "api_observed" | "webhook_verified" | "failed";
  fulfillmentState: "unfulfilled" | "packed" | "shipped" | "delivered" | "delivery_exception";
  createdAt: Date;
};

type BuyerCaseRow = {
  sellerOrderId: number;
  merchantOpenId: string;
  buyerOpenId: string;
  caseReference: string;
  issueType: string;
  status: string;
};

const PAYMENT_SOURCES: Record<BuyerOrderRow["paymentObservation"], BuyerOrderSource> = {
  not_started: "local_order_created",
  checkout_opened: "browser_checkout_opened",
  client_confirmed: "checkout_signature_verified",
  api_observed: "razorpay_api_observed",
  webhook_verified: "signed_razorpay_webhook_verified",
  failed: "checkout_failed",
};

/**
 * A final in-memory boundary after the database predicate. This makes a cache or
 * adapter returning an over-broad result incapable of exposing an order to a
 * different buyer or merchant in the catalog order centre.
 */
export function summarizeBuyerOrders<TOrder extends BuyerOrderRow, TCase extends BuyerCaseRow>(input: {
  orders: TOrder[];
  cases: TCase[];
  merchantOpenId: string;
  buyerOpenId: string;
}) {
  const visibleOrders = input.orders.filter(order => order.merchantOpenId === input.merchantOpenId && order.buyerOpenId === input.buyerOpenId);
  const latestCaseByOrder = new Map<number, TCase>();
  for (const caseItem of input.cases) {
    if (caseItem.merchantOpenId !== input.merchantOpenId || caseItem.buyerOpenId !== input.buyerOpenId || !visibleOrders.some(order => order.id === caseItem.sellerOrderId) || latestCaseByOrder.has(caseItem.sellerOrderId)) continue;
    latestCaseByOrder.set(caseItem.sellerOrderId, caseItem);
  }

  return visibleOrders.map(order => {
    const resolution = latestCaseByOrder.get(order.id);
    return {
      id: order.id,
      orderReference: order.orderReference,
      productName: order.productName,
      quantity: order.quantity,
      totalAmountPaise: order.totalAmountPaise,
      currency: order.currency,
      paymentObservation: order.paymentObservation,
      paymentSource: PAYMENT_SOURCES[order.paymentObservation],
      fulfillmentState: order.fulfillmentState,
      fulfillmentSource: "merchant_record" as const,
      createdAt: order.createdAt,
      localResolution: resolution ? {
        caseReference: resolution.caseReference,
        issueType: resolution.issueType,
        status: resolution.status,
        source: "local_customer_case" as const,
      } : null,
    };
  });
}
