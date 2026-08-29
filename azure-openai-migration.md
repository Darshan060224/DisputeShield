# Azure OpenAI Deployment & Migration Guide

This guide documents the configuration and verification procedure for connecting DisputeShield to Azure OpenAI.

---

## 1. Configured Resource Endpoint

The Azure OpenAI inference endpoint for this environment is:

```
AZURE_OPENAI_ENDPOINT=https://darshan-23csa19-0390-resource.openai.azure.com/openai/v1
```

---

## 2. Required Environment Variables

Configure the following variables in your production / deployment environment:

| Variable Name | Description | Example / Current Setting |
| --- | --- | --- |
| `AZURE_OPENAI_ENDPOINT` | Base Azure OpenAI endpoint URL | `https://darshan-23csa19-0390-resource.openai.azure.com/openai/v1` |
| `AZURE_OPENAI_API_KEY` | Secret API key (when using key authentication) | `[SECURED]` |
| `AZURE_OPENAI_DEPLOYMENT` | Deployment identifier for structured narrative | `gpt-5-6-luna` |
| `AZURE_OPENAI_API_VERSION` | API version string | `2024-08-01-preview` |

---

## 3. Server Architecture & Fallback Flow

In `server/_core/env.ts`, `ENV.forgeApiUrl` automatically resolves `AZURE_OPENAI_ENDPOINT` as a fallback when `BUILT_IN_FORGE_API_URL` is not set:

```ts
export const ENV = {
  // ...
  forgeApiUrl: process.env.AZURE_OPENAI_ENDPOINT ?? process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.AZURE_OPENAI_API_KEY ?? process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
```

If Azure OpenAI is offline, rate-limited, or returns non-compliant structured JSON, `server/riskNarrative.ts` automatically degrades to the **deterministic fact-cited fallback narrative** to prevent UI disruption or invalid risk claims.

---

## 4. Verification & Testing

To verify the TypeScript configuration and run test suite validation:

```bash
npx tsc --noEmit
npx vitest run
```
