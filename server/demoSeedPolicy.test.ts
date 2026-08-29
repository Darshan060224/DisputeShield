import { describe, expect, it } from "vitest";
import { DEMO_SEED_ACKNOWLEDGEMENT, demoSeedAllowed } from "./demoSeedPolicy";

describe("synthetic demo seed policy", () => {
  it("requires a non-production owner-admin acknowledgement", () => {
    expect(demoSeedAllowed({ isProduction: true, isOwner: true, isAdmin: true, acknowledgement: DEMO_SEED_ACKNOWLEDGEMENT }).allowed).toBe(false);
    expect(demoSeedAllowed({ isProduction: false, isOwner: false, isAdmin: true, acknowledgement: DEMO_SEED_ACKNOWLEDGEMENT }).allowed).toBe(false);
    expect(demoSeedAllowed({ isProduction: false, isOwner: true, isAdmin: true, acknowledgement: "other" }).allowed).toBe(false);
    expect(demoSeedAllowed({ isProduction: false, isOwner: true, isAdmin: true, acknowledgement: DEMO_SEED_ACKNOWLEDGEMENT }).allowed).toBe(true);
  });
});
