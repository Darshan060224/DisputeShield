import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

beforeAll(() => {
  vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_integration_key");
  vi.stubEnv("RAZORPAY_KEY_SECRET", "test_secret_for_integration");
  vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "test_webhook_secret_for_integration");
});
afterAll(() => vi.unstubAllEnvs());

const state = vi.hoisted(() => ({ intakes: [] as Array<Record<string, any>>, events: [] as Array<Record<string, any>>, evidence: [] as Array<Record<string, any>>, nextId: 1 }));

function rowsWithWhere(rows: Array<Record<string, any>>) {
  const result = [...rows] as Array<Record<string, any>> & { where?: () => { limit: (count: number) => Promise<Array<Record<string, any>>> } };
  result.where = () => ({ limit: async (count: number) => result.slice(0, count) });
  return result;
}

function makeIsolatedDb(schema: any) {
  return {
    select: () => ({ from: (table: unknown) => rowsWithWhere(table === schema.paymentIntakes ? state.intakes : table === schema.webhookEvents ? state.events : table === schema.paymentEvidenceEvents ? state.evidence : []) }),
    insert: (table: unknown) => ({ values: async (values: Record<string, any>) => {
      const record = { id: state.nextId++, ...values };
      if (table === schema.paymentIntakes) state.intakes.push(record);
      if (table === schema.webhookEvents) state.events.push(record);
      if (table === schema.paymentEvidenceEvents) state.evidence.push(record);
      return record;
    } }),
    update: (table: unknown) => ({ set: (values: Record<string, any>) => ({ where: async () => {
      const target = table === schema.paymentIntakes ? state.intakes[0] : undefined;
      if (target) Object.assign(target, values);
    } }) }),
  };
}

vi.mock("./db", async () => {
  const schema = await import("../drizzle/schema");
  return { getDb: vi.fn(async () => makeIsolatedDb(schema)) };
});

vi.mock("./razorpayClient", async importOriginal => {
  const actual = await importOriginal<typeof import("./razorpayClient")>();
  return {
    ...actual,
    createMerchantPaymentOrder: vi.fn(async () => ({ id: "order_lifecycle_1", amount: 12500, currency: "INR", status: "created" })),
    getRazorpayAccountSnapshot: vi.fn(async () => ({ scope: "latest_100_records", collectedAmount: 0, capturedPayments: 0, refundAmount: 0, processedRefunds: 0, disputedAmount: 0, openDisputes: 0, underReviewDisputes: 0, failedPayments: 0 })),
  };
});

import { appRouter } from "./routers";
import { registerRazorpayWebhook } from "./razorpay";

function context(): TrpcContext {
  return {
    user: { id: 1, openId: "merchant-lifecycle", name: "Merchant", email: "merchant@example.com", loginMethod: "oauth", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("real procedure and webhook merchant payment lifecycle", () => {
  it("requires a signed capture webhook before persistent metrics and evidence are created", async () => {
    state.intakes.length = 0; state.events.length = 0; state.evidence.length = 0; state.nextId = 1;
    const caller = appRouter.createCaller(context());
    const created = await caller.createPaymentIntake({ amountRupees: 125, purpose: "merchant_payment" });
    const signature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!).update(`${created.orderId}|pay_lifecycle_1`).digest("hex");
    await caller.verifyPaymentIntake({ orderId: created.orderId, paymentId: "pay_lifecycle_1", signature });

    expect(state.intakes[0]?.status).toBe("client_confirmed");
    expect(state.evidence).toHaveLength(0);
    await expect(caller.dashboard()).resolves.toMatchObject({ capturedPayments: 0, collectedAmount: 0 });

    let webhookHandler: any;
    registerRazorpayWebhook({ post: (_path: string, _raw: unknown, handler: unknown) => { webhookHandler = handler; } } as any);
    const payload = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_lifecycle_1", order_id: created.orderId, amount: 12500 } } } });
    const webhookSignature = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!).update(payload).digest("hex");
    const response: { status?: number; body?: unknown } = {};
    await webhookHandler({ body: Buffer.from(payload), header: (name: string) => name === "x-razorpay-signature" ? webhookSignature : name === "x-razorpay-event-id" ? "evt_lifecycle_1" : undefined }, { status: (status: number) => ({ json: (body: unknown) => { response.status = status; response.body = body; } }) });

    expect(response.status).toBe(200);
    expect(state.intakes[0]?.status).toBe("captured");
    expect(state.evidence).toHaveLength(1);
    expect(state.evidence[0]).toMatchObject({ eventId: "evt_lifecycle_1", razorpayPaymentId: "pay_lifecycle_1", amountPaise: 12500, signatureVerified: true });
    await expect(caller.dashboard()).resolves.toMatchObject({ capturedPayments: 1, collectedAmount: 125 });
  });
});
