import { describe, expect, it } from "vitest";
import { analyzeCustomerStatementWithOllama, OLLAMA_SENTIMENT_BOUNDARY, OLLAMA_SENTIMENT_MODEL } from "./ollamaSentiment";

describe("local Ollama sentiment adapter", () => {
  it("accepts only schema-validated numeric sentiment and preserves a non-decisive boundary", async () => {
    const result = await analyzeCustomerStatementWithOllama("The delivery update has been very disappointing.", {
      fetchImpl: async () => new Response(JSON.stringify({ response: JSON.stringify({ sentiment: -0.72, confidence: 0.82, reasoning: "Clear dissatisfaction about the update." }) }), { status: 200 }),
    });
    expect(result).toMatchObject({ mode: "ollama_local", status: "model_response_validated", model: OLLAMA_SENTIMENT_MODEL, sentimentLabel: "very_negative", confidencePercent: 82 });
    expect(result.boundary).toBe(OLLAMA_SENTIMENT_BOUNDARY);
    expect(result.boundary).toContain("cannot deny");
  });

  it("returns uncertain fallback when the local runtime cannot be reached", async () => {
    const result = await analyzeCustomerStatementWithOllama("Please share the current delivery status for my local case.", {
      fetchImpl: async () => { throw new TypeError("connection refused"); },
    });
    expect(result).toMatchObject({ mode: "deterministic_fallback", status: "runtime_unavailable", sentimentLabel: "uncertain", sentimentScore: null, confidencePercent: null });
  });

  it("rejects out-of-range or malformed model output instead of inferring a signal", async () => {
    const result = await analyzeCustomerStatementWithOllama("I need a factual update on the merchant review.", {
      fetchImpl: async () => new Response(JSON.stringify({ response: JSON.stringify({ sentiment: 7, confidence: 1 }) }), { status: 200 }),
    });
    expect(result).toMatchObject({ mode: "deterministic_fallback", status: "invalid_response", sentimentLabel: "uncertain" });
  });
});
