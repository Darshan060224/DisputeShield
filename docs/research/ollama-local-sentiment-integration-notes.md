# Ollama Local Sentiment Integration Notes

## Scope

These notes support an optional **local-development** adapter for the user-selected `pilardi/sentiment-analysis:gemma3` model. The adapter is not proof that the sandbox or deployed DisputeShield runtime currently has Ollama installed.

## Official Source Findings

| Topic | Finding | Implementation consequence |
| --- | --- | --- |
| Generate API | Ollama's `/api/generate` accepts a model, prompt, `stream`, and structured output through `format`; its response contains generated response text. [1] | Send a server-only `POST` request to the local endpoint with `stream: false`; parse `response` separately. |
| Structured JSON | Ollama documents JSON or JSON-schema formats and recommends a low temperature for reliable structured output. [2] | Request `format: "json"`, `temperature: 0`, then enforce an additional Zod numeric schema server-side. |
| Selected model | The selected model page publishes `pilardi/sentiment-analysis:gemma3`, describes JSON responses with `sentiment` from -1 to 1 and `confidence` from 0 to 1, and shows a local `localhost:11434/api/generate` example. [3] | Validate the exact score/confidence bounds and map score only to a descriptive sentiment label. |
| Runtime availability | The selected model page lists an approximately 3.3 GB model artefact. The local sandbox inspection found no `ollama` executable or service at `127.0.0.1:11434` at the time of this implementation. [3] | Treat current local runtime as unavailable; return an explicit uncertain fallback with no inferred result. |
| Hosted limitation | Ollama's structured-output page notes that Ollama Cloud does not currently support structured outputs. [2] | Do not claim that the WebDev hosted deployment can run this local adapter without separately provisioning and validating a compatible runtime. |

## Safety Contract

The adapter is an explicit, user-triggered analysis of a stored local case statement. It may only return a bounded language triage hint and a source label. It cannot establish truth, intent, fraud, manipulation, eligibility, payment risk, refund outcome, or dispute outcome. It must not deny, block, penalize, refund, contest, submit, or send an external action.

## References

[1]: https://docs.ollama.com/api/generate "Ollama API — Generate a response"
[2]: https://docs.ollama.com/capabilities/structured-outputs "Ollama — Structured Outputs"
[3]: https://ollama.com/pilardi/sentiment-analysis "Ollama Model Library — pilardi/sentiment-analysis"
