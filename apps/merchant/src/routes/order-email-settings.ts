/**
 * MIT License
 *
 * Copyright (c) 2026 Ronan LE Meillat - SCTG Development
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
 * apps/merchant/src/routes/order-email-settings.ts
 *
 * Admin CRUD for transactional order status email templates.
 *
 * Each event has its own row in `order_email_settings`.
 * A "global" fallback row is used when no event-specific row is found
 * (or when its `enabled` flag is 0).
 *
 * Subject supports a JSON locale map: {"en-US":"...","fr-FR":"..."}
 * or a plain string (used for all locales).
 *
 * Template variables available in html_body / text_body / subject:
 *   {{storeName}} {{orderNumber}} {{orderUrl}} {{status}}
 *   {{total}} {{customerName}} {{trackingNumber}} {{trackingUrl}}
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { ApiError, uuid, now, type HonoEnv } from '../types';
import { getDb } from '../db';

const app = new OpenAPIHono<HonoEnv>();
app.use('*', authMiddleware);

// ── Shared schemata ───────────────────────────────────────────────────────────

export const ORDER_EMAIL_EVENTS = [
  'global',
  'pending',
  'paid',
  'payment_failed',
  'processing',
  'shipped',
  'delivered',
  'refunded',
  'canceled',
] as const;

export type OrderEmailEvent = (typeof ORDER_EMAIL_EVENTS)[number];

const EmailSettingSchema = z.object({
  id: z.string(),
  event: z.enum(ORDER_EMAIL_EVENTS),
  enabled: z.boolean(),
  subject: z.string(),
  html_body: z.string(),
  text_body: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const UpsertEmailSettingBody = z.object({
  enabled: z.boolean().optional(),
  subject: z.string().optional(),
  html_body: z.string().optional(),
  text_body: z.string().optional(),
});

// ── GET /v1/admin/order-email-settings — list all settings ───────────────────

const listSettingsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Order Email Settings'],
  summary: 'List all order email notification settings',
  security: [{ bearerAuth: ['admin:store'] }],
  middleware: [adminOnly] as const,
  responses: {
    200: {
      description: 'All email settings (one per event)',
      content: {
        'application/json': {
          schema: z.object({ items: z.array(EmailSettingSchema) }),
        },
      },
    },
  },
});

app.openapi(listSettingsRoute, async (c) => {
  const db = getDb(c.var.db);
  const rows = await db.query<any>(
    `SELECT * FROM order_email_settings ORDER BY
       CASE event
         WHEN 'global' THEN 0 WHEN 'payment_failed' THEN 1
         WHEN 'processing' THEN 2 WHEN 'shipped' THEN 3
         WHEN 'delivered' THEN 4 WHEN 'refunded' THEN 5 WHEN 'canceled' THEN 6
       END`,
  );
  const items = rows.map((r) => ({ ...r, enabled: Boolean(r.enabled) }));

  return c.json({ items }, 200);
});

// ── GET /v1/admin/order-email-settings/:event — get one ──────────────────────

const getSettingRoute = createRoute({
  method: 'get',
  path: '/:event',
  tags: ['Order Email Settings'],
  summary: 'Get e-mail setting for a specific order event',
  security: [{ bearerAuth: ['admin:store'] }],
  middleware: [adminOnly] as const,
  request: { params: z.object({ event: z.enum(ORDER_EMAIL_EVENTS) }) },
  responses: {
    200: { description: 'Email setting', content: { 'application/json': { schema: EmailSettingSchema } } },
    404: { description: 'Not found' },
  },
});

app.openapi(getSettingRoute, async (c) => {
  const { event } = c.req.valid('param');
  const db = getDb(c.var.db);
  const [row] = await db.query<any>(
    `SELECT * FROM order_email_settings WHERE event = ?`, [event],
  );

  if (!row) throw ApiError.notFound(`No setting for event "${event}"`);

  return c.json({ ...row, enabled: Boolean(row.enabled) }, 200);
});

// ── PUT /v1/admin/order-email-settings/:event — upsert ───────────────────────

const upsertSettingRoute = createRoute({
  method: 'put',
  path: '/:event',
  tags: ['Order Email Settings'],
  summary: 'Create or update email notification settings for an order event',
  security: [{ bearerAuth: ['admin:store'] }],
  middleware: [adminOnly] as const,
  request: {
    params: z.object({ event: z.enum(ORDER_EMAIL_EVENTS) }),
    body: { content: { 'application/json': { schema: UpsertEmailSettingBody } } },
  },
  responses: {
    200: { description: 'Upserted', content: { 'application/json': { schema: EmailSettingSchema } } },
  },
});

app.openapi(upsertSettingRoute, async (c) => {
  const { event } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = getDb(c.var.db);

  const [existing] = await db.query<any>(
    `SELECT * FROM order_email_settings WHERE event = ?`, [event],
  );

  if (existing) {
    const updates: string[] = ['updated_at = ?'];
    const params: unknown[] = [now()];

    if (body.enabled !== undefined) { updates.push('enabled = ?'); params.push(body.enabled ? 1 : 0); }
    if (body.subject !== undefined) { updates.push('subject = ?'); params.push(body.subject); }
    if (body.html_body !== undefined) { updates.push('html_body = ?'); params.push(body.html_body); }
    if (body.text_body !== undefined) { updates.push('text_body = ?'); params.push(body.text_body); }

    params.push(event);
    await db.run(`UPDATE order_email_settings SET ${updates.join(', ')} WHERE event = ?`, params);
  } else {
    const id = uuid();
    await db.run(
      `INSERT INTO order_email_settings (id, event, enabled, subject, html_body, text_body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        event,
        body.enabled ? 1 : 0,
        body.subject ?? '',
        body.html_body ?? '',
        body.text_body ?? '',
        now(),
        now(),
      ],
    );
  }

  const [row] = await db.query<any>(
    `SELECT * FROM order_email_settings WHERE event = ?`, [event],
  );

  return c.json({ ...row, enabled: Boolean(row.enabled) }, 200);
});

// ── DELETE /v1/admin/order-email-settings/:event — remove ────────────────────

const deleteSettingRoute = createRoute({
  method: 'delete',
  path: '/:event',
  tags: ['Order Email Settings'],
  summary: 'Delete email notification settings for an order event (reverts to global fallback)',
  security: [{ bearerAuth: ['admin:store'] }],
  middleware: [adminOnly] as const,
  request: { params: z.object({ event: z.enum(ORDER_EMAIL_EVENTS) }) },
  responses: {
    200: { description: 'Deleted', content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } } },
  },
});

app.openapi(deleteSettingRoute, async (c) => {
  const { event } = c.req.valid('param');
  const db = getDb(c.var.db);
  await db.run(`DELETE FROM order_email_settings WHERE event = ?`, [event]);

  return c.json({ ok: true }, 200);
});

export { app as orderEmailSettings };
