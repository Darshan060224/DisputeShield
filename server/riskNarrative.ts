import crypto from "node:crypto";
import { invokeLLM } from "./_core/llm";
import { getOrSetScopedCache } from "./requestCache";

export type CaseFactSheet = {
  caseReference: string;
  paymentState: string;
  fulfilmentState: string;
  evidencePresent: string[];
  evidenceMissing: string[];
  caseAgeHours: number;
  slaDeadlineHours: number;
  reasonCode: string;
  readinessScore: number;
  recommendedOperationalStep: string;
  sourceLabels: string[];
};

export type CaseFactSheetInput = Omit<CaseFactSheet, "readinessScore"> & { requiredEvidenceCount?: number; readinessScore?: number };
export type RiskNarrative = { mode: "ai_assisted" | "deterministic_fallback"; summary: string; recommendation: string; citations: string[]; boundary: string; factSheetHash: string; promptVersion: string; readinessScore: number; evidencePresent: string[]; evidenceMissing: string[]; reason?: string };

export const RISK_NARRATIVE_PROMPT_VERSION = "2026-08-27.1";
const boundary = "AI-assisted summary of this case fact sheet — not a decision. It cannot infer fault, deny a case, use fraud-adjacent language, approve/refuse money, contest a dispute, or submit an external response.";
const forbiddenLanguage = /\b(fraud|fraudulent|lying|liar|fake|scam|scammer|deceiv\w*)\b/i;
const monetaryLanguage = /(?:₹|\$|€|\b(?:inr|rupees?|dollars?|amount)\b)/i;

export function buildCaseFactSheet(input: CaseFactSheetInput): CaseFactSheet {
  const required = Math.max(input.requiredEvidenceCount ?? 1, 1);
  const readinessScore = input.readinessScore ?? Math.round((input.evidencePresent.length / required) * 100);
  return { ...input, caseAgeHours: Math.max(0, Math.round(input.caseAgeHours)), slaDeadlineHours: Math.max(0, Math.round(input.slaDeadlineHours)), readinessScore: Math.max(0, Math.min(100, readinessScore)), evidencePresent: Array.from(new Set(input.evidencePresent)).sort(), evidenceMissing: Array.from(new Set(input.evidenceMissing)).sort(), sourceLabels: Array.from(new Set(input.sourceLabels)).sort() };
}

export function hashCaseFactSheet(factSheet: CaseFactSheet): string {
  return crypto.createHash("sha256").update(JSON.stringify(factSheet)).digest("hex");
}

export function deterministicRiskNarrative(factSheet: CaseFactSheet, reason?: string): RiskNarrative {
  const evidence = factSheet.evidenceMissing.length ? `Missing evidence: ${factSheet.evidenceMissing.join(", ")}.` : "The required local-policy evidence is present.";
  return { mode: "deterministic_fallback", summary: `Case ${factSheet.caseReference} has payment state ${factSheet.paymentState}, fulfilment state ${factSheet.fulfilmentState}, and readiness ${factSheet.readinessScore}%. ${evidence}`, recommendation: factSheet.recommendedOperationalStep, citations: factSheet.sourceLabels, boundary, factSheetHash: hashCaseFactSheet(factSheet), promptVersion: RISK_NARRATIVE_PROMPT_VERSION, readinessScore: factSheet.readinessScore, evidencePresent: factSheet.evidencePresent, evidenceMissing: factSheet.evidenceMissing, ...(reason ? { reason } : {}) };
}

function safeNarrativeOutput(candidate: unknown, factSheet: CaseFactSheet): candidate is { summary: string; recommendation: string; citations: string[] } {
  if (!candidate || typeof candidate !== "object") return false;
  const parsed = candidate as { summary?: unknown; recommendation?: unknown; citations?: unknown };
  if (typeof parsed.summary !== "string" || typeof parsed.recommendation !== "string" || !Array.isArray(parsed.citations) || parsed.citations.some(source => typeof source !== "string" || !factSheet.sourceLabels.includes(source))) return false;
  const prose = `${parsed.summary} ${parsed.recommendation}`;
  if (prose.length > 900 || forbiddenLanguage.test(prose) || monetaryLanguage.test(prose)) return false;
  return true;
}

async function requestRiskNarrative(factSheet: CaseFactSheet): Promise<RiskNarrative> {
  const attempt = async () => {
    const response = await invokeLLM({
      model: "gpt-5-6-luna",
      maxTokens: 300,
      messages: [
        { role: "system", content: "You are a merchant-operations evidence assistant. Summarize and prioritize only the supplied JSON fact sheet. Never infer facts not present, assign fault, use fraud/intent language, mention money, name a person, claim delivery/refund/outcome, or recommend an automatic financial/external action. Examples: if evidenceMissing has delivery tracking, say to reconcile or request delivery tracking; if evidenceMissing is empty, say the local-policy set is present. Return a concise JSON object only and cite only sourceLabels included in the fact sheet." },
        { role: "user", content: JSON.stringify(factSheet) },
      ],
      outputSchema: { name: "risk_narrative", strict: true, schema: { type: "object", properties: { summary: { type: "string" }, recommendation: { type: "string" }, citations: { type: "array", items: { type: "string" } } }, required: ["summary", "recommendation", "citations"], additionalProperties: false } },
    });
    const raw = response.choices[0]?.message.content;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : null;
    if (!safeNarrativeOutput(parsed, factSheet)) throw new Error("Generated response did not pass strict fact-sheet safety validation.");
      return { mode: "ai_assisted" as const, summary: parsed.summary.slice(0, 600), recommendation: parsed.recommendation.slice(0, 260), citations: parsed.citations, boundary, factSheetHash: hashCaseFactSheet(factSheet), promptVersion: RISK_NARRATIVE_PROMPT_VERSION, readinessScore: factSheet.readinessScore, evidencePresent: factSheet.evidencePresent, evidenceMissing: factSheet.evidenceMissing };
  };
  try { return await attempt(); } catch {
    try { return await attempt(); } catch { return deterministicRiskNarrative(factSheet, "AI response did not pass strict fact-sheet validation; deterministic evidence summary retained."); }
  }
}

export async function generateRiskNarrative(merchantOpenId: string, factSheet: CaseFactSheet): Promise<RiskNarrative> {
  const hash = hashCaseFactSheet(factSheet);
  return getOrSetScopedCache(`risk-narrative:${merchantOpenId}:${factSheet.caseReference}:${hash}`, 15 * 60_000, () => requestRiskNarrative(factSheet));
}
