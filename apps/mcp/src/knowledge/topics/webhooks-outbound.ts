/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'webhooks-outbound',
  description: 'Outbound webhooks — event types (including ai_tokens.*), endpoint management, delivery retry logic, HMAC signature scheme, and consumer verification.',
  tags: ["events","webhooks","api","integration","ai"],
  sources: [
    'apps/merchant/src/routes/webhooks-outbound.ts',
    'apps/merchant/src/lib/webhooks.ts',
    'apps/merchant/src/routes/webhooks.ts',
    'apps/merchant/src/routes/ai-tokens.ts',
    'apps/client/src/pages/admin/webhooks.tsx',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'Concrete event types: order.created, order.updated, order.shipped, order.refunded, inventory.low, ai_tokens.key_created, ai_tokens.credited.',
    'Wildcard subscriptions: order.* (all order events), ai_tokens.* (all AI token events), * (all events). Wildcard matching is done in dispatchWebhooks() via e.endsWith(".*") prefix check.',
    'VALID_EVENTS in routes/webhooks-outbound.ts: order.created, order.updated, order.shipped, order.refunded, inventory.low, ai_tokens.key_created, ai_tokens.credited, order.*, ai_tokens.*, *. The Zod schema (schemas.ts WebhookEvent) must match this list.',
    'Routes mounted at /v1/webhooks (admin-only, bearerAuth). POST / creates; GET / lists; GET /:id gets detail + last 20 deliveries; PATCH /:id updates url/events/status; DELETE /:id deletes; POST /:id/rotate-secret rotates secret; GET /:id/deliveries/:deliveryId gets one delivery; POST /:id/deliveries/:deliveryId/retry retries.',
    'Secret format: "whsec_" + 64 hex chars (32 random bytes via generateWebhookSecret()). Returned only at creation and rotation — never exposed again.',
    'Payload envelope: { id: string (delivery UUID), type: WebhookEventType, created_at: ISO8601, data: Record<string, unknown> }.',
    'Delivery HTTP headers: Content-Type: application/json, X-Fufuni-Signature (HMAC-SHA256 hex of raw JSON body), X-Fufuni-Timestamp (Unix seconds integer), X-Fufuni-Delivery-Id (delivery UUID), User-Agent: Fufuni-Webhook/1.0.',
    'HMAC uses Web Crypto (crypto.subtle) — no Node.js dependency. Works in Cloudflare Workers. Signature is over the full JSON-serialised payload string.',
    'Retry: MAX_ATTEMPTS=3. Back-off delay between retries: Math.pow(2, attempt) * 1000ms → 2s then 4s. 4xx responses (except 429) fail permanently without retry. 5xx / network errors trigger retry.',
    'ai_tokens.key_created payload data: { customer_id, order_id, api_key (fufkey_[40 chars]), credited_units, balance_units }. Fired on first AI token purchase when a new fufkey_ key is auto-generated.',
    'ai_tokens.credited payload data: { customer_id, order_id, api_key, credited_units, balance_units }. Fired when tokens are credited to an existing key (repeat purchase).',
    'order.created data: { order: { id, number, status:"paid", customer_email, customer_id, shipping:{name,phone,address}, amounts:{subtotal_cents,tax_cents,shipping_cents,total_cents,currency}, items:[{sku,title,qty,unit_price_cents}], stripe:{checkout_session_id,payment_intent_id} } }.',
    'order.updated / order.shipped data: { order: formatOrder() result (includes tracking, discount, taxes fields), previous_status }. order.refunded data adds a refund:{stripe_refund_id,amount_cents} field.',
    'inventory.low data: { sku, available, threshold:5 }. LOW_INVENTORY_THRESHOLD is hardcoded to 5.',
    'Stripe webhook (POST /v1/webhooks/stripe) is INBOUND — handled in routes/webhooks.ts, not routes/webhooks-outbound.ts.',
    'Admin UI (/admin/webhooks): lists endpoints, shows delivery history with status icons, allows status toggle, secret rotation, deletion, manual retry. "Payload Examples" button (FileCode icon) opens a modal with realistic request samples for each event type, including HTTP headers and copyable JSON body.',
  ],
  buildPrompt: (src) => appendFacts(`
Below are webhooks-outbound.ts route, lib/webhooks.ts, ai-tokens.ts (creditAiTokens), and the admin webhooks page.

${src}

Task: Write an "Outbound Webhooks Reference".
Include:
1. Complete event type list (including ai_tokens.*) with trigger points and exact payload shapes.
2. Endpoint management: POST /v1/webhooks to create, PATCH to update, DELETE to delete, rotate-secret.
3. Delivery mechanics: async fan-out via dispatchWebhooks(), retry schedule (3 attempts, exponential back-off), permanent failure on 4xx.
4. Full set of HTTP headers sent with every delivery (Signature, Timestamp, Delivery-Id, User-Agent).
5. HMAC-SHA256 signature: Web Crypto computation, which header carries it, why Web Crypto is used.
6. Consumer signature verification — show both a Node.js (crypto.createHmac) and a Web Crypto example.
7. Delivery log: GET /:id returns recent_deliveries[]; GET /:id/deliveries/:deliveryId for full payload + response_body.
8. Manual retry: POST /:id/deliveries/:deliveryId/retry — resets attempts to 0, re-queues delivery.
9. Difference between inbound (Stripe, POST /v1/webhooks/stripe) and outbound webhooks.
`, topic.manualFacts),
};

export default topic;
