/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'orders-and-refunds',
  description: 'Order lifecycle (pending → paid → fulfilled → refunded), partial-refund audit trail from migration 034, and the CSV export endpoint.',
  tags: ["checkout","commerce","orders","payments","stripe"],
  sources: [
    'apps/merchant/src/routes/orders.ts',
    'apps/merchant/src/types.ts',
    'apps/client/src/config/order-status.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'Order status machine: pending → paid → processing → shipped → delivered (or cancelled, refunded at any post-paid step).',
    'PATCH /v1/orders/:id/status requires admin:store permission. Body: { status: OrderStatus }.',
    'GET /v1/orders returns all orders (admin). GET /v1/me/orders returns only the authenticated customer\'s orders.',
    'GET /v1/orders/:id/invoice returns a signed order-view token URL for the PDF invoice. The URL is short-lived (1 h).',
    'POST /v1/orders/:id/refund initiates a Stripe refund for the given order. Must be in paid, processing, or shipped status. Body: { amount? } (partial refund supported).',
    'GET /v1/orders?export=csv&from=ISO&to=ISO returns a CSV export of orders in the date range (admin only).',
    'Order items are stored in order_items table. Each item captures: product_id, variant_id, quantity, unit_price, tax_rate, tax_amount, currency at time of purchase (immutable).',
    'Cancellation: PATCH /v1/orders/:id/cancel — sets status to cancelled and restores inventory for each line item.',
  ],
  buildPrompt: (src) => appendFacts(`
Below are orders.ts, types.ts, and the client-side order-status config.

${src}

Task: Write an "Orders & Refunds Reference".
Include:
1. Order status machine diagram (text/ASCII) with valid transitions.
2. Endpoint table: method, path, auth, description.
3. How to update order status (admin endpoint + required permission).
4. Refund flow: endpoint, partial refund, what happens in Stripe and DB.
5. Order cancellation: endpoint, inventory restore side effect.
6. CSV export: endpoint + query params.
7. Order item immutability: why prices are captured at purchase time.
`, topic.manualFacts),
};

export default topic;
