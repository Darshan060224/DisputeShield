import { EventEmitter } from "node:events";
import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "./_core/env";

const inserts: unknown[] = [];
const existingEvents: unknown[] = [];
const db = {
  select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => existingEvents) })) })) })),
  insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { inserts.push(value); }) })),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
};

vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "signed-webhook-test-secret");
vi.stubEnv("OWNER_OPEN_ID", "merchant_owner");
vi.mock("./db", () => ({ getDb: vi.fn(async () => db) }));

import { expressRawJson, RAZORPAY_WEBHOOK_MAX_BYTES, registerRazorpayWebhook } from "./razorpay";

type Handler = (req: any, res: any) => Promise<unknown>;
type Raw = (req: any, res: any, next: () => void) => void;

async function invokeSignedDispute(payload: Record<string, unknown>, signatureOverride?: string) {
  let raw: Raw | undefined;
  let handler: Handler | undefined;
  const app = { post: vi.fn((_path: string, rawMiddleware: Raw, endpoint: Handler) => { raw = rawMiddleware; handler = endpoint; }) };
  registerRazorpayWebhook(app as any);
  const rawBody = JSON.stringify(payload);
  const req = Object.assign(new EventEmitter(), { header: (name: string) => name === "x-razorpay-signature" ? (signatureOverride ?? crypto.createHmac("sha256", "signed-webhook-test-secret").update(rawBody).digest("hex")) : name === "x-razorpay-event-id" ? "evt_signed_dispute" : undefined });
  const response: any = { statusCode: 200, body: null, status(code: number) { this.statusCode = code; return this; }, json(value: unknown) { this.body = value; return this; } };
  await new Promise<void>(resolve => { raw!(req, response, resolve); req.emit("data", Buffer.from(rawBody)); req.emit("end"); });
  await handler!(req, response);
  return response;
}

describe("signed payment.dispute webhook persistence", () => {
  beforeEach(() => { inserts.length = 0; existingEvents.length = 0; vi.clearAllMocks(); });

  it("persists merchant scope and external metadata only after a valid raw-body signature", async () => {
    const response = await invokeSignedDispute({ event: "payment.dispute.created", payload: { dispute: { entity: { id: "disp_signed_1", reason_code: "duplicate_payment", phase: "chargeback", status: "open", respond_by: 1_800_000_000, evidence: { payment_reconciliation: ["matched"] } } } } });
    expect(response.statusCode).toBe(200);
    expect(inserts[0]).toMatchObject({ eventId: "evt_signed_dispute", eventType: "payment.dispute.created", merchantOpenId: ENV.ownerOpenId, signatureVerified: true, externalDisputeId: "disp_signed_1", externalReasonCode: "duplicate_payment", externalPhase: "chargeback", externalStatus: "open", externalRespondBy: 1_800_000_000 });
  });

  it("does not write a duplicate signed event twice", async () => {
    existingEvents.push({ id: 1 });
    const response = await invokeSignedDispute({ event: "payment.dispute.created", payload: { dispute: { entity: { id: "disp_signed_1" } } } });
    expect(response.body).toEqual({ ok: true, duplicate: true });
    expect(inserts).toEqual([]);
  });

  it("rejects an invalid signature before parsing or writing an external dispute row", async () => {
    const response = await invokeSignedDispute({ event: "payment.dispute.created", payload: { dispute: { entity: { id: "disp_tampered" } } } }, "not-a-valid-signature");
    expect(response.statusCode).toBe(401);
    expect(inserts).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("rejects an oversized raw payload before JSON parsing or persistence", async () => {
    const req = Object.assign(new EventEmitter(), {});
    const response: any = { statusCode: 200, body: null, status(code: number) { this.statusCode = code; return this; }, json(value: unknown) { this.body = value; return this; } };
    let nextCalled = false;
    const complete = new Promise<void>(resolve => req.once("end", resolve));
    expressRawJson(req as any, response, () => { nextCalled = true; });
    req.emit("data", Buffer.alloc(RAZORPAY_WEBHOOK_MAX_BYTES + 1));
    req.emit("end");
    await complete;
    expect(nextCalled).toBe(false);
    expect(response.statusCode).toBe(413);
    expect(response.body).toEqual({ ok: false, error: "payload_too_large" });
    expect(db.select).not.toHaveBeenCalled();
    expect(inserts).toEqual([]);
  });
});
