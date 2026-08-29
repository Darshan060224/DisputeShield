import { afterEach, describe, expect, it, vi } from "vitest";
import { extractCustomerDocument } from "./customerDocumentOcr";

const originalKey = process.env.AZURE_OPENAI_API_KEY || process.env.GEMINI_API_KEY;

afterEach(() => {
  if (originalKey) process.env.AZURE_OPENAI_API_KEY = originalKey;
  vi.restoreAllMocks();
});

describe("Azure OpenAI GPT-5-6 Luna customer evidence assistance", () => {
  it("returns bounded candidate facts rather than a financial or case decision", async () => {
    process.env.AZURE_OPENAI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ documentType: "delivery_receipt", summary: "Visible tracking reference only.", overallConfidence: 72, fields: [{ key: "tracking_reference", value: "TRK-100", confidence: 88, relation: "supports" }], warnings: ["Customer and merchant review required."] }) } }] }), { status: 200 })));

    const result = await extractCustomerDocument({ contentType: "image/png", data: Buffer.from("image"), linkedOrderReference: "CS-ORDER-1", issueType: "partial_delivery" });
    expect(result.model).toBe("gpt-5-6-luna");
    expect(result.extraction).toMatchObject({ documentType: "delivery_receipt", overallConfidence: 72 });
    expect(result.extraction.summary).not.toMatch(/refund|approve|dispute/i);
  });

  it("fails closed when Azure OpenAI is unavailable so the original document can remain in human review", async () => {
    process.env.AZURE_OPENAI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
    await expect(extractCustomerDocument({ contentType: "application/pdf", data: Buffer.from("%PDF-1.4"), linkedOrderReference: "CS-ORDER-1", issueType: "refund_issue" })).rejects.toThrow("unavailable");
  });
});
