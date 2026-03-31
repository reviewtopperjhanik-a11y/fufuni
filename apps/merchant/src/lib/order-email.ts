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
 * apps/merchant/src/lib/order-email.ts
 *
 * Centralized helpers for generating order tracking links and sending order
 * confirmation emails.
 *
 * This module is designed to be used by both the Stripe webhook handler and
 * by admin endpoints (resend / regenerate link).
 */

import { Env } from '../types';
import { Database } from '../db';
import { buildOrderConfirmationEmail } from './email-templates';
import { generateOrderViewToken, hashOrderToken } from './order-token';
import { sendMailgunEmail } from '../mailgun';

// ── Template rendering ────────────────────────────────────────────────────────

/**
 * Available template variables injected into order status email bodies.
 */
export interface OrderEmailVars {
  storeName: string;
  orderNumber: string;
  orderUrl: string;
  status: string;
  total: string;
  customerName: string;
  trackingNumber: string;
  trackingUrl: string;
}

/**
 * Replace {{variable}} placeholders in a template string.
 */
function renderTemplate(template: string, vars: OrderEmailVars): string {
  return template
    .replace(/\{\{storeName\}\}/g, vars.storeName)
    .replace(/\{\{orderNumber\}\}/g, vars.orderNumber)
    .replace(/\{\{orderUrl\}\}/g, vars.orderUrl)
    .replace(/\{\{status\}\}/g, vars.status)
    .replace(/\{\{total\}\}/g, vars.total)
    .replace(/\{\{customerName\}\}/g, vars.customerName)
    .replace(/\{\{trackingNumber\}\}/g, vars.trackingNumber)
    .replace(/\{\{trackingUrl\}\}/g, vars.trackingUrl);
}

/**
 * Resolve the localised subject from a setting row.
 * The `subject` field can be either:
 * - A plain string (used for all locales)
 * - A JSON locale map, e.g. `{"en-US":"...","fr-FR":"..."}`
 */
function resolveSubject(subjectField: string, locale: string, vars: OrderEmailVars): string {
  const raw = subjectField.trim();
  if (raw.startsWith('{')) {
    try {
      const map = JSON.parse(raw) as Record<string, string>;
      const resolved = map[locale] ?? map['en-US'] ?? Object.values(map)[0] ?? '';
      return renderTemplate(resolved, vars);
    } catch {
      // fall through to plain string
    }
  }
  return renderTemplate(raw, vars);
}

/**
 * Build a minimal fallback HTML body for status emails when no custom
 * template has been configured.
 */
function buildDefaultStatusEmail(
  vars: OrderEmailVars,
  event: string,
): { subject: string; html: string; text: string } {
  const statusConfig: Record<string, { label: string; badge: string; badgeColor: string; badgeBg: string }> = {
    pending:    { label: 'Your order has been received',  badge: '🕐 Pending',       badgeColor: '#6b7280', badgeBg: '#f9fafb' },
    paid:       { label: 'Your payment has been confirmed', badge: '💳 Paid',        badgeColor: '#0369a1', badgeBg: '#e0f2fe' },
    processing: { label: 'Your order is being processed', badge: '⏳ Processing',    badgeColor: '#92400e', badgeBg: '#fefce8' },
    shipped:    { label: 'Your order has shipped',        badge: '🚚 Shipped',       badgeColor: '#1d4ed8', badgeBg: '#eff6ff' },
    delivered:  { label: 'Your order has been delivered', badge: '✅ Delivered',     badgeColor: '#16a34a', badgeBg: '#f0fdf4' },
    refunded:   { label: 'Your order has been refunded',  badge: '↩️ Refunded',      badgeColor: '#7c3aed', badgeBg: '#f5f3ff' },
    canceled:   { label: 'Your order has been canceled',  badge: '❌ Canceled',      badgeColor: '#b91c1c', badgeBg: '#fef2f2' },
    payment_failed: { label: 'Payment failed for your order', badge: '⚠️ Payment Failed', badgeColor: '#b91c1c', badgeBg: '#fef2f2' },
  };

  const cfg = statusConfig[event] ?? { label: `Order update: ${vars.status}`, badge: `📦 ${vars.status}`, badgeColor: '#555', badgeBg: '#f5f5f5' };
  const subject = `${cfg.label} — ${vars.storeName}`;

  const trackingSection = vars.trackingNumber
    ? (vars.trackingUrl
        ? `Tracking: ${vars.trackingNumber} — ${vars.trackingUrl}`
        : `Tracking number: ${vars.trackingNumber}`)
    : '';

  const text = [
    cfg.label,
    '',
    vars.customerName ? `Hello ${vars.customerName},` : '',
    '',
    `Order Number: ${vars.orderNumber}`,
    `Total: ${vars.total}`,
    trackingSection,
    vars.orderUrl ? `View your order: ${vars.orderUrl}` : '',
    '',
    `— The ${vars.storeName} Team`,
  ]
    .filter(Boolean)
    .join('\n');

  const trackingHtml = vars.trackingNumber
    ? vars.trackingUrl
      ? `<p style="color:#555;font-size:14px;margin:8px 0;">Tracking:
           <a href="${vars.trackingUrl}" style="color:#111;font-weight:600;">${vars.trackingNumber}</a></p>`
      : `<p style="color:#555;font-size:14px;margin:8px 0;">Tracking number: <strong>${vars.trackingNumber}</strong></p>`
    : '';

  const ctaHtml = vars.orderUrl
    ? `<a href="${vars.orderUrl}" style="display:block;text-align:center;background:#111;color:#fff !important;
         text-decoration:none;border-radius:8px;padding:14px 24px;font-size:15px;font-weight:600;margin:28px 0;">
         View My Order →</a>
       <p style="color:#999;font-size:12px;text-align:center;">
         If the button doesn't work, copy this link into your browser:<br/>
         <a href="${vars.orderUrl}" style="color:#555;word-break:break-all;">${vars.orderUrl}</a>
       </p>`
    : '';

  const greetingHtml = vars.customerName
    ? `<p style="color:#555;font-size:15px;">Hello <strong>${vars.customerName}</strong>,</p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${cfg.label}</title>
  <style>
    body { margin: 0; padding: 0; background: #f5f5f5; font-family: system-ui, sans-serif; }
    .wrapper { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 12px;
               padding: 40px 32px; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
    h1 { font-size: 22px; margin-top: 0; color: #111; }
    .badge { display: inline-block; border-radius: 999px; padding: 4px 14px;
             font-size: 13px; font-weight: 600;
             background: ${cfg.badgeBg}; color: ${cfg.badgeColor}; }
    .order-number { font-size: 15px; color: #555; margin-top: 8px; }
    .total { font-size: 18px; font-weight: 700; color: #111; margin: 16px 0 8px; }
    .footer { font-size: 12px; color: #999; text-align: center; margin-top: 32px; }
    .footer a { color: #999; }
  </style>
</head>
<body>
  <div class="wrapper">
    <span class="badge">${cfg.badge}</span>
    <h1>${cfg.label}</h1>
    ${greetingHtml}
    <p class="order-number">Order Number: <strong>${vars.orderNumber}</strong></p>
    <p class="total">Total: ${vars.total}</p>
    ${trackingHtml}
    ${ctaHtml}
    <div class="footer">
      — The ${vars.storeName} Team<br/>
      <small>This message was sent to you because you placed an order with us.</small>
    </div>
  </div>
</body>
</html>`;

  return { subject, html, text };
}

/**
 * Input options for {@link sendOrderConfirmationEmail}.
 */
export type SendOrderConfirmationOptions = {
  orderId: string;
  /**
   * When true, always generate a new token (invalidating any previous one).
   * When false, re-use the existing token if present.
   */
  regenerateToken?: boolean;
};

/**
 * Result returned by {@link sendOrderConfirmationEmail}.
 * Always resolves (never rejects) — check `success` to detect failures.
 */
export type SendOrderConfirmationResult = {
  orderId: string;
  customerEmail: string;
  orderUrl: string;
  tokenRotated: boolean;
  success: boolean;
  mailgunStatus?: number;
  errorMessage?: string;
};

const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * Builds a stable JWT token for an order.
 *
 * The token is a signed JWT with an expiration time that is derived
 * from `issuedAt`. This allows the token to be re-generated (for resend)
 * without changing its value, as long as the same `issuedAt` is used.
 */
async function buildOrderToken(orderId: string, secret: string, issuedAt: Date) {
  return generateOrderViewToken(orderId, secret, { issuedAt, ttlSeconds: TOKEN_TTL_SECONDS });
}

/**
 * Sends an order confirmation email to the customer.
 *
 * Generates (or re-uses) a signed order-view token, persists its hash to the
 * database, builds the email body via {@link buildOrderConfirmationEmail}, and
 * delivers it through Mailgun.
 *
 * Always resolves — delivery errors are captured in the returned
 * {@link SendOrderConfirmationResult} rather than thrown.
 *
 * @param env     - Worker environment bindings.
 * @param db      - Database instance.
 * @param options - Order ID and optional token-rotation flag.
 */
export async function sendOrderConfirmationEmail(
  env: Env,
  db: Database,
  options: SendOrderConfirmationOptions,
): Promise<SendOrderConfirmationResult> {
  const { orderId, regenerateToken = false } = options;

  const secret = env.ORDER_TOKEN_SECRET;
  if (!secret) {
    throw new Error('ORDER_TOKEN_SECRET not configured');
  }

  const STORE_URL = (env.STORE_URL || '').replace(/\/$/, '') || 'https://example.com';
  const STORE_NAME = env.STORE_NAME || 'Fufuni Store';

  const [order] = await db.query<any>(`SELECT * FROM orders WHERE id = ?`, [orderId]);
  if (!order) {
    throw new Error('Order not found');
  }

  const issuedAt = order.viewtoken_issued_at
    ? new Date(order.viewtoken_issued_at)
    : new Date();

  const shouldGenerateToken = regenerateToken || !order.viewtoken;
  const tokenIssuedAt = shouldGenerateToken ? new Date() : issuedAt;

  const token = await buildOrderToken(orderId, secret, tokenIssuedAt);
  const tokenHash = await hashOrderToken(token);
  const orderUrl = `${STORE_URL}/order/${orderId}?token=${encodeURIComponent(token)}`;

  const email = buildOrderConfirmationEmail({
    orderNumber: order.number,
    orderUrl,
    STORE_NAME,
    totalcents: order.total_cents,
    currency: order.currency,
  });

  const now = new Date().toISOString();

  const baseUpdateSql = `UPDATE orders SET viewtoken = ?, viewtoken_issued_at = ?, confirmationemailupdatedat = ?`;
  const baseParams: unknown[] = [tokenHash, tokenIssuedAt.toISOString(), now];

  const hasMailgun = Boolean(env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN);

  if (!hasMailgun) {
    // No mail service configured; record the token and exit successfully.
    await db.run(
      `${baseUpdateSql}, confirmationemailsentat = ?, confirmationemaillasterror = NULL WHERE id = ?`,
      [...baseParams, now, orderId],
    );

    return {
      orderId,
      customerEmail: order.customer_email,
      orderUrl,
      tokenRotated: shouldGenerateToken,
      success: true,
    };
  }

  try {
    const result = await sendMailgunEmail(env, {
      to: order.customer_email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });

    await db.run(
      `${baseUpdateSql}, confirmationemailsentat = ?, confirmationemaillasterror = NULL WHERE id = ?`,
      [...baseParams, now, orderId],
    );

    return {
      orderId,
      customerEmail: order.customer_email,
      orderUrl,
      tokenRotated: shouldGenerateToken,
      success: result.success,
      mailgunStatus: result.status,
    };
  } catch (err: any) {
    const errorMessage = err?.message ?? String(err);
    await db.run(
      `${baseUpdateSql}, confirmationemaillasterror = ? WHERE id = ?`,
      [...baseParams, errorMessage, orderId],
    );

    return {
      orderId,
      customerEmail: order.customer_email,
      orderUrl,
      tokenRotated: shouldGenerateToken,
      success: false,
      errorMessage,
    };
  }
}

// ── Status-change emails ──────────────────────────────────────────────────────

export type OrderEmailEvent =
  | 'payment_failed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'refunded'
  | 'canceled';

/**
 * Send a transactional email for an order lifecycle event.
 *
 * Looks up the per-event setting first; if not found/enabled, falls back to
 * the `global` setting. If neither is enabled, the call is a no-op.
 *
 * Never throws — failures are logged to console.warn.
 */
export async function sendOrderStatusEmail(
  env: Env,
  db: Database,
  orderId: string,
  event: OrderEmailEvent,
): Promise<void> {
  if (!env.MAILGUN_API_KEY || !env.MAILGUN_DOMAIN) return;

  // 1. Fetch order
  const rows = await db.query<any>(`SELECT * FROM orders WHERE id = ?`, [orderId]);
  const order = rows[0];
  if (!order || !order.customer_email) return;

  const locale: string = order.locale || 'en-US';
  const STORE_URL = (env.STORE_URL ?? '').replace(/\/$/, '');
  const STORE_NAME = env.STORE_NAME ?? 'Fufuni Store';

  // 2. Resolve active setting: per-event → global
  const [eventSetting] = await db.query<any>(
    `SELECT * FROM order_email_settings WHERE event = ? AND enabled = 1`,
    [event],
  );
  const [globalSetting] = await db.query<any>(
    `SELECT * FROM order_email_settings WHERE event = 'global' AND enabled = 1`,
  );
  const setting = eventSetting ?? globalSetting;
  if (!setting) return;

  // 3. Build template vars
  const total = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: (order.currency || 'USD').toUpperCase(),
  }).format((order.total_cents || 0) / 100);

  const orderUrl = order.viewtoken
    ? `${STORE_URL}/order/${encodeURIComponent(orderId)}?token=${encodeURIComponent(order.viewtoken)}`
    : `${STORE_URL}/order/${encodeURIComponent(orderId)}`;

  const vars: OrderEmailVars = {
    storeName: STORE_NAME,
    orderNumber: order.number ?? orderId.slice(0, 8),
    orderUrl,
    status: event,
    total,
    customerName: order.shipping_name ?? '',
    trackingNumber: order.tracking_number ?? '',
    trackingUrl: order.tracking_url ?? '',
  };

  // 4. Resolve content (custom template or built-in fallback)
  let subject: string, html: string, text: string;
  if (setting.html_body?.trim()) {
    subject = resolveSubject(setting.subject, locale, vars);
    html = renderTemplate(setting.html_body, vars);
    text = renderTemplate(setting.text_body ?? '', vars);
  } else {
    const defaults = buildDefaultStatusEmail(vars, event);
    subject = setting.subject?.trim()
      ? resolveSubject(setting.subject, locale, vars)
      : defaults.subject;
    html = defaults.html;
    text = defaults.text;
  }

  // 5. Send
  try {
    await sendMailgunEmail(env, { to: order.customer_email, subject, html, text });
  } catch (err) {
    console.warn(`[order-email] Failed to send "${event}" email for order ${orderId}:`, err);
  }
}
