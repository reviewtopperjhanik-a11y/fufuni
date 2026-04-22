/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'product-catalog-and-localization',
  description: 'Product catalogue — CRUD endpoints, variant management, category tree, and how product names and descriptions are localized per store locale.',
  tags: ["catalog","products"],
  sources: [
    'apps/merchant/src/routes/catalog.ts',
    'apps/merchant/src/schemas.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  maxSourceChars: 4000,
  manualFacts: [
    'Products have variants (product_variants table). Each variant has: sku, price (integer cents), currency, stock_quantity, attributes (JSON: { size, color, ... }).',
    'GET /v1/products supports: ?category=slug, ?search=term, ?locale=fr-FR, ?currency=EUR, ?page=1&limit=20, ?sort=price_asc|price_desc|name_asc|created_desc.',
    'GET /v1/products/:id/variants returns all variants for a product. POST /v1/products/:id/variants (admin) creates a new variant.',
    'Categories form a tree via parent_id. GET /v1/categories returns the full tree. GET /v1/categories/:slug/products returns products under a category (including sub-categories).',
    'Localized product names/descriptions: product_locales table (product_id, locale, name, description). If no translation exists for the requested locale, falls back to the base (en-US) value.',
    'Localized category names: category_locales table, same fallback pattern.',
    'POST /v1/products (admin) creates a product. Required: name (base en-US), category_id, base_currency. Optional: description, images[], tags[], variants[].',
    'Images are stored as an ordered JSON array in the product.images column: [{ url, alt, isPrimary }]. Thumbnail is the first image with isPrimary=true.',
    'Product tags: many-to-many via product_tags join table. GET /v1/products?tags=tag1,tag2 filters by tags (OR logic).',
  ],
  buildPrompt: (src) => appendFacts(`
Below are catalog.ts and schemas.ts (may be truncated).

${src}

Task: Write a "Product Catalog & Localization Reference".
Include:
1. Product model: all fields, variant model, image array structure.
2. Category tree: parent_id, slug, how to create nested categories.
3. CRUD endpoints table: method, path, auth, description.
4. Query parameters for GET /v1/products: full table with examples.
5. Localization: product_locales and category_locales tables, fallback logic, how to set translations.
6. Variant management: how to add, update, delete variants. Attributes JSON format.
7. Product tags: how they work, filter query syntax.
8. Image array: structure, isPrimary, how to reorder images.
`, topic.manualFacts),
};

export default topic;
