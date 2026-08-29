# Azure Migration Implementation Prompt

Use the following reusable prompt when initiating an Azure OpenAI migration or deployment smoke test for DisputeShield:

```markdown
Target Azure Endpoint: https://darshan-23csa19-0390-resource.openai.azure.com/openai/v1
Deployment Identifier: gpt-5-6-luna
API Version: 2024-08-01-preview

Requirements:
1. Ensure AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY environment variables are present on the server.
2. Verify strict structured JSON schema output for risk narrative summaries.
3. Confirm that deterministic fallback is active if endpoint connection fails or returns malformed response.
```
