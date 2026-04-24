/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'cloudflare-ai-gateway',
  description: "Call this when configuring or troubleshooting the Cloudflare AI Gateway for unified AI access.",
  tags: ["ai","cloudflare","backend","frontend","mcp"],
  sources: [
    'ai.json',
    'apps/merchant/src/routes/ai.ts',
    'apps/merchant/src/lib/ai-enc.ts',
    'apps/mcp/src/lib/ai-enc.ts',
    'apps/mcp/src/knowledge/generate.ts',
    'apps/mcp/scripts/gen-knowledge.ts',
    'apps/mcp/src/tools.ts',
    'apps/client/src/utils/ai-client.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'AI credentials are stored in ai.json (plaintext, never committed) and ai.json.enc (AES-256-CBC + PBKDF2, committed). The CRYPTOKEN Wrangler secret is the decryption password. decryptAiConfig() in lib/ai-enc.ts uses only the Web Crypto API (works in Node.js ≥ 18 and Cloudflare Workers).',
    'ai.json structure: { version, providers: { "<key>": { protocol, endpoint, gatewayEndpoint?, gatewayModelPrefix?, keys[], models[] } } }. Each model has: id, contextWindow, maxOutputTokens, tpmLimit, priority, tags?, usage ("chat"|"embedding"), defaultDimensions?.',
    'usage field on models: "chat" (default, /chat/completions) or "embedding" (/embeddings or native path). selectModels() accepts opts.usage to filter. NOT filtering by usage caused a bug where an embedding model (priority 1) was selected as a chat model.',
    'Cloudflare AI Gateway compat endpoint: https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/compat — accepts all providers in OpenAI format. Model IDs must be prefixed: "groq/llama-3.3-70b-versatile", "anthropic/claude-haiku-4-5", "google-ai-studio/gemini-3-flash-preview".',
    'resolveProviderEndpoint(provider, aigToken) returns { endpoint, useGateway }. When CLOUDFLARE_AIG_TOKEN is set and provider.gatewayEndpoint exists, returns the gateway URL and useGateway=true. Otherwise falls back to provider.endpoint.',
    'resolveModelId(modelId, provider, useGateway) prefixes the model ID with provider.gatewayModelPrefix when useGateway=true and the ID does not already contain "/". Example: "llama-3.3-70b-versatile" → "groq/llama-3.3-70b-versatile".',
    'Gateway authentication header: "cf-aig-authorization: Bearer <CLOUDFLARE_AIG_TOKEN>". This header is injected alongside the provider API key in every request when a gateway token is available.',
    'GET /v1/ai/parameters returns { providerName, apiKey, model, url, cloudflareAigToken?, cloudflareAigUrl? }. cloudflareAigToken and cloudflareAigUrl are included only when the Worker env var CLOUDFLARE_AIG_TOKEN is set. Requires ai:api permission.',
    'Frontend AiParams interface: { apiKey, model, url, provider?, cloudflareAigToken?, cloudflareAigUrl? }. The backend /v1/ai/parameters response is cast directly as AiParams — field names must match exactly.',
    'When cloudflareAigToken + cloudflareAigUrl are both set in AiParams, translateWithAi() and analyzeReviewWithAi() route through the gateway compat URL using OpenAI format regardless of provider. The model is auto-prefixed (e.g. "groq/llama-3.3-70b-versatile").',
    'DISABLE_CLOUDFLARE_AIG build-time flag: setting DISABLE_CLOUDFLARE_AIG=true in .env (exposed via vite.config.ts define block as import.meta.env.DISABLE_CLOUDFLARE_AIG) forces the frontend to skip gateway routing and call the provider directly. Use this as a temporary workaround until Cloudflare fixes the CORS preflight issue.',
    'CORS issue (browser → Cloudflare AI Gateway): Cloudflare AI Gateway with "Authenticated Gateway" enabled returns 401 on the CORS preflight OPTIONS request, because the browser cannot send custom headers (cf-aig-authorization) in OPTIONS. This makes direct browser-to-gateway calls impossible — no JS library can work around this browser security restriction. The interim workaround is DISABLE_CLOUDFLARE_AIG=true.',
    'Gemini embedding model: id="gemini-embedding-2-preview", usage="embedding", defaultDimensions=256. Uses a native Gemini embedContent path (not the compat endpoint): https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/google-ai-studio/v1beta/models/{model}:embedContent. generateEmbeddingViaGateway() in embeddings.ts handles this path.',
    'MCP gen-knowledge.ts and tools.ts pass gatewayBaseUrl (derived from resolveProviderEndpoint) and aigToken to generateEmbedding(). EmbeddingResult.connection is "gateway" or "direct" to track which path was used.',
    'selectEmbeddingModels(config, providerKey?) filters with opts.usage="embedding". Used in gen-knowledge.ts and tools.ts (retrieve_knowledge) to select the Gemini embedding model for vector search.',
  ],
  buildPrompt: (src) => appendFacts(`
Below are ai.json, the AI route, ai-enc.ts (shared between Merchant Worker and MCP), generate.ts, gen-knowledge.ts, tools.ts, and ai-client.ts.

${src}

Task: Write a "Cloudflare AI Gateway — Unified Access" reference.
Include:
1. Overview: why a gateway (observability, logging, caching, rate limiting) and the two supported paths (compat for all providers, native for Gemini embeddings).
2. ai.json schema: providers, gatewayEndpoint, gatewayModelPrefix, model usage field, defaultDimensions. Show a minimal provider block example.
3. Encryption: how ai.json.enc is created (openssl command), decryptAiConfig() mechanics, CRYPTOKEN secret.
4. Gateway authentication: cf-aig-authorization header, how resolveProviderEndpoint() decides between gateway and direct.
5. Model ID prefixing: resolveModelId() logic, examples for groq/anthropic/google-ai-studio.
6. Backend (Merchant Worker): GET /v1/ai/parameters — what it returns with and without CLOUDFLARE_AIG_TOKEN, required permission, how cloudflareAigUrl is derived (provider.gatewayEndpoint).
7. MCP knowledge generation: how generate.ts and gen-knowledge.ts use the gateway for chat and embeddings, passing aigToken down the call stack.
8. MCP tools.ts retrieve_knowledge: how gateway embedding is used for semantic search, EmbeddingResult.connection.
9. Frontend ai-client.ts: AiParams gateway fields, gateway routing logic in translateWithAi() and analyzeReviewWithAi(), model auto-prefixing, DISABLE_CLOUDFLARE_AIG flag.
10. CORS limitation: why direct browser-to-gateway calls fail (401 on OPTIONS preflight), no JS workaround, DISABLE_CLOUDFLARE_AIG as interim solution, expected fix from Cloudflare.
11. Gemini embedding native path: generateEmbeddingViaGateway(), dimensions=256, when it is used vs the compat path.
12. Known pitfalls: usage field must be set on all models to avoid embedding models being selected as chat models; field names in AiParams must match /v1/ai/parameters response exactly.
`, topic.manualFacts),
};

export default topic;
