/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'webhooks-outbound',
  description: 'Outbound webhooks: registration, delivery, retry, HMAC signature',
  sources: [
    'apps/merchant/src/routes/webhooks-outbound.ts',
    'apps/merchant/src/lib/webhooks.ts',
    'apps/merchant/src/routes/webhooks.ts',
    'apps/client/src/pages/admin/webhooks.tsx',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'Outbound webhooks notify external systems on domain events: order.created, order.paid, order.shipped, order.cancelled, product.created, product.updated, product.deleted.',
    'POST /v1/webhooks/outbound (admin) registers a new endpoint. Fields: url, events[] (array of event names), secret (HMAC key).',
    'Delivery: the DO calls registered URLs asynchronously after each event. Failures trigger up to 3 retries with exponential back-off (1s, 4s, 16s).',
    'Each delivery computes HMAC-SHA256 of the JSON payload using the endpoint secret and sends it as X-Fufuni-Signature header. Consumers must verify this signature.',
    'Delivery attempts are logged in webhook_deliveries table: attempt_at, status_code, error, attempt_number.',
    'GET /v1/webhooks/outbound/:id/deliveries (admin) returns delivery history for an endpoint.',
    'Stripe webhook (POST /v1/webhooks/stripe) is INBOUND (not outbound) — it is handled in webhooks.ts not webhooks-outbound.ts.',
    'The admin webhooks page (apps/client/src/pages/admin/webhooks.tsx) lists endpoints, shows delivery history, and allows manual resend of the last failed delivery.',
  ],
  buildPrompt: (src) => appendFacts(`
Below are webhooks-outbound.ts route, lib/webhooks.ts, and the inbound webhooks.ts.

${src}

Task: Write a "Outbound Webhooks Reference".
Include:
1. Supported event names and their trigger points.
2. Endpoint registration: POST /v1/webhooks/outbound fields.
3. Delivery mechanics: async dispatch, retry schedule (attempt count + delays).
4. HMAC-SHA256 signature: how it is computed, which header carries it.
5. How a consumer should verify the signature (Node.js example).
6. Delivery log: how to query delivery history, what fields are returned.
7. Manual resend: endpoint and when to use it.
8. Difference between inbound (Stripe) and outbound webhooks.
`, topic.manualFacts),
};

export default topic;
