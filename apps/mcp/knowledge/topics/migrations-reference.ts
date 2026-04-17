/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'migrations-reference',
  description: 'Enumeration of every numbered SQL migration — applied order, schema changes introduced, and a mini changelog per migration file.',
  tags: ["commerce","database","durable-object","migrations","orders","schema"],
  sources: [
    'apps/merchant/src/do.ts',
    'apps/merchant/migrations/001-add-order-statuses.sql',
    'apps/merchant/migrations/002-add-webhooks.sql',
    'apps/merchant/migrations/003-add-customers.sql',
    'apps/merchant/migrations/004-add-carts-updated-at.sql',
    'apps/merchant/migrations/005-performance-indexes.sql',
    'apps/merchant/migrations/006-ucp-checkout.sql',
    'apps/merchant/migrations/007-add-regions.sql',
    'apps/merchant/migrations/008-add-countries.sql',
    'apps/merchant/migrations/009-add-warehouses.sql',
    'apps/merchant/migrations/010-add-shipping-rates.sql',
    'apps/merchant/migrations/011-add-regions-relationships.sql',
    'apps/merchant/migrations/012-add-warehouse-inventory.sql',
    'apps/merchant/migrations/013-add-variant-prices.sql',
    'apps/merchant/migrations/014-add-region-references-to-carts-orders.sql',
    'apps/merchant/migrations/015-add-cart-items-currency.sql',
    'apps/merchant/migrations/016-add-order-view-token.sql',
    'apps/merchant/migrations/017-add-cart-shipping-address.sql',
    'apps/merchant/migrations/018-add-shipping-classes.sql',
    'apps/merchant/migrations/019-variant-enrichment.sql',
    'apps/merchant/migrations/020-add-internal-taxes.sql',
    'apps/merchant/migrations/021-add-tax-inclusive-to-regions.sql',
    'apps/merchant/migrations/022-add-taxes-json-to-carts-orders.sql',
    'apps/merchant/migrations/023-add-tax-code-to-shipping-rates.sql',
    'apps/merchant/migrations/024-add-tax-inclusive-to-shipping-rates.sql',
    'apps/merchant/migrations/025-add-auth0sub-index.sql',
    'apps/merchant/migrations/026-saved_carts.sql',
    'apps/merchant/migrations/027-categories.sql',
    'apps/merchant/migrations/028_product_reviews.sql',
    'apps/merchant/migrations/029-variants-add-thumbnail-url.sql',
    'apps/merchant/migrations/030-add-store-themes.sql',
    'apps/merchant/migrations/031-categories-add-thumbnail-url.sql',
    'apps/merchant/migrations/032-order-email-settings.sql',
    'apps/merchant/migrations/033-order-email-settings-add-pending-paid.sql',
    'apps/merchant/migrations/034-enrich-refunds.sql',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'Migrations are applied at runtime by ensureInitialized() in do.ts — NOT by wrangler migrations. Always add new schema changes to both the migration file AND ensureInitialized().',
    'Migration files in apps/merchant/migrations/ are reference history only. The single source of truth for the live schema is the ensureInitialized() function in do.ts.',
    'New migration numbering: increment the leading zero-padded number (e.g. 029-add-feature.sql). Run the SQL in a new ensureInitialized() block wrapped in IF NOT EXISTS / ALTER TABLE IF NOT EXISTS.',
    'Standard column conventions: id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT DEFAULT (datetime(\'now\')), updated_at TEXT DEFAULT (datetime(\'now\')). Add UPDATE trigger for updated_at.',
  ],
  buildPrompt: (src) => appendFacts(`
Below are do.ts (with ensureInitialized) and all migration SQL files.

${src}

Task: Write a "Migrations Reference" — a complete table of every DB table with its migration number, migration filename, and columns.
Group tables by domain (catalog, orders, customers, auth, shipping, analytics, etc.).
For each table list all columns with type and nullable status.
`, topic.manualFacts),
};

export default topic;
