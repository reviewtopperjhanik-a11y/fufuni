/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'order-view-tokens',
  description: 'Signed order-view tokens — how they are generated, how the public invoice route validates them, and when to use them instead of JWT auth.',
  tags: ["commerce","documents","invoicing","orders"],
  sources: [
    'apps/merchant/src/lib/order-token.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'Order-view tokens allow unauthenticated access to a single order\'s invoice. They are short-lived (1 h) signed JWTs.',
    'lib/order-token.ts exports: createOrderToken(orderId, secret) → string, verifyOrderToken(token, secret) → { orderId } | null.',
    'The secret used to sign order tokens is ORDER_TOKEN_SECRET Wrangler secret.',
    'GET /v1/orders/:id/invoice (authenticated, admin or order owner) returns { viewUrl } — the URL with the embedded token.',
    'GET /v1/orders/view/:token (public, no auth required) verifies the token, fetches the order, and returns the full order + items for invoice rendering.',
    'The public order-view page (/order-view?token=...) is the frontend consumer. It decodes the URL param, calls GET /v1/orders/view/:token, and renders the PDF invoice.',
    'Tokens are single-use conceptually (the frontend generates the PDF immediately and discards the token). No token revocation is implemented — they just expire after 1 h.',
    'Do not extend token TTL beyond 1 h. The token grants read access to order details including customer address and payment method last4.',
  ],
  buildPrompt: (src) => appendFacts(`
Below is lib/order-token.ts.

${src}

Task: Write an "Order View Tokens Reference".
Include:
1. Purpose: unauthenticated order invoice access.
2. createOrderToken() and verifyOrderToken() signatures.
3. The two endpoints: GET /v1/orders/:id/invoice (authenticated) and GET /v1/orders/view/:token (public).
4. Frontend flow: how the token is passed in the URL and consumed.
5. Security considerations: TTL, what data the token grants access to, why not to extend TTL.
6. Required Wrangler secret: ORDER_TOKEN_SECRET.
`, topic.manualFacts),
};

export default topic;
