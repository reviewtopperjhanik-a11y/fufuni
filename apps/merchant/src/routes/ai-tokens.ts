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

/**
 * apps/merchant/src/routes/ai-tokens.ts
 *
 * Endpoints for the AI token credit system.
 *
 * There are three audiences:
 *
 *   1. Customer-facing (customerAuthMiddleware):
 *        GET  /v1/me/ai-tokens/balance  — view own balance and linked api_key
 *        POST /v1/me/ai-tokens/link     — link an ai-proxy API key and apply any
 *                                         pending credits stored without a key
 *
 *   2. Proxy-facing (AI_BALANCE_SHARED_SECRET bearer token):
 *        GET  /v1/ai-tokens/proxy/balance/:apiKey  — check remaining balance
 *        POST /v1/ai-tokens/proxy/deduct           — deduct units after a request
 *
 *   3. Admin-facing (adminOnly):
 *        GET  /v1/admin/ai-tokens  — paginated list of all balances
 *
 * The proxy endpoints are secured by a shared secret (AI_BALANCE_SHARED_SECRET)
 * independent of Auth0 so that ai-proxy-cloudflare can authenticate without a
 * user JWT.  If the env var is not set the proxy routes return 503.
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { getDb } from '../db';
import { customerAuthMiddleware } from '../middleware/customer-auth';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { ApiError, uuid, now, type HonoEnv, type DOStub } from '../types';
import { dispatchWebhooks } from '../lib/webhooks';

// ── Shared schemas ────────────────────────────────────────────────────────────

const ErrorResponse = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

const BalanceResponse = z.object({
  customer_id: z.string(),
  api_key: z.string().openapi({ description: 'Linked ai-proxy API key (masked after first 8 chars)' }),
  balance_units: z.number().int(),
  updated_at: z.string(),
}).openapi('AiTokenBalance');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Validates that the incoming Authorization header matches AI_BALANCE_SHARED_SECRET.
 * Returns 401 on mismatch, 503 when the secret is not configured.
 */
function validateProxyAuth(authHeader: string | undefined, secret: string | undefined): void {
  if (!secret) throw ApiError.serviceUnavailable('AI token balance service is not configured');
  if (!authHeader || !authHeader.startsWith('Bearer ')) throw ApiError.unauthorized('Missing Bearer token');
  const provided = authHeader.slice(7);
  // Constant-time comparison to prevent timing attacks.
  if (provided.length !== secret.length || !timingSafeEqual(provided, secret)) {
    throw ApiError.unauthorized('Invalid proxy secret');
  }
}

/**
 * Generates a unique AI proxy API key in the format `fufkey_<40 random alphanum chars>`.
 * Uses crypto.getRandomValues for uniform distribution.
 */
function generateFufKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const buf = new Uint8Array(40);
  crypto.getRandomValues(buf);
  return 'fufkey_' + Array.from(buf, (v) => chars[v % chars.length]).join('');
}

/** Timing-safe string comparison (avoids early-exit leaking secret length). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Masks an API key for safe display: shows first 8 characters + '…'.
 */
function maskApiKey(key: string): string {
  return key.length > 8 ? key.slice(0, 8) + '…' : key.slice(0, 4) + '…';
}

// ── Customer routes ───────────────────────────────────────────────────────────

export const customerAiTokensRouter = new OpenAPIHono<HonoEnv>();
customerAiTokensRouter.use('*', customerAuthMiddleware);

// GET /v1/me/ai-tokens/balance

const getMyBalance = createRoute({
  method: 'get',
  path: '/balance',
  tags: ['AI Tokens'],
  summary: 'Get my AI token balance',
  security: [{ bearerAuth: ['valid jwt'] }],
  responses: {
    200: { content: { 'application/json': { schema: BalanceResponse } }, description: 'Current balance' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'No balance record (no API key linked yet)' },
  },
});

customerAiTokensRouter.openapi(getMyBalance, async (c) => {
  const auth = c.get('auth') as any;
  const jwtSub = auth?.sub as string;
  if (!jwtSub) throw ApiError.unauthorized('Invalid token');

  const db = getDb(c.var.db);

  const [customer] = await db.query<any>(
    `SELECT id FROM customers WHERE auth_provider_id = ? AND auth_provider = 'auth0' LIMIT 1`,
    [jwtSub]
  );
  if (!customer) throw ApiError.notFound('Customer not found');

  const [balance] = await db.query<any>(
    `SELECT * FROM ai_token_balances WHERE customer_id = ?`,
    [customer.id]
  );
  if (!balance) throw ApiError.notFound('No AI token balance found. Purchase an AI credit pack first.');

  // Return the full key to the authenticated owner — they need it to call the proxy.
  return c.json(balance, 200);
});

// POST /v1/me/ai-tokens/link

const linkApiKey = createRoute({
  method: 'post',
  path: '/link',
  tags: ['AI Tokens'],
  summary: 'Link an AI proxy API key',
  description:
    'Associates an ai-proxy-cloudflare API key with this customer account. ' +
    'Any pending credits (ordered before linking) are automatically applied.',
  security: [{ bearerAuth: ['valid jwt'] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            api_key: z.string().min(1).openapi({
              example: 'AGE-SECRET-KEY-...',
              description: 'Your ai-proxy-cloudflare API key.',
            }),
          }),
        },
      },
    },
  },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ ok: z.boolean(), balance_units: z.number() }) } }, description: 'Key linked' },
    409: { content: { 'application/json': { schema: ErrorResponse } }, description: 'API key already claimed by another account' },
  },
});

customerAiTokensRouter.openapi(linkApiKey, async (c) => {
  const auth = c.get('auth') as any;
  const jwtSub = auth?.sub as string;
  if (!jwtSub) throw ApiError.unauthorized('Invalid token');

  const { api_key } = c.req.valid('json');
  const db = getDb(c.var.db);

  const [customer] = await db.query<any>(
    `SELECT id, metadata FROM customers WHERE auth_provider_id = ? AND auth_provider = 'auth0' LIMIT 1`,
    [jwtSub]
  );
  if (!customer) throw ApiError.notFound('Customer not found');

  // Reject if another customer already owns this API key.
  const [conflicting] = await db.query<any>(
    `SELECT customer_id FROM ai_token_balances WHERE api_key = ? AND customer_id != ?`,
    [api_key, customer.id]
  );
  if (conflicting) throw ApiError.conflict('This API key is already linked to another account');

  // Persist the api_key in customers.metadata for webhook-based crediting.
  let metadata: Record<string, unknown> = {};
  try { metadata = customer.metadata ? JSON.parse(customer.metadata) : {}; } catch { /* ignore */ }
  metadata.ai_proxy_api_key = api_key;
  await db.run(
    `UPDATE customers SET metadata = ?, updated_at = ? WHERE id = ?`,
    [JSON.stringify(metadata), now(), customer.id]
  );

  // Upsert the balance record.
  const [existing] = await db.query<any>(
    `SELECT balance_units FROM ai_token_balances WHERE customer_id = ?`,
    [customer.id]
  );

  let balanceUnits: number;
  if (existing) {
    await db.run(
      `UPDATE ai_token_balances SET api_key = ?, updated_at = ? WHERE customer_id = ?`,
      [api_key, now(), customer.id]
    );
    balanceUnits = existing.balance_units;
  } else {
    balanceUnits = 0;
    await db.run(
      `INSERT INTO ai_token_balances (customer_id, api_key, balance_units, updated_at)
       VALUES (?, ?, 0, ?)`,
      [customer.id, api_key, now()]
    );
  }

  // Apply any pending credit transactions that were recorded without an api_key
  // (i.e. purchased before the customer linked their key).
  const pendingCredits = await db.query<any>(
    `SELECT id, amount FROM ai_token_transactions
     WHERE customer_id = ? AND api_key = '' AND type = 'credit'`,
    [customer.id]
  );
  if (pendingCredits.length > 0) {
    const total = pendingCredits.reduce((sum: number, t: any) => sum + t.amount, 0);
    balanceUnits += total;
    await db.run(
      `UPDATE ai_token_balances SET balance_units = balance_units + ?, updated_at = ? WHERE customer_id = ?`,
      [total, now(), customer.id]
    );
    // Tag the pending transactions with the now-known api_key.
    await db.run(
      `UPDATE ai_token_transactions SET api_key = ? WHERE customer_id = ? AND api_key = ''`,
      [api_key, customer.id]
    );
  }

  return c.json({ ok: true, balance_units: balanceUnits }, 200);
});

// ── Proxy-facing routes ───────────────────────────────────────────────────────

export const proxyAiTokensRouter = new OpenAPIHono<HonoEnv>();

// GET /v1/ai-tokens/proxy/balance/:apiKey

const proxyGetBalance = createRoute({
  method: 'get',
  path: '/balance/:apiKey',
  tags: ['AI Tokens (Proxy)'],
  summary: 'Check token balance for an API key',
  description:
    'Used by ai-proxy-cloudflare to check whether a user has sufficient credit before forwarding a request. ' +
    'Secured by AI_BALANCE_SHARED_SECRET bearer token.',
  security: [{ bearerAuth: ['AI_BALANCE_SHARED_SECRET'] }],
  request: {
    params: z.object({
      apiKey: z.string().openapi({ param: { name: 'apiKey', in: 'path' }, description: 'ai-proxy API key' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            api_key: z.string(),
            balance_units: z.number().int(),
          }),
        },
      },
      description: 'Balance (0 = no credit)',
    },
    401: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Unauthorized' },
    503: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Service not configured' },
  },
});

proxyAiTokensRouter.openapi(proxyGetBalance, async (c) => {
  validateProxyAuth(c.req.header('Authorization'), c.env.AI_BALANCE_SHARED_SECRET);

  const { apiKey } = c.req.valid('param');
  const db = getDb(c.var.db);

  const [balance] = await db.query<any>(
    `SELECT api_key, balance_units FROM ai_token_balances WHERE api_key = ?`,
    [apiKey]
  );

  // Return 0 for unknown keys so the proxy can decide (block or allow with a grace amount).
  return c.json({
    api_key: apiKey,
    balance_units: balance?.balance_units ?? 0,
  }, 200);
});

// POST /v1/ai-tokens/proxy/deduct

const proxyDeduct = createRoute({
  method: 'post',
  path: '/deduct',
  tags: ['AI Tokens (Proxy)'],
  summary: 'Deduct token units after a completed request',
  description:
    'Called by ai-proxy-cloudflare after successfully forwarding an AI request. ' +
    'Writes a debit transaction and updates the balance. ' +
    'Secured by AI_BALANCE_SHARED_SECRET bearer token.',
  security: [{ bearerAuth: ['AI_BALANCE_SHARED_SECRET'] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            api_key: z.string().min(1),
            units: z.number().int().min(1).openapi({ description: 'Number of token units to deduct' }),
            note: z.string().optional().openapi({ description: 'Optional note, e.g. model name used' }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ ok: z.boolean(), balance_units: z.number().int() }),
        },
      },
      description: 'Deduction recorded',
    },
    401: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Unauthorized' },
    503: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Service not configured' },
  },
});

proxyAiTokensRouter.openapi(proxyDeduct, async (c) => {
  validateProxyAuth(c.req.header('Authorization'), c.env.AI_BALANCE_SHARED_SECRET);

  const { api_key, units, note } = c.req.valid('json');
  const db = getDb(c.var.db);

  const transactionId = uuid();
  await db.run(
    `INSERT INTO ai_token_transactions (id, api_key, amount, type, note, created_at)
     VALUES (?, ?, ?, 'debit', ?, ?)`,
    [transactionId, api_key, -units, note ?? null, now()]
  );

  // Decrement balance (allow going negative — the proxy decides whether to block).
  await db.run(
    `UPDATE ai_token_balances SET balance_units = balance_units - ?, updated_at = ? WHERE api_key = ?`,
    [units, now(), api_key]
  );

  const [balance] = await db.query<any>(
    `SELECT balance_units FROM ai_token_balances WHERE api_key = ?`,
    [api_key]
  );

  return c.json({ ok: true, balance_units: balance?.balance_units ?? 0 }, 200);
});

// ── Admin routes ──────────────────────────────────────────────────────────────

export const adminAiTokensRouter = new OpenAPIHono<HonoEnv>();
adminAiTokensRouter.use('*', authMiddleware);

const adminListBalances = createRoute({
  method: 'get',
  path: '/',
  tags: ['AI Tokens (Admin)'],
  summary: 'List all AI token balances',
  security: [{ bearerAuth: ['legacy sk_', 'admin:store'] }],
  middleware: [adminOnly] as const,
  request: {
    query: z.object({
      limit: z.string().optional().default('50'),
      offset: z.string().optional().default('0'),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(z.object({
              customer_id: z.string(),
              api_key: z.string(),
              balance_units: z.number(),
              updated_at: z.string(),
            })),
            total: z.number(),
          }),
        },
      },
      description: 'Paginated balance list',
    },
  },
});

adminAiTokensRouter.openapi(adminListBalances, async (c) => {
  const { limit, offset } = c.req.valid('query');
  const db = getDb(c.var.db);

  const [{ total }] = await db.query<any>(`SELECT COUNT(*) AS total FROM ai_token_balances`);
  const data = await db.query<any>(
    `SELECT customer_id, api_key, balance_units, updated_at FROM ai_token_balances
     ORDER BY balance_units DESC LIMIT ? OFFSET ?`,
    [Number(limit), Number(offset)]
  );

  // Mask api_key in admin list too for security hygiene.
  const masked = data.map((row: any) => ({ ...row, api_key: maskApiKey(row.api_key) }));

  return c.json({ data: masked, total }, 200);
});

// ── Shared helper: credit a customer after purchase ───────────────────────────

/**
 * Credits AI token units to the customer's balance after a successful payment.
 * Called from the Stripe webhook handler.
 *
 * If the customer has no linked API key, one is auto-generated (`fufkey_…`),
 * persisted on the customer record and on `ai_token_balances`, then credited
 * immediately.  An `ai_tokens.key_created` webhook is fired so the proxy can
 * register the new key without any manual step.
 *
 * If the customer already has a key the tokens are credited and an
 * `ai_tokens.credited` webhook is fired.
 *
 * @param db         - Database helper (from getDb)
 * @param customerId - Internal customer ID
 * @param orderId    - Order ID (for the audit trail)
 * @param units      - Number of token units to credit
 * @param stub       - DO stub (required for webhook dispatch — pass c.var.db)
 * @param ctx        - Worker execution context (required for webhook dispatch)
 */
export async function creditAiTokens(
  db: any,
  customerId: string,
  orderId: string,
  units: number,
  stub?: DOStub,
  ctx?: ExecutionContext
): Promise<void> {
  const [customer] = await db.query<any>(
    `SELECT metadata FROM customers WHERE id = ?`,
    [customerId]
  );

  let meta: Record<string, unknown> = {};
  try { meta = customer?.metadata ? JSON.parse(customer.metadata) : {}; } catch { /* ignore */ }

  let apiKey: string = (meta.ai_proxy_api_key as string) ?? '';
  let keyIsNew = false;

  // Auto-generate a fufkey if none exists yet.
  if (!apiKey) {
    apiKey = generateFufKey();
    keyIsNew = true;
    meta.ai_proxy_api_key = apiKey;
    await db.run(
      `UPDATE customers SET metadata = ?, updated_at = ? WHERE id = ?`,
      [JSON.stringify(meta), now(), customerId]
    );
  }

  const transactionId = uuid();
  const timestamp = now();

  await db.run(
    `INSERT INTO ai_token_transactions (id, api_key, customer_id, order_id, amount, type, note, created_at)
     VALUES (?, ?, ?, ?, ?, 'credit', ?, ?)`,
    [transactionId, apiKey, customerId, orderId, units, `Purchase — order ${orderId}`, timestamp]
  );

  // Upsert balance.
  const [existing] = await db.query<any>(
    `SELECT customer_id FROM ai_token_balances WHERE customer_id = ?`,
    [customerId]
  );
  let newBalance: number;
  if (existing) {
    await db.run(
      `UPDATE ai_token_balances SET api_key = ?, balance_units = balance_units + ?, updated_at = ? WHERE customer_id = ?`,
      [apiKey, units, timestamp, customerId]
    );
    const [updated] = await db.query<any>(
      `SELECT balance_units FROM ai_token_balances WHERE customer_id = ?`,
      [customerId]
    );
    newBalance = updated?.balance_units ?? units;
  } else {
    newBalance = units;
    await db.run(
      `INSERT INTO ai_token_balances (customer_id, api_key, balance_units, updated_at) VALUES (?, ?, ?, ?)`,
      [customerId, apiKey, units, timestamp]
    );
  }

  // Dispatch outbound webhook so the proxy can register / update the key.
  if (stub && ctx) {
    const eventType = keyIsNew ? 'ai_tokens.key_created' : 'ai_tokens.credited';
    ctx.waitUntil(
      dispatchWebhooks(stub, ctx, eventType, {
        customer_id: customerId,
        order_id: orderId,
        api_key: apiKey,
        credited_units: units,
        balance_units: newBalance,
      }).catch((err) => console.warn(`Failed to dispatch ${eventType} webhook`, err))
    );
  }
}
