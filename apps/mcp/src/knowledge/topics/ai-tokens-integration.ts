/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'ai-tokens-integration',
  description: 'Selling AI token packages via Fufuni: variant setup, auto-generated fufkey_ API keys, balance ledger, proxy auth, outbound webhooks, and frontend account widget.',
  tags: ['ai', 'payments', 'webhooks', 'backend', 'integration'],
  sources: [
    'apps/merchant/src/routes/ai-tokens.ts',
    'apps/merchant/src/routes/webhooks.ts',
    'apps/merchant/src/routes/checkout.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    // ── Product setup ─────────────────────────────────────────────────────────
    'AI token packages are catalog variants with variant_type = "ai_tokens" and ai_token_units (integer, units per purchase). They are virtual: requires_shipping = 0, no warehouse_inventory or inventory row is created or checked.',
    'At checkout, inventory checks and reservations are skipped for variant_type != "physical". Carts containing only digital/ai_tokens variants skip shipping steps entirely — getAvailableShippingRates() returns { items:[], cart_total_weight_g:0 } immediately, and the frontend proceeds directly to Stripe.',

    // ── Post-purchase credit flow ──────────────────────────────────────────────
    'After Stripe checkout.session.completed, webhooks.ts queries order_items JOIN variants WHERE variant_type = "ai_tokens" and calls creditAiTokens(db, customerId, orderId, ai_token_units * qty, c.var.db, c.executionCtx) for each AI token line item, non-blocking via c.executionCtx.waitUntil.',
    'creditAiTokens signature: (db, customerId, orderId, units, stub?: DOStub, ctx?: ExecutionContext). stub and ctx are required for webhook dispatch; they must be passed from the Hono context.',

    // ── API key auto-generation ────────────────────────────────────────────────
    'On every call to creditAiTokens, if customers.metadata.ai_proxy_api_key is absent or empty, a new key is auto-generated via generateFufKey(): format "fufkey_" + 40 random alphanumeric chars (crypto.getRandomValues, 62-char alphabet). The key is persisted to customers.metadata JSON before crediting.',
    'Auto-generation means there are NO pending credits (api_key = "") in the normal flow any more — customers always get a key on first purchase. The pending-credit path (api_key = "" row credited on POST /v1/me/ai-tokens/link) remains as a fallback for pre-existing records only.',
    'ai_token_balances row is upserted: if a row for customer_id exists, api_key and balance_units are updated; otherwise a new row is inserted. balance_units can go negative — the proxy decides whether to block below-zero requests.',

    // ── Outbound webhooks ─────────────────────────────────────────────────────
    'After crediting, dispatchWebhooks() is called (via ctx.waitUntil) with event type "ai_tokens.key_created" (when keyIsNew === true) or "ai_tokens.credited" (existing key). Payload: { customer_id, order_id, api_key, credited_units, balance_units }.',
    'Subscribe the ai-proxy-cloudflare instance to ai_tokens.key_created and ai_tokens.credited (or the wildcard ai_tokens.*) to auto-register new keys without manual intervention.',

    // ── DB tables ─────────────────────────────────────────────────────────────
    'ai_token_balances columns: customer_id (PK), api_key, balance_units (integer), updated_at.',
    'ai_token_transactions columns: id, api_key, customer_id, order_id (nullable), amount (positive=credit, negative=debit), type ("credit"|"debit"), note (nullable), created_at.',

    // ── Customer endpoints ────────────────────────────────────────────────────
    'GET /v1/me/ai-tokens/balance (customerAuth JWT): looks up customer by auth_provider_id, returns the full (unmasked) ai_token_balances row — the authenticated owner needs the raw key to call the proxy. Returns 404 if no balance record exists.',
    'POST /v1/me/ai-tokens/link { api_key } (customerAuth JWT): links an externally-provided key to the account. Persists in customers.metadata.ai_proxy_api_key. Returns 409 if the key is already claimed by another customer. Applies any pending credits (api_key = "") and updates their api_key in both ai_token_balances and ai_token_transactions.',
    'PATCH /v1/me/profile { ai_proxy_api_key } also writes to customers.metadata; pass null to unlink the key.',

    // ── Proxy-facing endpoints ────────────────────────────────────────────────
    'GET /v1/ai-tokens/proxy/balance/:apiKey: authenticated by AI_BALANCE_SHARED_SECRET bearer token. Returns { api_key, balance_units } — 0 for unknown keys (not 404). The proxy should block if balance_units <= 0.',
    'POST /v1/ai-tokens/proxy/deduct { api_key, units: integer ≥ 1, note?: string }: inserts a debit transaction (amount = -units) and decrements balance_units. Returns { ok, balance_units } after the deduction. Allows going negative.',
    'Proxy auth: validateProxyAuth() performs timing-safe string comparison (timingSafeEqual). Returns 503 if AI_BALANCE_SHARED_SECRET env var is not set, 401 on mismatch.',

    // ── Admin endpoint ────────────────────────────────────────────────────────
    'GET /v1/admin/ai-tokens?limit&offset (adminOnly): paginated list of all ai_token_balances. api_key is masked (first 8 chars + "…") even for admins.',

    // ── ai-proxy-cloudflare integration ───────────────────────────────────────
    'ai-proxy-cloudflare: set FUFUNI_MERCHANT_URL (wrangler var, plaintext) to the merchant API base URL. If empty/unset, balance enforcement is fully skipped (standalone / backward-compatible mode).',
    'AI_BALANCE_SHARED_SECRET must match between merchant wrangler.toml secret and ai-proxy-cloudflare wrangler.toml secret.',
    'Typical ai-proxy flow: checkBalance(apiKey, env) → if balance <= 0 return HTTP 402; forward request; on success call deductBalance(apiKey, tokensUsed, env) non-blocking via waitUntil.',
  ],
  buildPrompt: (src) => appendFacts(`
The following source files implement the AI token selling and enforcement feature:

${src}

Write an "AI Token Integration Guide" covering:
1. Product setup: how to create an ai_tokens variant (fields, no inventory, no shipping).
2. Checkout behaviour: inventory and shipping bypass for digital/ai_tokens carts.
3. Post-purchase flow: how creditAiTokens() is called from the Stripe webhook handler.
4. API key auto-generation: fufkey_ format, where it is stored, when it fires.
5. Outbound webhooks: ai_tokens.key_created vs ai_tokens.credited, payload shape, how the proxy uses them.
6. DB schema: ai_token_balances and ai_token_transactions table columns.
7. Customer endpoints: GET /balance (unmasked key), POST /link (conflict check, pending credits).
8. Proxy-facing endpoints: GET /balance/:apiKey, POST /deduct (units + note), auth scheme.
9. Admin endpoint: paginated list with masked keys.
10. ai-proxy-cloudflare wiring: env vars, checkBalance / deductBalance helpers, standalone mode.
11. Security: timing-safe comparison, never exposing keys in admin list.
`, topic.manualFacts),
};

export default topic;
