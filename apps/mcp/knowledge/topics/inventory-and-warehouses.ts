/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'inventory-and-warehouses',
  description: 'Stock management, warehouse locations, inventory adjustment endpoints',
  sources: [
    'apps/merchant/src/lib/inventory.ts',
    'apps/merchant/src/routes/inventory.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'Inventory is tracked per variant per warehouse: table inventory (variant_id, warehouse_id, quantity).',
    'All inventory mutations (reserve, release, deduct) are done inside DO transactions to avoid race conditions.',
    'lib/inventory.ts exposes: reserveStock(db, variantId, qty), releaseStock(db, variantId, qty), deductStock(db, variantId, qty), getStockLevel(db, variantId).',
    'reserveStock is called during checkout validation. releaseStock is called on order cancellation. deductStock is called after payment confirmation.',
    'POST /v1/inventory/adjust (admin) manually adjusts stock. Body: { variantId, warehouseId, delta } — delta can be negative.',
    'GET /v1/inventory (admin) lists all stock levels. GET /v1/inventory/:variantId returns stock for a single variant across all warehouses.',
    'Low-stock threshold: if stock drops below a configurable threshold after deductStock, the system optionally fires a low_stock webhook event.',
    'Warehouses: GET/POST/PATCH/DELETE /v1/warehouses (admin). Each warehouse has: id, name, address, is_default. Default warehouse is used for new products.',
  ],
  buildPrompt: (src) => appendFacts(`
Below are inventory.ts and the inventory routes.

${src}

Task: Write an "Inventory & Warehouses Reference".
Include:
1. Data model: inventory table schema, warehouse table schema.
2. Transaction safety: why mutations are inside DO transactions.
3. lib/inventory.ts: the 4 helper functions with signatures and when to call each.
4. Checkout lifecycle: reserve → deduct (after payment) or release (on cancel).
5. Admin endpoints: adjust stock, list stock, warehouse CRUD.
6. Low-stock webhook: trigger conditions, event payload.
7. Multi-warehouse: how stock is aggregated and how the default warehouse is used.
`, topic.manualFacts),
};

export default topic;
