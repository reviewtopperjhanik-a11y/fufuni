/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'email-templates',
  description: 'Transactional email delivery via Mailgun — Handlebars templates (order confirmation, password reset, refund), sending helpers, and trigger points.',
  tags: ["commerce","email","mailgun","orders"],
  sources: [
    'apps/merchant/src/lib/email-templates.ts',
    'apps/merchant/src/lib/order-email.ts',
    'apps/merchant/src/routes/mails.ts',
    'apps/merchant/src/routes/order-email-settings.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'Transport: Mailgun REST API. Required Wrangler secrets: MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_BASE_URL (default https://api.mailgun.net), MAILGUN_USER (sender address).',
    'If MAILGUN_API_KEY is not set, email sending is silently skipped (no error). This is intentional for local dev.',
    'Email templates are plain TypeScript string templates (no external templating library). They live in lib/email-templates.ts and return { subject, html, text }.',
    'Triggered emails: order.created → customer confirmation + admin notification; order.shipped → shipping notification with tracking URL; order.refunded → refund confirmation.',
    'Order email settings (POST /v1/order-email-settings, admin) let merchants configure: sender name, reply-to, BCC, and whether each event triggers an email.',
    'GET /v1/mails/preview/:type (admin) renders a template with mock data and returns HTML — use this to preview templates without sending.',
    'POST /v1/mails/test (admin) sends a real test email to the admin email address. Body: { type: "order_confirmation" | "shipping" | "refund" }.',
    'To add a new template: (1) add a new function in email-templates.ts returning { subject, html, text }; (2) add the trigger call in the relevant route (e.g. orders.ts); (3) optionally add a toggle in order_email_settings table.',
  ],
  buildPrompt: (src) => appendFacts(`
Below are email-templates.ts, order-email.ts, mails.ts, and order-email-settings.ts.

${src}

Task: Write a "Transactional Email Reference".
Include:
1. Mailgun setup: required secrets and where they go.
2. Triggered emails: what event triggers each email and what it contains.
3. email-templates.ts: how templates are structured (plain TS, no library), return type.
4. How to add a new template end-to-end (4 steps).
5. Admin endpoints: preview template, send test email, configure email settings.
6. Local development: why emails are silently skipped when API key is absent.
`, topic.manualFacts),
};

export default topic;
