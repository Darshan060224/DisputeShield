import { z } from "zod";
import { sanitizePlainText } from "./plainTextSanitization";
import { recordOperationalTelemetry } from "./operationalTelemetry";

export const OLLAMA_SENTIMENT_MODEL = "pilardi/sentiment-analysis:gemma3";
export const OLLAMA_SENTIMENT_BOUNDARY = "Language triage hint only. This output does not establish truth, intent, fraud, manipulation, eligibility, payment risk, refund outcome, or dispute outcome. It cannot deny, block, penalize, refund, contest, submit, or send an external action.";

const responseSchema = z.object({
  sentiment: z.number().finite().min(-1).max(1),
  confidence: z.number().finite().min(0).max(1),
  reasoning: z.string().max(1200).optional(),
});

export type OllamaSentimentLabel = "very_negative" | "negative" | "neutral" | "positive" | "very_positive" | "uncertain";
export type OllamaSentimentResult = {
  mode: "ollama_local" | "deterministic_fallback";
  status: "model_response_validated" | "runtime_unavailable" | "model_unavailable" | "timeout" | "invalid_response" | "request_failed" | "invalid_input";
  model: string;
  source: "customer_statement";
  sentimentScore: number | null;
  sentimentLabel: OllamaSentimentLabel;
  confidencePercent: number | null;
  rationale: string;
  boundary: string;
};

type AdapterOptions = {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  merchantOpenId?: string;
};

function sentimentLabel(score: number): Exclude<OllamaSentimentLabel, "uncertain"> {
  if (score <= -0.6) return "very_negative";
  if (score <= -0.2) return "negative";
  if (score < 0.2) return "neutral";
  if (score < 0.6) return "positive";
  return "very_positive";
}

function fallback(status: OllamaSentimentResult["status"], model: string, rationale: string, merchantOpenId?: string): OllamaSentimentResult {
  recordOperationalTelemetry(merchantOpenId, "ollama_fallback");
  return {
    mode: "deterministic_fallback",
    status,
    model,
    source: "customer_statement",
    sentimentScore: null,
    sentimentLabel: "uncertain",
    confidencePercent: null,
    rationale,
    boundary: OLLAMA_SENTIMENT_BOUNDARY,
  };
}

function reasonForHttpStatus(status: number) {
  if (status === 404) return "The selected local Ollama model is not available. Install the exact model locally before trying again.";
  if (status === 401 || status === 403) return "The local Ollama endpoint rejected this advisory request. No language signal was produced.";
  return "The local Ollama endpoint did not complete this advisory request. No language signal was produced.";
}

export async function analyzeCustomerStatementWithOllama(rawStatement: string, options: AdapterOptions = {}): Promise<OllamaSentimentResult> {
  const model = options.model ?? OLLAMA_SENTIMENT_MODEL;
  const statement = sanitizePlainText(rawStatement).slice(0, 1200);
  if (statement.length < 12) return fallback("invalid_input", model, "The selected local case statement is too short for reliable language triage.", options.merchantOpenId);

  const baseUrl = (options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  const timeout = options.timeoutMs ?? 35_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        options: { temperature: 0 },
        prompt: `Return JSON only with sentiment (-1 to 1), confidence (0 to 1), and optional brief reasoning. Analyse expressed tone only. Do not infer truth, intent, fraud, manipulation, eligibility, payment risk, refund outcome, or dispute outcome. Customer statement: ${statement}`,
      }),
    });
    if (!response.ok) return fallback(response.status === 404 ? "model_unavailable" : "request_failed", model, reasonForHttpStatus(response.status), options.merchantOpenId);
    const body = await response.json() as { response?: unknown };
    if (typeof body.response !== "string") return fallback("invalid_response", model, "The local Ollama response did not include a valid JSON analysis. No language signal was produced.", options.merchantOpenId);
    let parsed: unknown;
    try { parsed = JSON.parse(body.response); } catch { return fallback("invalid_response", model, "The local Ollama response was not valid JSON. No language signal was produced.", options.merchantOpenId); }
    const result = responseSchema.safeParse(parsed);
    if (!result.success) return fallback("invalid_response", model, "The local Ollama response did not match the required bounded sentiment schema. No language signal was produced.", options.merchantOpenId);
    const rationale = sanitizePlainText(result.data.reasoning ?? "Local Ollama sentiment result validated against the required numeric schema.").slice(0, 280) || "Local Ollama sentiment result validated against the required numeric schema.";
    recordOperationalTelemetry(options.merchantOpenId, "ollama_validated");
    return {
      mode: "ollama_local",
      status: "model_response_validated",
      model,
      source: "customer_statement",
      sentimentScore: Number(result.data.sentiment.toFixed(3)),
      sentimentLabel: sentimentLabel(result.data.sentiment),
      confidencePercent: Math.round(result.data.confidence * 100),
      rationale,
      boundary: OLLAMA_SENTIMENT_BOUNDARY,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return fallback("timeout", model, "The local Ollama request exceeded the 15-second advisory timeout. No language signal was produced.", options.merchantOpenId);
    return fallback("runtime_unavailable", model, "The local Ollama runtime is unavailable at the configured loopback endpoint. Start Ollama and install the selected model before trying again.", options.merchantOpenId);
  } finally {
    clearTimeout(timer);
  }
}
