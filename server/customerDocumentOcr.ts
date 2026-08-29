export type ExtractedDocumentField = {
  key: string;
  value: string;
  confidence: number;
  relation: "supports" | "contradicts" | "neutral";
};

export type CustomerDocumentExtraction = {
  documentType: string;
  summary: string;
  overallConfidence: number;
  fields: ExtractedDocumentField[];
  warnings: string[];
};

const MODEL_NAME = "gpt-5-6-luna";
const AZURE_OPENAI_URL = "https://darshan-ai.openai.azure.com/openai/deployments/gpt-5-6-luna/chat/completions?api-version=2025-01-01-preview";

function clampConfidence(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0;
}

function cleanExtraction(value: unknown): CustomerDocumentExtraction {
  if (!value || typeof value !== "object") throw new Error("AI returned an invalid evidence-assistance object.");
  const candidate = value as Partial<CustomerDocumentExtraction>;
  return {
    documentType: typeof candidate.documentType === "string" ? candidate.documentType.slice(0, 80) : "unknown",
    summary: typeof candidate.summary === "string" ? candidate.summary.slice(0, 1000) : "No reliable summary was produced.",
    overallConfidence: clampConfidence(candidate.overallConfidence),
    fields: Array.isArray(candidate.fields) ? candidate.fields.slice(0, 20).map(field => ({
      key: typeof field?.key === "string" ? field.key.slice(0, 80) : "unknown_field",
      value: typeof field?.value === "string" ? field.value.slice(0, 500) : "",
      confidence: clampConfidence(field?.confidence),
      relation: field?.relation === "supports" || field?.relation === "contradicts" ? field.relation : "neutral",
    })) : [],
    warnings: Array.isArray(candidate.warnings) ? candidate.warnings.filter((warning): warning is string => typeof warning === "string").slice(0, 10).map(warning => warning.slice(0, 400)) : ["Evidence assistance needs customer and merchant review."],
  };
}

function parseJsonCandidate(text: string) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

export async function extractCustomerDocument(input: {
  contentType: string;
  data: Buffer;
  linkedOrderReference: string;
  issueType: string;
}): Promise<{ model: string; extraction: CustomerDocumentExtraction }> {
  const apiKey = process.env.AZURE_OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("AI evidence assistance is not configured.");

  const instruction = [
    "You are an evidence-assistance tool for a local merchant review.",
    "Extract only visible or explicitly stated candidate facts from the customer-supplied file.",
    "Never invent unavailable text, infer payment capture, infer delivery, accuse a customer, or recommend an automatic refund, dispute, or chargeback.",
    "Return JSON only with documentType, summary, overallConfidence (0-100), fields [{key,value,confidence,relation}], and warnings.",
    `Linked order reference: ${input.linkedOrderReference}. Customer issue: ${input.issueType}.`,
  ].join(" ");

  const isImage = input.contentType.startsWith("image/");
  const userContent: any[] = [{ type: "text", text: instruction }];
  if (isImage) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${input.contentType};base64,${input.data.toString("base64")}` }
    });
  } else {
    userContent.push({
      type: "text",
      text: `[Document Content]: ${input.data.toString("utf-8")}`
    });
  }

  const response = await fetch(AZURE_OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: "You are a helpful document extraction assistant. Output strictly valid JSON." },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });
  if (!response.ok) throw new Error(`AI evidence assistance was unavailable (HTTP ${response.status}).`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("AI evidence assistance returned no structured candidate facts.");
  return { model: MODEL_NAME, extraction: cleanExtraction(parseJsonCandidate(text)) };
}
