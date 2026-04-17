/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'checkout-and-ucp',
  description: 'Checkout flow and the Universal Commerce Protocol (UCP) — Stripe Checkout integration, UCP sessions, browse/catalog endpoints consumed by AI shopping agents.',
  tags: ["ai-agents","api","checkout","integration","payments","stripe","ucp"],
  sources: [
    'apps/merchant/src/routes/checkout.ts',
    'apps/merchant/src/routes/ucp.ts',
    'apps/merchant/src/schemas.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'Checkout = POST /v1/checkout (Stripe only). It validates cart items against live inventory, computes tax, creates a Stripe PaymentIntent or Checkout Session, and returns { clientSecret, sessionId, orderId }. orderId is pre-created in pending status.',
    'UCP = Universal Cart Protocol: POST /v1/ucp. Provides a generic cart-validation and price-computation endpoint (no Stripe). Used by the frontend before showing the order summary page.',
    'POST /v1/ucp returns { items: [{...product, quantity, unitPrice, tax, subtotal}], currency, total, taxTotal }. Call it whenever the cart changes.',
    'Inventory is checked synchronously inside the DO transaction. If any item is out of stock the full endpoint fails with 409 Conflict.',
    'Stripe webhooks (POST /v1/webhooks/stripe) handle payment_intent.succeeded → update order to paid, payment_intent.payment_failed → update order to failed, checkout.session.completed for 3DS flow.',
    'Checkout requires Auth0 JWT (customerAuthMiddleware). The order is created under the authenticated customer\'s ID.',
    'stripe.ts is a thin wrapper around the Stripe REST API (no SDK) that works inside Cloudflare Workers.',
    'STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET must be in Wrangler secrets (not .env file).',
  ],
  buildPrompt: (src) => appendFacts(`
Below are the checkout.ts and ucp.ts route files and parts of schemas.ts.

${src}

Task: Write a "Checkout & UCP Reference".
Include:
1. UCP: endpoint, request body, response shape, when to call it.
2. Checkout: endpoint, required auth, full request/response, what happens on success.
3. Inventory validation: when it fires, what error it throws.
4. Tax computation inside checkout: how it uses the tax engine.
5. Stripe integration: PaymentIntent flow vs Checkout Session flow.
6. Stripe webhook events handled and their side effects.
7. Required Wrangler secrets for Stripe.
`, topic.manualFacts),
};

export default topic;
