/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'regions-taxes-shipping',
  description: 'Regions, tax rates, shipping zones, lib/tax.ts and lib/shipping.ts helpers',
  sources: [
    'apps/merchant/src/routes/regions.ts',
    'apps/merchant/src/routes/tax-rates.ts',
    'apps/merchant/src/lib/tax.ts',
    'apps/merchant/src/lib/shipping.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  maxSourceChars: 3000,
  manualFacts: [
    'Regions define geographic groupings for shipping + tax purposes. Each region has: id, name, country_codes[] (ISO 3166-1 alpha-2 array), currency (ISO 4217), is_default.',
    'Tax rates: POST /v1/tax-rates (admin). Fields: region_id, rate (decimal 0-1), label (e.g. "VAT"), is_inclusive (boolean — whether price already includes tax).',
    'Inclusive tax: when is_inclusive=true, computeTax extracts tax from gross price (price × rate / (1 + rate)). When false, it adds tax (price × rate).',
    'lib/tax.ts exports: computeTax(price, rate, inclusive), formatTaxAmount(amount, currency). Price is always in smallest currency unit (cents).',
    'Shipping zones: POST /v1/shipping-zones (admin). Each zone has: name, region_ids[], methods[]. A method has: carrier, service, price, estimated_days, free_threshold (if order subtotal >= threshold, shipping is free).',
    'lib/shipping.ts exports: getShippingMethods(regionId, subtotal) — returns eligible methods sorted by price. Returns [] if no zone covers the region.',
    'Checkout auto-selects the cheapest eligible shipping method if none is chosen by the customer.',
    'The region for a customer is determined by the billing address country code at checkout time.',
  ],
  buildPrompt: (src) => appendFacts(`
Below are the regions, tax-rates routes and the tax/shipping lib files.

${src}

Task: Write a "Regions, Taxes & Shipping Reference".
Include:
1. Regions: data model, CRUD endpoints, how country_codes[] maps to regions.
2. Tax rates: data model, creation endpoint, inclusive vs exclusive tax explanation.
3. lib/tax.ts: computeTax signature, inclusive vs exclusive formulae with examples.
4. Shipping zones: data model (zone → methods), creation endpoint.
5. lib/shipping.ts: getShippingMethods signature, free-shipping threshold logic.
6. Checkout integration: how region is resolved, how shipping method is auto-selected.
`, topic.manualFacts),
};

export default topic;
