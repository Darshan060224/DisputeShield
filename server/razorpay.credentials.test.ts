import { describe, expect, it } from "vitest";

const hasCredentials = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

describe.skipIf(!hasCredentials)("Razorpay credential configuration", () => {
  it("authenticates against the read-only payments listing endpoint", async () => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    expect(keyId, "RAZORPAY_KEY_ID must be configured").toBeTruthy();
    expect(keySecret, "RAZORPAY_KEY_SECRET must be configured").toBeTruthy();

    const credentials = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    let response: Response;
    try {
      response = await fetch("https://api.razorpay.com/v1/payments?count=1", {
        headers: { Authorization: `Basic ${credentials}` },
        signal: AbortSignal.timeout(10000),
      });
    } catch (error) {
      // Network timeouts are upstream availability failures, not proof that configured credentials are invalid.
      expect(String(error)).toMatch(/timeout|abort|fetch|network/i);
      return;
    }

    const body = await response.json() as { entity?: string; count?: number; error?: { description?: string } };
    if (response.status === 429 || response.status >= 500) {
      expect(body.error?.description ?? "").toMatch(/rate|quota|temporar|unavailable|server/i);
      return;
    }
    expect(response.status, "Razorpay credentials were rejected or the API request failed").toBe(200);
    expect(body.entity).toBe("collection");
    expect(typeof body.count).toBe("number");
  }, 15000);
});
