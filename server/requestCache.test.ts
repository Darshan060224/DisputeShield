import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearScopedCacheForTest, getOrSetScopedCache, invalidateScopedCache } from "./requestCache";

describe("scoped request cache", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    clearScopedCacheForTest();
  });

  it("reuses a bounded entry only for the same scoped key", async () => {
    let calls = 0;
    const loader = async () => ({ calls: ++calls });
    expect(await getOrSetScopedCache("catalog:merchant-a", 5_000, loader)).toEqual({ calls: 1 });
    expect(await getOrSetScopedCache("catalog:merchant-a", 5_000, loader)).toEqual({ calls: 1 });
    expect(await getOrSetScopedCache("catalog:merchant-b", 5_000, loader)).toEqual({ calls: 2 });
  });

  it("invalidates all and only entries with the requested scoped prefix", async () => {
    let calls = 0;
    const loader = async () => ++calls;
    await getOrSetScopedCache("customer-orders:merchant-a:buyer-a", 5_000, loader);
    await getOrSetScopedCache("customer-orders:merchant-a:buyer-b", 5_000, loader);
    await getOrSetScopedCache("catalog:merchant-a", 5_000, loader);
    await invalidateScopedCache("customer-orders:merchant-a:");
    expect(await getOrSetScopedCache("customer-orders:merchant-a:buyer-a", 5_000, loader)).toBe(4);
    expect(await getOrSetScopedCache("catalog:merchant-a", 5_000, loader)).toBe(3);
  });

  it("gracefully falls back to local memory if REDIS_URL is unconfigured", async () => {
    vi.stubEnv("REDIS_URL", "");
    let calls = 0;
    const loader = async () => ++calls;
    const val1 = await getOrSetScopedCache("test:fallback:1", 1000, loader);
    const val2 = await getOrSetScopedCache("test:fallback:1", 1000, loader);
    expect(val1).toBe(1);
    expect(val2).toBe(1);
  });
});
