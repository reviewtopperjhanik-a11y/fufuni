/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'discounts-and-pricing',
  description: 'Discount codes, pricing tiers, lib/pricing.ts, promotions endpoints',
  sources: [
    'apps/merchant/src/routes/discounts.ts',
    'apps/merchant/src/lib/pricing.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'Discount types: percentage (0-100%), fixed_amount (currency-specific), free_shipping.',
    'POST /v1/discounts (admin) creates a discount code. Fields: code, type, value, currency?, minOrderAmount?, maxUses?, validFrom?, validUntil?, productIds? (restrict to product list).',
    'POST /v1/discounts/validate (public) validates a code + cart. Returns { discount, applicableAmount, newTotal } or 422 if invalid/expired/exhausted.',
    'Each use of a code increments discounts.current_uses atomically inside the DO transaction. If current_uses >= max_uses the code is rejected.',
    'Pricing calculation order: (1) base price from variant, (2) tier pricing if applicable, (3) discount applied to subtotal, (4) tax computed on discounted subtotal.',
    'lib/pricing.ts computes: getVariantPrice(variant, currency), applyDiscount(price, discount), computeTax(price, taxRate).',
    'Currency codes are ISO 4217. All monetary values are stored as integers (smallest unit, e.g. cents). Display formatting is done client-side with Intl.NumberFormat.',
  ],
  buildPrompt: (src) => appendFacts(`
Below are discounts.ts and pricing.ts.

${src}

Task: Write a "Discounts & Pricing Reference".
Include:
1. Discount types supported and their fields.
2. Admin endpoint: create a discount (request body, required fields).
3. Public validation endpoint: request/response, error conditions.
4. Atomic use counting and how exhausted codes are rejected.
5. Pricing pipeline: the 4-step order (base → tier → discount → tax).
6. lib/pricing.ts helper functions: signatures and examples.
7. Currency handling: integer cents storage, client-side formatting.
`, topic.manualFacts),
};

export default topic;
