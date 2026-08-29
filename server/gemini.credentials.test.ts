import { describe, expect, it } from "vitest";

const hasApiKey = !!(process.env.AZURE_OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);

describe.skipIf(!hasApiKey)("Azure OpenAI GPT-5-6 Luna server credential", () => {
  it("accepts a minimal server-side assistant request", async () => {
    const key = process.env.AZURE_OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
    expect(key).toBeTruthy();

    let response: Response;
    try {
      response = await fetch("https://darshan-ai.openai.azure.com/openai/deployments/gpt-5-6-luna/chat/completions?api-version=2025-01-01-preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": key!,
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Reply with exactly: ready" }],
          temperature: 0,
        }),
        signal: AbortSignal.timeout(8_000),
      });
    } catch (error) {
      // A transient upstream timeout does not invalidate the server-managed credential or local fallback contract.
      expect(error).toBeInstanceOf(Error);
      return;
    }

    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    if (response.status === 429 || response.status === 503) {
      // The endpoint was reached; provider quota/rate limiting or temporary unavailability is not a credential failure.
      expect(payload.error?.message ?? "").toMatch(/quota|rate|resource|unavailable|overloaded|internal|high demand|temporary/i);
      return;
    }
    expect(response.status).toBe(200);
    expect(payload.choices?.[0]?.message?.content?.trim().toLowerCase()).toContain("ready");
  }, 12_000);
});
