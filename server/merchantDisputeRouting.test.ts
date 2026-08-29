import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";

const state = vi.hoisted(() => ({ events: [] as Array<Record<string, any>>, apiDisputes: [] as Array<Record<string, any>>, exports: [] as Array<Record<string, any>> }));

function queryRows(rows: Array<Record<string, any>>) {
  const result = [...rows] as Array<Record<string, any>> & { where?: () => any; orderBy?: () => any; limit?: (count: number) => Promise<Array<Record<string, any>>> };
  result.where = () => result;
  result.orderBy = () => result;
  result.limit = async (count: number) => result.slice(0, count);
  return result;
}

function makeIsolatedDb(schema: any) {
  return {
    select: () => ({ from: (table: unknown) => queryRows(table === schema.webhookEvents ? state.events : []) }),
    insert: (table: unknown) => ({ values: async (values: Record<string, any>) => { if (table === schema.exportRecords) state.exports.push(values); return values; } }),
  };
}

vi.mock("./db", async () => {
  const schema = await import("../drizzle/schema");
  return { getDb: vi.fn(async () => makeIsolatedDb(schema)) };
});

vi.mock("./razorpayClient", async importOriginal => {
  const actual = await importOriginal<typeof import("./razorpayClient")>();
  return { ...actual, listLiveRazorpayDisputes: vi.fn(async () => state.apiDisputes) };
});

import { appRouter } from "./routers";

function context(): TrpcContext {
  return {
    user: { id: 1, openId: ENV.ownerOpenId, name: "Merchant", email: "merchant@example.com", loginMethod: "oauth", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("merchantDisputes signed-webhook routing", () => {
  it("returns the merchant-scoped signed webhook projection and suppresses the same external API observation", async () => {
    state.events.length = 0;
    state.apiDisputes.length = 0;
    state.exports.length = 0;
    const externalId = "disp_webhook_priority_1";
    state.events.push({
      eventId: "evt_signed_dispute_priority_1", eventType: "payment.dispute.created", merchantOpenId: ENV.ownerOpenId, signatureVerified: true,
      externalDisputeId: externalId, externalReasonCode: "product_not_received", externalPhase: "chargeback", externalStatus: "open", externalRespondBy: 1_800_000_000,
      rawMetadata: JSON.stringify({ payload: { dispute: { entity: { id: externalId, amount: 9200, reason_code: "product_not_received", phase: "chargeback", status: "open", respond_by: 1_800_000_000, payment_id: "pay_priority_1", evidence: { delivery_proof: ["awaiting"] } } } } }),
    });
    state.apiDisputes.push({ id: externalId, amount: 9200, reason: "Product/service not received", reason_code: "product_not_received", status: "open", phase: "chargeback", respond_by: 1_800_000_000, payment_id: "pay_priority_1", evidence: { delivery_proof: ["awaiting"] } });

    const cases = await appRouter.createCaller(context()).merchantDisputes();

    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({
      id: "WEBHOOK-evt_signed_dispute_priority_1",
      externalId,
      sourceKind: "signed_webhook_verified",
      label: "Product Not Received",
      externalDispute: { sourceBoundary: "signed_webhook_verified" },
    });

    const prepared = await appRouter.createCaller(context()).prepareExternalDisputePacket({ externalDisputeId: externalId, approvalPhrase: "PREPARE VERIFIED EXTERNAL PACKET" });
    expect(prepared).toMatchObject({ success: true, state: "prepared", externalDisputeId: externalId, sourceKind: "signed_webhook_external" });
    expect(state.exports).toHaveLength(1);
    expect(state.exports[0]).toMatchObject({ disputeId: 0, approvalPhrase: "PREPARE VERIFIED EXTERNAL PACKET", packetState: "prepared", sourceKind: "signed_webhook_external", externalDisputeId: externalId });
  });

  it("rejects API-only observations because external preparation requires a signed webhook source", async () => {
    state.events.length = 0;
    state.apiDisputes.length = 0;
    state.exports.length = 0;
    state.apiDisputes.push({ id: "disp_api_only_1", amount: 9200, reason: "Product/service not received", reason_code: "product_not_received", status: "open" });
    await expect(appRouter.createCaller(context()).prepareExternalDisputePacket({ externalDisputeId: "disp_api_only_1", approvalPhrase: "PREPARE VERIFIED EXTERNAL PACKET" })).rejects.toThrow("Only a signed Razorpay webhook dispute");
    expect(state.exports).toHaveLength(0);
  });
});
