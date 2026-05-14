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
 * apps/merchant/src/routes/downloads.ts
 *
 * Endpoints for delivering downloadable product files to paying customers.
 *
 * Flow:
 *   1. Customer calls GET /v1/orders/:orderId/downloads — the worker verifies
 *      ownership and returns a list of short-lived JWT download tokens.
 *   2. Customer (or browser) calls GET /v1/downloads/:token — the worker
 *      verifies the JWT, confirms the order is in a paid state, then either
 *      streams the file from R2 or redirects to the external URL.
 *
 * JWT claims:
 *   { type: 'download', oid: orderId, sku: sku }
 *   Signed with ORDER_TOKEN_SECRET (same key as order-view tokens, distinct
 *   'type' claim prevents cross-endpoint token reuse).
 *   Validity: 7 days.
 *
 * Routes:
 *   GET /v1/orders/:orderId/downloads   — customerAuth — list download tokens
 *   GET /v1/downloads/:token            — public       — serve / redirect file
 */

import { Hono } from 'hono';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { SignJWT, jwtVerify } from 'jose';
import { getDb } from '../db';
import { customerAuthMiddleware } from '../middleware/customer-auth';
import { ApiError, type HonoEnv } from '../types';

// Download token validity.
const DOWNLOAD_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/** Order statuses from which downloads are permitted. */
const DOWNLOADABLE_ORDER_STATUSES = new Set(['paid', 'processing', 'shipped', 'delivered']);

// ── JWT helpers ───────────────────────────────────────────────────────────────

async function getSigningKey(secret: string): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(secret);
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/**
 * Issues a signed JWT granting download access to a single SKU within an order.
 * The 'type' claim prevents the token being accepted by other JWT-protected endpoints.
 */
async function generateDownloadToken(orderId: string, sku: string, secret: string): Promise<string> {
  const key = await getSigningKey(secret);
  return new SignJWT({ type: 'download', oid: orderId, sku })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${DOWNLOAD_TOKEN_TTL_SECONDS}s`)
    .sign(key);
}

/**
 * Verifies a download JWT.  Returns the payload or throws if invalid / expired.
 * Rejects tokens whose 'type' claim is not exactly 'download'.
 */
async function verifyDownloadToken(
  token: string,
  secret: string,
): Promise<{ oid: string; sku: string }> {
  const key = await getSigningKey(secret);
  const { payload } = await jwtVerify(token, key);
  if (payload.type !== 'download') throw new Error('Invalid token type');
  return payload as { oid: string; sku: string };
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const ErrorResponse = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

const DownloadLinkResponse = z.object({
  sku: z.string(),
  filename: z.string(),
  content_type: z.string(),
  token: z.string().openapi({ description: 'Pass to GET /v1/downloads/:token to retrieve the file.' }),
}).openapi('DownloadLink');

// ── GET /v1/orders/:orderId/downloads ─────────────────────────────────────────

const customerApp = new OpenAPIHono<HonoEnv>();
customerApp.use('*', customerAuthMiddleware);

const listOrderDownloads = createRoute({
  method: 'get',
  path: '/:orderId/downloads',
  tags: ['Downloads'],
  summary: 'List download tokens for a paid order',
  description:
    'Returns a signed download token for each digital item in the order. ' +
    'Tokens are valid for 7 days and accepted by GET /v1/downloads/:token.',
  security: [{ bearerAuth: ['valid jwt'] }],
  request: {
    params: z.object({
      orderId: z.string().uuid().openapi({ param: { name: 'orderId', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(DownloadLinkResponse) } },
      description: 'List of download tokens',
    },
    403: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Order does not belong to this customer or is not paid' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Order not found' },
  },
});

customerApp.openapi(listOrderDownloads, async (c) => {
  const { orderId } = c.req.valid('param');
  const auth = c.get('auth') as any;
  const jwtSub = auth?.sub as string;
  if (!jwtSub) throw ApiError.unauthorized('Invalid token');

  const secret = c.env.ORDER_TOKEN_SECRET;
  if (!secret) throw ApiError.serverError('Download tokens are not configured on this instance');

  const db = getDb(c.var.db);

  // Resolve the customer to verify ownership.
  const [customer] = await db.query<any>(
    `SELECT id FROM customers WHERE auth_provider_id = ? AND auth_provider = 'auth0' LIMIT 1`,
    [jwtSub]
  );

  const [order] = await db.query<any>(
    `SELECT id, status, customer_id FROM orders WHERE id = ?`,
    [orderId]
  );
  if (!order) throw ApiError.notFound('Order not found');

  if (!customer || order.customer_id !== customer.id) {
    throw ApiError.forbidden('You do not have access to this order');
  }

  if (!DOWNLOADABLE_ORDER_STATUSES.has(order.status)) {
    throw ApiError.forbidden(`Downloads are only available for paid orders (current status: ${order.status})`);
  }

  // Fetch digital order items joined with their asset metadata.
  const items = await db.query<any>(
    `SELECT oi.sku, da.filename, da.content_type
     FROM order_items oi
     JOIN variants v   ON v.sku = oi.sku
     JOIN digital_assets da ON da.sku = oi.sku
     WHERE oi.order_id = ?
       AND v.variant_type = 'digital'`,
    [orderId]
  );

  const links = await Promise.all(
    items.map(async (item: any) => ({
      sku: item.sku,
      filename: item.filename,
      content_type: item.content_type,
      token: await generateDownloadToken(orderId, item.sku, secret),
    }))
  );

  return c.json(links, 200);
});

// ── GET /v1/downloads/:token — public file delivery ──────────────────────────

/**
 * Public (no auth) router — accepts a signed download token and serves the file.
 * Mounted separately at /v1/downloads in index.ts.
 */
export const publicDownloads = new Hono<HonoEnv>();

publicDownloads.get('/:token', async (c) => {
  const token = c.req.param('token');
  const secret = c.env.ORDER_TOKEN_SECRET;
  if (!secret) {
    return c.json({ error: { code: 'not_configured', message: 'Downloads are not configured' } }, 500);
  }

  let payload: { oid: string; sku: string };
  try {
    payload = await verifyDownloadToken(token, secret);
  } catch {
    return c.json({ error: { code: 'invalid_token', message: 'Download link is invalid or has expired' } }, 401);
  }

  const db = getDb(c.var.db);

  // Re-validate order status to prevent downloads after refund / cancellation.
  const [order] = await db.query<any>(`SELECT status FROM orders WHERE id = ?`, [payload.oid]);
  if (!order || !DOWNLOADABLE_ORDER_STATUSES.has(order.status)) {
    return c.json({ error: { code: 'order_not_downloadable', message: 'This order is no longer eligible for downloads' } }, 403);
  }

  // Ensure the SKU was indeed part of the order (guards against token forgery even after expiry edge cases).
  const [orderItem] = await db.query<any>(
    `SELECT sku FROM order_items WHERE order_id = ? AND sku = ?`,
    [payload.oid, payload.sku]
  );
  if (!orderItem) {
    return c.json({ error: { code: 'invalid_token', message: 'SKU not found in order' } }, 403);
  }

  const [asset] = await db.query<any>(`SELECT * FROM digital_assets WHERE sku = ?`, [payload.sku]);
  if (!asset) {
    return c.json({ error: { code: 'asset_not_found', message: 'Download file not found' } }, 404);
  }

  if (asset.storage_type === 'r2') {
    const bucket = (c.env as any).DIGITAL_ASSETS_BUCKET as R2Bucket | undefined;
    if (!bucket) {
      return c.json({ error: { code: 'not_configured', message: 'File storage is not configured' } }, 500);
    }
    const object = await bucket.get(asset.storage_value);
    if (!object) {
      return c.json({ error: { code: 'asset_not_found', message: 'File not found in storage' } }, 404);
    }
    return new Response(object.body, {
      headers: {
        'Content-Type': asset.content_type,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(asset.filename)}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  }

  // External URL: issue a redirect so bandwidth is not routed through the worker.
  return Response.redirect(asset.storage_value, 302);
});

export { customerApp as customerOrderDownloads };
