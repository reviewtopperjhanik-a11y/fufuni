/**
 * MIT License
 *
 * Copyright (c) 2026 Ronan Le Meillat - SCTG Development
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// apps/merchant/src/routes/ai.ts
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { authMiddleware, databaseAdminOnly, aiAccessOnly } from '../middleware/auth';
import { ApiError, type HonoEnv } from '../types';
import { decryptAiConfig, selectModels, type AiConfig } from '../lib/ai-enc';

// Module-level cache: decrypted once per Worker isolate lifetime (seconds–minutes).
// Never written to KV or disk — lives only in memory.
let _configCache: AiConfig | null = null;

async function loadConfig(env: HonoEnv['Bindings']): Promise<AiConfig | null> {
  if (_configCache) return _configCache;
  const enc = await env.KV_CACHE.get('ai:config');
  if (!enc || !env.CRYPTOKEN) return null;
  try {
    _configCache = await decryptAiConfig(enc, env.CRYPTOKEN);
    return _configCache;
  } catch {
    return null; // fall back to env vars
  }
}

const adminApp = new OpenAPIHono<HonoEnv>();
adminApp.use('*', authMiddleware);

// Query parameters
const AiParamsQuery = z.object({
  provider: z.string().optional().describe('Optional provider key filter (e.g., "groq", "anthropic")'),
  capability: z.enum(['chat', 'embedding']).default('chat')
    .describe('AI capability to resolve. Defaults to "chat" and filters providers by model usage.'),
});

// Response schema
const AiParamsResponse = z.object({
  providerName: z.string().describe('Human-friendly provider name (e.g., "Groq", "Anthropic")'),
  apiKey: z.string(),
  model: z.string(),
  url: z.string(),
  cloudflareAigToken: z.string().optional().describe('Present if the worker is configured to use Cloudflare AI Gateway (via CLOUDFLARE_AIG_TOKEN)'),
  cloudflareAigUrl: z.string().optional().describe('Present if the worker is configured to use Cloudflare AI Gateway (via CLOUDFLARE_AIG_TOKEN)'),
});

const AiUploadBody = z.object({
  content: z.string().describe('Raw ai.json.enc file contents'),
});

const AiUploadResponse = z.object({
  ok: z.boolean(),
  key: z.literal('ai:config'),
});

const aiParamsRoute = createRoute({
  method: 'get',
  path: '/parameters',
  tags: ['AI'],
  summary: 'Retrieve AI configuration for the client',
  description:
    'Returns the API key, model and base URL for the AI provider. ' +
    'Requires ai:api permission. ' +
    'Selects a non-expired key randomly from the highest-priority model. ' +
    'Defaults to capability=chat and optionally filters by provider using the ?provider=<key> query parameter.',
  security: [{ bearerAuth: ['ai:api'] }],
  middleware: [aiAccessOnly] as const,
  request: { query: AiParamsQuery },
  responses: {
    200: {
      content: { 'application/json': { schema: AiParamsResponse } },
      description: 'AI parameters',
    },
    503: {
      description: 'AI not configured on this instance or no non-expired keys available',
    },
  },
});

adminApp.openapi(aiParamsRoute, async (c) => {
  const query = c.req.valid('query');
  const providerFilter = query.provider;
  const capability = query.capability;

  // 1. Try encrypted config from KV first (ai:config key)
  const config = await loadConfig(c.env);
  if (config) {
    // selectModels() returns candidates sorted by priority ascending (1 = best).
    // Filter by provider key and requested capability.
    const candidates = selectModels(config, {
      ...(providerFilter ? { providerKey: providerFilter } : {}),
      usage: capability,
    });
    // Iterate through candidates (in priority order) and find the first provider with non-expired keys.
    for (const { providerKey, provider, model } of candidates) {
      const validKeys = provider.keys.filter(k => k.type !== 'expired');
      if (validKeys.length === 0) continue; // Skip if all keys are expired.

      // Random selection from valid (non-expired) keys for load-balancing.
      const keyObj = validKeys[Math.floor(Math.random() * validKeys.length)];
      return c.json({
        providerName: providerKey,
        apiKey: keyObj.key,
        model: model.id,
        url: provider.endpoint,
        cloudflareAigToken: c.env.CLOUDFLARE_AIG_TOKEN || null,
        cloudflareAigUrl: provider.gatewayEndpoint || null,
      }, 200);
    }

    // All candidates have expired keys only.
    if (candidates.length === 0) {
      throw new ApiError(
        'not_configured',
        503,
        providerFilter
          ? `Provider "${providerFilter}" has no models configured for capability "${capability}".`
          : `No AI providers are configured for capability "${capability}".`
      );
    }

    if (providerFilter) {
      throw new ApiError(
        'no_valid_keys',
        503,
        `Provider "${providerFilter}" has no non-expired API keys configured for capability "${capability}".`
      );
    } else {
      throw new ApiError(
        'no_valid_keys',
        503,
        `All configured AI providers for capability "${capability}" have only expired API keys. Update ai.json.enc and re-deploy.`
      );
    }
  }

  // 2. Fallback: legacy env vars (backward-compatible with pre-encrypted deployments)
  const rawApiKey = c.env.AI_API_KEY;
  const model = c.env.AI_MODEL;
  const url = c.env.AI_API_URL;

  if (!rawApiKey || !model || !url) {
    throw new ApiError(
      'not_configured',
      503,
      'AI is not configured. Either: (1) upload ai.json.enc to KV_CACHE under key "ai:config", ' +
      'or (2) set env vars AI_API_KEY, AI_MODEL, AI_API_URL.'
    );
  }

  if (capability !== 'chat') {
    throw new ApiError(
      'not_configured',
      503,
      `Legacy AI env vars only support capability "chat". Upload ai.json.enc to configure capability "${capability}".`
    );
  }

  const apiKeys = rawApiKey.split(',').map(k => k.trim()).filter(Boolean);
  if (apiKeys.length === 0) {
    throw new ApiError('not_configured', 503, 'AI_API_KEY must contain at least one key.');
  }

  // Random selection from the key pool (uniform load-balancing)
  return c.json({
    apiKey: apiKeys[Math.floor(Math.random() * apiKeys.length)],
    model,
    url,
  }, 200);
});

const aiUploadRoute = createRoute({
  method: 'post',
  path: '/config',
  tags: ['AI'],
  summary: 'Upload encrypted AI configuration to Cloudflare KV',
  description:
    'Stores the raw ai.json.enc payload under the KV key "ai:config" so the worker can decrypt it at runtime.',
  security: [{ bearerAuth: ['admin:database'] }],
  middleware: [databaseAdminOnly] as const,
  request: {
    body: {
      content: {
        'application/json': { schema: AiUploadBody },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: AiUploadResponse } },
      description: 'Uploaded AI configuration',
    },
    400: {
      description: 'Invalid request body',
    },
  },
});

adminApp.openapi(aiUploadRoute, async (c) => {
  const body = c.req.valid('json');

  if (!body.content || body.content.trim().length === 0) {
    throw new ApiError('invalid_body', 400, 'Request body must contain the raw ai.json.enc content.');
  }

  await c.env.KV_CACHE.put('ai:config', body.content);
  _configCache = null;

  return c.json({ ok: true, key: 'ai:config' }, 200);
});

export { adminApp as adminAi };