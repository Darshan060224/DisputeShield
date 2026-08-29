import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const state = vi.hoisted(() => ({
  snapshot: vi.fn(),
  recent: vi.fn(),
  liveDisputes: vi.fn(),
}));

vi.mock("./razorpayClient", async importOriginal => {
  const actual = await importOriginal<typeof import("./razorpayClient")>();
  return {
    ...actual,
    getRazorpayAccountSnapshot: state.snapshot,
    listRecentRazorpayPayments: state.recent,
    listLiveRazorpayDisputes: state.liveDisputes,
  };
});

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({
      from: () => [],
    }),
  })),
}));

import { appRouter } from "./routers";

function context(): TrpcContext {
  return {
    user: { id: 1, openId: "merchant-resilience", name: "Merchant", email: "merchant@example.com", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("dashboard external-read resilience", () => {
  it("returns conservative dashboard state when Razorpay snapshot and connection reads fail", async () => {
    state.snapshot.mockRejectedValue(new Error("Razorpay timeout"));
    state.recent.mockRejectedValue(new Error("Razorpay timeout"));

    await expect(appRouter.createCaller(context()).dashboard()).resolves.toMatchObject({
      apiAvailable: false,
      collectedAmount: 0,
      capturedPayments: 0,
      razorpayReportedCapturedPayments: 0,
      integrationMessage: "Razorpay account read is temporarily unavailable; no capture or dispute fact was inferred.",
    });
    await expect(appRouter.createCaller(context()).razorpayConnection()).resolves.toMatchObject({ connected: false, environment: "unavailable" });
  });

  it("returns an empty external queue when the live Razorpay dispute read fails", async () => {
    state.liveDisputes.mockRejectedValue(new Error("Razorpay timeout"));
    await expect(appRouter.createCaller(context()).merchantDisputes()).resolves.toEqual([]);
  });
});

