/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'ai-tokens-integration',
  description: 'Selling AI token packages via Fufuni and enforcing balance in ai-proxy-cloudflare: variant type, balance ledger, proxy auth, credit-on-purchase webhook, and frontend account widget.',
  tags: ['ai-tokens', 'ai-proxy', 'balance', 'webhook'],
  sources: [
    'apps/merchant/src/routes/ai-tokens.ts',
    'apps/merchant/src/routes/webhooks.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'AI token packages are variants with variant_type = "ai_tokens" and an ai_token_units integer (number of units per purchase). They are virtual products: requires_shipping = 0 and no inventory row is created.',
    'After a successful Stripe checkout, the webhooks.ts handler calls creditAiTokens(db, customerId, orderId, units) for each ai_tokens variant in the order. This runs non-blocking via c.executionCtx.waitUntil.',
    'creditAiTokens() upserts an ai_token_balances row and inserts a credit transaction in ai_token_transactions. If the customer has not yet linked an API key, the credit is stored with api_key = "" and applied retroactively when they call POST /v1/me/ai-tokens/link.',
    'Customers link their ai-proxy API key via POST /v1/me/ai-tokens/link { api_key }. This upserts the balance row and applies any pending (api_key = "") credits.',
    'GET /v1/me/ai-tokens/balance (customerAuth) returns the current balance and a masked API key (first 8 chars + asterisks).',
    'The proxy-facing endpoints /v1/ai-tokens/proxy/balance/:apiKey and /v1/ai-tokens/proxy/deduct are authenticated with a shared secret (AI_BALANCE_SHARED_SECRET env var) using timing-safe string comparison.',
    'ai-proxy-cloudflare: before forwarding a request, calls checkBalance(apiKey, env). If balance <= 0 returns HTTP 402. After a successful response, calls deductBalance(apiKey, 1, env) non-blocking via waitUntil.',
    'When FUFUNI_MERCHANT_URL is empty/unset in ai-proxy-cloudflare, balance enforcement is completely skipped (standalone mode, backward-compatible).',
    'FUFUNI_MERCHANT_URL is a plaintext wrangler var (empty string = disabled). AI_BALANCE_SHARED_SECRET is a Wrangler secret.',
    'Customers can also set their API key via PATCH /v1/me/profile { ai_proxy_api_key } — stored in customers.metadata JSON. Set null to unlink.',
  ],
  buildPrompt: (src) => appendFacts(`
The following source files implement the AI token selling and enforcement feature:

${src}

Write an "AI Token Integration Guide" covering:
1. How to create an AI token product in the catalog (variant_type, ai_token_units).
2. How token credits flow after purchase (webhook → creditAiTokens → balance ledger).
3. Pending credits: what happens when a customer buys tokens before linking an API key.
4. How to configure ai-proxy-cloudflare to enforce balance (env vars, balance.ts helpers).
5. Customer account flow: linking an API key, viewing balance, unlinking.
6. Security considerations: shared secret auth, timing-safe comparison.
`, topic.manualFacts),
};

export default topic;
