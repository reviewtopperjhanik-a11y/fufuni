/**
 * MIT License
 *
 * Copyright (c) 2025 ygwyg
 * Copyright (c) 2026 Ronan Le Meillat - SCTG Development
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { z } from '@hono/zod-openapi';

// ============================================================
// COMMON SCHEMAS
// ============================================================

/** Path parameter schema for routes that accept a resource `id` (UUID). */
export const IdParam = z.object({
  id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }),
});

/** Query parameters for cursor-based paginated list endpoints. */
export const PaginationQuery = z.object({
  cursor: z.string().optional().openapi({ param: { name: 'cursor', in: 'query' } }),
  limit: z.string().optional().openapi({ param: { name: 'limit', in: 'query' }, example: '20' }),
});

/** Pagination metadata included in every list response body. */
export const PaginationResponse = z.object({
  next_cursor: z.string().nullable(),
});

/** Standard JSON error envelope returned on all 4xx / 5xx responses. */
export const ErrorResponse = z.object({
    code: z.string().openapi({ example: 'invalid_request' }),
    message: z.string().openapi({ example: 'Invalid request parameters' }),
    details: z.record(z.string(), z.unknown()).optional(),
}).openapi('Error');

// ============================================================
// VARIANT SCHEMAS
// ============================================================

/** Full variant record returned by the API (includes shipping and tax fields). */
export const VariantResponse = z.object({
  title: z.string().openapi({ example: 'Black / Medium' }),
  price_cents: z.number().int().openapi({ example: 2999 }),
  currency: z.string().default('USD').openapi({ example: 'USD', description: 'ISO 4217 currency code (base price currency)' }),
  image_url: z.string().nullable().openapi({ example: 'https://example.com/image.jpg' }),
  shipping_class_id: z.string().uuid().nullable().optional().openapi({ example: null, description: 'Shipping class this variant belongs to (overrides product class)' }),
  // Shipping fields
  weight_g: z.number().int().openapi({ example: 500, description: 'Weight in grams. Used for shipping rate filtering.' }),
  dims_cm: z.object({ l: z.number(), w: z.number(), h: z.number() }).nullable().openapi({ example: { l: 30, w: 20, h: 5 }, description: 'Package dimensions in centimetres (L×W×H)' }),
  requires_shipping: z.boolean().openapi({ example: true, description: 'Set to false for virtual/digital products — excluded from weight total' }),
  // Optional enrichment fields
  barcode: z.string().nullable().openapi({ example: '3760093570015', description: 'EAN-13, UPC-A or any GTIN barcode' }),
  compare_at_price_cents: z.number().int().nullable().openapi({ example: 4999, description: 'Original price shown crossed-out (must be > price_cents)' }),
  tax_code: z.string().nullable().openapi({ example: 'txcd_99999999', description: 'Stripe Tax product code — see https://stripe.com/docs/tax/tax-categories' }),
  tax_rate_percentage: z.number().int().default(0).openapi({ example: 20, description: 'Effective tax rate percentage for the variant' }),
  tax_display_name: z.string().nullable().openapi({ example: 'TVA', description: 'Localized tax name (from tax rate) for display' }),
  tax_inclusive: z.boolean().default(false).openapi({ example: false, description: 'If true price is tax-included (TTC); false means HT' }),
}).openapi('Variant');

/** Request body for creating a new variant. */
export const CreateVariantBody = z.object({
  sku: z.string().min(1).openapi({ example: 'TEE-BLK-M' }),
  title: z.string().min(1).openapi({ example: 'Black / Medium' }),
  price_cents: z.number().int().min(0).openapi({ example: 2999 }),
  currency: z.string().length(3).optional().openapi({ example: 'EUR', description: 'ISO 4217 currency code for base price' }),
  image_url: z.string().url().optional().openapi({ example: 'https://example.com/image.jpg' }),
  shipping_class_id: z.string().uuid().nullable().optional().openapi({ example: null }),
  // Shipping fields
  weight_g: z.number().int().min(0).default(0).openapi({ example: 500, description: 'Weight in grams. Used for shipping rate filtering.' }),
  dims_cm: z.object({ l: z.number().min(0), w: z.number().min(0), h: z.number().min(0) }).nullable().optional().openapi({ example: { l: 30, w: 20, h: 5 }, description: 'Package dimensions in centimetres (L×W×H)' }),
  requires_shipping: z.boolean().default(true).openapi({ description: 'Set to false for virtual/digital products — excluded from weight total' }),
  // Enrichment fields
  barcode: z.string().optional().openapi({ example: '3760093570015', description: 'EAN-13, UPC-A or any GTIN barcode' }),
  compare_at_price_cents: z.number().int().min(0).optional().openapi({ example: 4999, description: 'Original price shown crossed-out (must be > price_cents)' }),
  tax_code: z.string().optional().openapi({ example: 'txcd_99999999', description: 'Stripe Tax product code' }),
  thumbnail_url: z.string().url().nullable().optional().openapi({ description: 'Small WebP thumbnail (data URI for <1 MB, R2 URL for ≥1 MB)' }),
}).openapi('CreateVariant');

/** Request body for partially updating a variant (all fields optional). */
export const UpdateVariantBody = z.object({
  sku: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  price_cents: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional().openapi({ example: 'EUR', description: 'ISO 4217 currency code for base price' }),
  image_url: z.string().url().nullable().optional(),
  shipping_class_id: z.string().uuid().nullable().optional(),
  // Shipping fields — all optional for PATCH
  weight_g: z.number().int().min(0).optional(),
  dims_cm: z.object({ l: z.number().min(0), w: z.number().min(0), h: z.number().min(0) }).nullable().optional(),
  requires_shipping: z.boolean().optional(),
  // Enrichment fields — all optional for PATCH
  barcode: z.string().nullable().optional(),
  compare_at_price_cents: z.number().int().min(0).nullable().optional(),
  tax_code: z.string().nullable().optional(),
  thumbnail_url: z.string().url().nullable().optional(),
}).openapi('UpdateVariant');

/** Path parameters for variant-price routes: `productId / variantId / currencyId`. */
export const VariantPriceCurrencyParam = z.object({
  id: z.string().uuid().openapi({ 
    param: { name: 'id', in: 'path' },
    description: 'Product ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  }),
  variantId: z.string().uuid().openapi({ 
    param: { name: 'variantId', in: 'path' },
    description: 'Variant ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  }),
  currencyId: z.string().uuid().openapi({ 
    param: { name: 'currencyId', in: 'path' },
    description: 'Currency ID (UUID from currencies table)',
    example: '550e8400-e29b-41d4-a716-446655440002',
  }),
}).openapi('VariantPriceCurrencyParam');

/** A single multi-currency price record for a variant. */
export const VariantPrice = z.object({
  id: z.string().uuid(),
  variant_id: z.string().uuid(),
  currency_id: z.string().uuid(),
  currency_code: z.string().openapi({ example: 'EUR', description: 'ISO 4217 currency code' }),
  currency_name: z.string().openapi({ example: 'Euro' }),
  symbol: z.string().openapi({ example: '€' }),
  price_cents: z.number().int().openapi({ example: 2799, description: 'Price in cents/pence/centimes' }),
}).openapi('VariantPrice');

/** List response wrapping an array of {@link VariantPrice} records. */
export const VariantPriceListResponse = z.object({
  items: z.array(VariantPrice),
}).openapi('VariantPriceList');

/** Request body to add a new currency-specific price to a variant. */
export const CreateVariantPriceBody = z.object({
  currency_id: z.string().uuid().openapi({ description: 'Currency ID (UUID from currencies table)' }),
  price_cents: z.number().int().min(0).openapi({ example: 2799, description: 'Price in cents' }),
}).openapi('CreateVariantPrice');

/** Single multi-currency price record response (abbreviated). */
export const VariantPriceResponse = z.object({
  id: z.string().uuid(),
  currency_id: z.string().uuid(),
  price_cents: z.number().int(),
}).openapi('VariantPrice');

// ============================================================
// PRODUCT SCHEMAS
// ============================================================

/** Allowed lifecycle status values for a product. */
export const ProductStatus = z.enum(['active', 'draft']);

/** Full product record including variants, categories, and enrichment fields. */
export const ProductResponse = z.object({
  id: z.string().uuid(),
  title: z.string().openapi({ example: 'Classic T-Shirt' }),
  description: z.string().nullable().openapi({ example: 'A comfortable cotton tee' }),
  shipping_class_id: z.string().uuid().nullable().optional().openapi({ example: null, description: 'Default shipping class for all variants (overridden by variant-level class)' }),
  status: ProductStatus,
  created_at: z.string().datetime(),
  variants: z.array(VariantResponse),
  categories: z.array(z.lazy(() => CategoryResponse)).nullable().optional().openapi({ description: 'Categories this product belongs to' }),
  // Enrichment fields (stored as JSON strings for multilingual support)
  vendor: z.string().nullable().openapi({ example: '{"en-US":"Acme Corp","fr-FR":"Corp Acme"}', description: 'Brand or manufacturer name (JSON object with locale keys)' }),
  tags: z.string().nullable().openapi({ example: '{"en-US":"cotton, summer","fr-FR":"coton, été"}', description: 'Tags as comma-separated values per locale (JSON object with locale keys)' }),
  handle: z.string().nullable().openapi({ example: '{"en-US":"classic-cotton-t-shirt","fr-FR":"t-shirt-classique-coton"}', description: 'URL slug per locale (JSON object with locale keys)' }),
}).openapi('Product');

/** Paginated list response for GET /v1/products. */
export const ProductListResponse = z.object({
  items: z.array(ProductResponse),
  pagination: PaginationResponse,
}).openapi('ProductList');

/** Request body for POST /v1/products. */
export const CreateProductBody = z.object({
  title: z.string().min(1).openapi({ example: 'Classic T-Shirt' }),
  description: z.string().optional().openapi({ example: 'A comfortable cotton tee' }),
  shipping_class_id: z.string().uuid().nullable().optional().openapi({ example: null }),
  // Enrichment fields (stored as JSON strings for multilingual support, like title/description)
  vendor: z.string().optional().openapi({ example: '{"en-US":"Acme Corp","fr-FR":"Corp Acme"}', description: 'Brand or manufacturer name (JSON object with locale keys, or plain string for migration)' }),
  tags: z.string().optional().openapi({ example: '{"en-US":"cotton, summer","fr-FR":"coton, été"}', description: 'Tags as comma-separated values per locale (JSON object with locale keys, or plain string for migration)' }),
  handle: z.string().optional().openapi({ example: '{"en-US":"classic-cotton-t-shirt","fr-FR":"t-shirt-classique-coton"}', description: 'URL slug per locale (JSON object with locale keys, or plain string for migration). Must be lowercase letters, numbers and hyphens.' }),
}).openapi('CreateProduct');

/** Request body for PATCH /v1/products/:id. All product fields optional. */
export const UpdateProductBody = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  shipping_class_id: z.string().uuid().nullable().optional(),
  status: ProductStatus.optional(),
  // Enrichment fields (stored as JSON strings for multilingual support)
  vendor: z.string().nullable().optional().openapi({ example: '{"en-US":"Acme Corp","fr-FR":"Corp Acme"}', description: 'Brand or manufacturer name (JSON object with locale keys, or plain string for migration)' }),
  tags: z.string().nullable().optional().openapi({ example: '{"en-US":"cotton, summer","fr-FR":"coton, été"}', description: 'Tags as comma-separated values per locale (JSON object with locale keys, or plain string for migration)' }),
  handle: z.string().nullable().optional().openapi({ example: '{"en-US":"classic-cotton-t-shirt","fr-FR":"t-shirt-classique-coton"}', description: 'URL slug per locale (JSON object with locale keys, or plain string for migration). Must be lowercase letters, numbers and hyphens.' }),
}).openapi('UpdateProduct');

/** Query parameters for the product list endpoint. */
export const ProductQuery = PaginationQuery.extend({
  status: ProductStatus.optional().openapi({ param: { name: 'status', in: 'query' } }),
  noimage: z.enum(['true', 'false']).optional().openapi({ param: { name: 'noimage', in: 'query' }, description: 'Strip all image data from the response' }),
  thumbnail: z.enum(['true', 'false']).optional().openapi({ param: { name: 'thumbnail', in: 'query' }, description: 'Return thumbnail_url instead of full image_url' }),
});

/** Query parameters for the full-text search endpoint. */
export const SearchQuery = PaginationQuery.extend({
  q: z.string().min(1).openapi({ param: { name: 'q', in: 'query' }, example: 'shirt' }),
  noimage: z.enum(['true', 'false']).optional().openapi({ param: { name: 'noimage', in: 'query' }, description: 'Strip all image data from the response' }),
  thumbnail: z.enum(['true', 'false']).optional().openapi({ param: { name: 'thumbnail', in: 'query' }, description: 'Return thumbnail_url instead of full image_url' }),
});

// ============================================================
// INVENTORY SCHEMAS
// ============================================================

/** Global inventory record for a SKU (sum across all warehouses). */
export const InventoryItem = z.object({
  sku: z.string().openapi({ example: 'TEE-BLK-M' }),
  on_hand: z.number().int().openapi({ example: 100 }),
  reserved: z.number().int().openapi({ example: 5 }),
  available: z.number().int().openapi({ example: 95 }),
}).openapi('InventoryItem');

/** Per-warehouse stock breakdown row embedded in {@link InventoryItemWithDetails}. */
export const WarehouseInventoryDetail = z.object({
  warehouse_id: z.string().uuid().openapi({ example: 'warehouse-123' }),
  warehouse_name: z.string().openapi({ example: 'France Distribution Center' }),
  quantity: z.number().int().openapi({ example: 50 }),
}).openapi('WarehouseInventoryDetail');

/** Inventory item enriched with per-warehouse breakdown and product/variant titles. */
export const InventoryItemWithDetails = InventoryItem.extend({
  variant_title: z.string().nullable().openapi({ example: 'Black / Medium' }),
  product_title: z.string().nullable().openapi({ example: 'Classic T-Shirt' }),
  warehouses: z.array(WarehouseInventoryDetail).optional().openapi({
    example: [
      { warehouse_id: '123', warehouse_name: 'FR', quantity: 50 },
      { warehouse_id: '456', warehouse_name: 'IT', quantity: 50 },
    ],
  }),
}).openapi('InventoryItemWithDetails');

/** Paginated list response for GET /v1/inventory. */
export const InventoryListResponse = z.object({
  items: z.array(InventoryItemWithDetails),
  pagination: PaginationResponse,
}).openapi('InventoryList');

/** Single inventory record response (alias of {@link InventoryItemWithDetails}). */
export const InventorySingleResponse = InventoryItemWithDetails.openapi('InventorySingle');

/** Query parameters for the inventory list endpoint. */
export const InventoryQuery = PaginationQuery.extend({
  sku: z.string().optional().openapi({ param: { name: 'sku', in: 'query' }, example: 'TEE-BLK-M' }),
  low_stock: z.string().optional().openapi({ param: { name: 'low_stock', in: 'query' } }),
});

/** Allowed reason codes for global inventory adjustments. */
export const AdjustmentReason = z.enum(['restock', 'correction', 'damaged', 'return']);

/** Request body for POST /v1/inventory/:sku/adjust. */
export const AdjustInventoryBody = z.object({
  delta: z.number().int().openapi({ example: 50, description: 'Positive to add, negative to subtract' }),
  reason: AdjustmentReason.openapi({ example: 'restock' }),
}).openapi('AdjustInventory');

/** Path parameter schema for routes that accept a variant SKU. */
export const SkuParam = z.object({
  sku: z.string().openapi({ param: { name: 'sku', in: 'path' }, example: 'TEE-BLK-M' }),
});

// ============================================================
// CART / CHECKOUT SCHEMAS
// ============================================================

/** A single line item within a cart. */
export const CartItem = z.object({
  sku: z.string(),
  title: z.string(),
  qty: z.number().int().positive(),
  unit_price_cents: z.number().int(),
});

/** Aggregated monetary totals for a cart (all values in minor currency units). */
export const CartTotals = z.object({
  subtotal_cents: z.number().int(),
  discount_cents: z.number().int(),
  shipping_cents: z.number().int(),
  tax_cents: z.number().int(),
  total_cents: z.number().int(),
});

/** Applied discount info on a cart, or `null` when no discount is active. */
export const CartDiscount = z.object({
  code: z.string(),
  type: z.enum(['percentage', 'fixed_amount']),
  amount_cents: z.number().int(),
}).nullable();

/** Shipping address stored on a cart, or `null` when not yet provided. */
export const CartShippingAddress = z.object({
  name: z.string().nullable().optional(),
  line1: z.string().nullable().optional(),
  line2: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  billing_same_as_shipping: z.boolean().default(true),
}).nullable().optional();

/** Full cart response including items, totals, shipping, and checkout session. */
export const CartResponse = z.object({
  id: z.string().uuid(),
  status: z.enum(['open', 'checked_out', 'expired']),
  currency: z.string().openapi({ example: 'USD' }),
  region_id: z.string().uuid().nullable().optional().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
  customer_email: z.string().email(),
  locale: z.string().default('en-US').openapi({ example: 'en-US', description: 'User preferred language for localized strings' }),
  items: z.array(CartItem),
  discount: CartDiscount.optional(),
  shipping: z.object({
    rate_id: z.string().uuid().nullable(),
    rate_name: z.string().nullable(),
    amount_cents: z.number().int(),
  }).optional(),
  shipping_address: CartShippingAddress,
  totals: CartTotals.optional(),
  expires_at: z.string().datetime(),
  stripe_checkout_session_id: z.string().nullable().optional(),
}).openapi('Cart');

/** Request body for POST /v1/carts. */
export const CreateCartBody = z.object({
  customer_email: z.string().email().openapi({ example: 'customer@example.com' }),
  locale: z.string().optional().openapi({ example: 'fr-FR', description: 'User preferred language for localized strings' }),
  region_id: z.string().uuid().optional().openapi({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Optional region for this cart' }),
}).openapi('CreateCart');

/** Request body for POST /v1/carts/:id/items. */
export const AddCartItemsBody = z.object({
  items: z.array(z.object({
    sku: z.string().min(1).openapi({ example: 'TEE-BLK-M' }),
    qty: z.number().int().positive().openapi({ example: 2 }),
  })).min(1),
}).openapi('AddCartItems');

/** Request body to create a Stripe Checkout session for a cart. */
export const CheckoutBody = z.object({
  success_url: z.string().url().openapi({ example: 'https://example.com/success' }),
  cancel_url: z.string().url().openapi({ example: 'https://example.com/cancel' }),
  collect_shipping: z.boolean().optional().default(false),
  shipping_countries: z.array(z.string()).optional().default(['US']),
  shipping_options: z.array(z.any()).optional(),
}).openapi('Checkout');

/** Response after successfully initiating checkout. */
export const CheckoutResponse = z.object({
  checkout_url: z.string().url(),
  stripe_checkout_session_id: z.string(),
}).openapi('CheckoutResult');

/** Request body for POST /v1/carts/:id/discounts. */
export const ApplyDiscountBody = z.object({
  code: z.string().min(1).openapi({ example: 'SAVE10' }),
}).openapi('ApplyDiscount');

/** Response after applying a discount code — includes adjusted totals. */
export const ApplyDiscountResponse = z.object({
  discount: z.object({
    code: z.string(),
    type: z.enum(['percentage', 'fixed_amount']),
    amount_cents: z.number().int(),
  }),
  totals: CartTotals,
}).openapi('ApplyDiscountResult');

// ============================================================
// GAP-01 + GAP-02: SHIPPING ADDRESS & RATES
// ============================================================

/** Shipping address input schema used during cart shipping-rate selection. */
export const ShippingAddressInput = z.object({
  name: z.string().min(1).openapi({ example: 'Jean Dupont' }),
  line1: z.string().min(1).openapi({ example: '12 rue de la Paix' }),
  line2: z.string().nullable().optional().openapi({ example: 'Apt 5' }),
  city: z.string().min(1).openapi({ example: 'Paris' }),
  state: z.string().nullable().optional().openapi({ example: 'Île-de-France' }),
  postal_code: z.string().min(1).openapi({ example: '75001' }),
  country: z.string().length(2).openapi({ example: 'FR', description: 'ISO 3166-1 alpha-2 country code' }),
  billing_same_as_shipping: z.boolean().optional().default(true),
}).openapi('ShippingAddressInput');

/** A single shipping-rate option presented to the customer during checkout. */
export const AvailableShippingRateItem = z.object({
  id: z.string().uuid(),
  display_name: z.string().openapi({ example: 'Standard Shipping' }),
  description: z.string().nullable().optional(),
  amount_cents: z.number().int().openapi({ example: 1000 }),
  currency: z.string().openapi({ example: 'EUR' }),
  min_delivery_days: z.number().int().nullable().optional(),
  max_delivery_days: z.number().int().nullable().optional(),
  max_weight_g: z.number().int().nullable().optional(),
}).openapi('AvailableShippingRate');

/** Response for GET /v1/carts/:id/shipping-rates including cart weight. */
export const AvailableShippingRatesResponse = z.object({
  items: z.array(AvailableShippingRateItem),
  cart_total_weight_g: z.number().int(),
}).openapi('AvailableShippingRates');

/** Request body to select a shipping rate for a cart. */
export const SelectShippingRateBody = z.object({
  shipping_rate_id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
}).openapi('SelectShippingRate');

/** Path parameter schema for routes that accept a `cartId` (UUID). */
export const CartIdParam = z.object({
  cartId: z.string().uuid().openapi({ param: { name: 'cartId', in: 'path' } }),
});

// ============================================================
// ORDER SCHEMAS
// ============================================================

/** Allowed lifecycle status values for an order. */
export const OrderStatus = z.enum(['pending', 'paid', 'processing', 'shipped', 'delivered', 'refunded', 'canceled']);

/** A single line item snapshot within an order. */
export const OrderItem = z.object({
  sku: z.string(),
  title: z.string(),
  qty: z.number().int(),
  unit_price_cents: z.number().int(),
});

/** Postal shipping address stored on an order, or `null` if not collected. */
export const ShippingAddress = z.object({
  line1: z.string(),
  line2: z.string().nullable().optional(),
  city: z.string(),
  state: z.string().nullable().optional(),
  postal_code: z.string(),
  country: z.string(),
}).nullable();

/** Full order response including items, amounts, tracking, and Stripe references. */
export const OrderResponse = z.object({
  id: z.string().uuid(),
  number: z.string().openapi({ example: 'ORD-241231-A7K2' }),
  status: OrderStatus,
  customer_email: z.string().email(),
  customer_id: z.string().uuid().nullable(),
  shipping: z.object({
    name: z.string().nullable(),
    phone: z.string().nullable(),
    address: ShippingAddress,
  }),
  amounts: z.object({
    subtotal_cents: z.number().int(),
    discount_cents: z.number().int(),
    tax_cents: z.number().int(),
    taxes: z.array(z.object({
      name: z.string(),
      amount_cents: z.number().int(),
    })).optional(),
    shipping_cents: z.number().int(),
    total_cents: z.number().int(),
    currency: z.string(),
  }),
  discount: z.object({
    code: z.string(),
    amount_cents: z.number().int(),
  }).nullable(),
  tracking: z.object({
    number: z.string().nullable(),
    url: z.string().nullable(),
    shipped_at: z.string().nullable(),
  }),
  stripe: z.object({
    checkout_session_id: z.string().nullable(),
    payment_intent_id: z.string().nullable(),
  }),
  items: z.array(OrderItem),
  created_at: z.string().datetime(),
}).openapi('Order');

/** Paginated list response for GET /v1/orders. */
export const OrderListResponse = z.object({
  items: z.array(OrderResponse),
  pagination: PaginationResponse,
}).openapi('OrderList');

/** Query parameters for the orders list endpoint. */
export const OrderQuery = PaginationQuery.extend({
  status: OrderStatus.optional().openapi({ param: { name: 'status', in: 'query' } }),
  email: z.string().email().optional().openapi({ param: { name: 'email', in: 'query' } }),
});

/** Request body for PATCH /v1/orders/:id. */
export const UpdateOrderBody = z.object({
  status: OrderStatus.optional(),
  tracking_number: z.string().nullable().optional(),
  tracking_url: z.string().url().nullable().optional(),
}).openapi('UpdateOrder');

/** Request body for POST /v1/orders/:id/refund. Omit `amount_cents` for a full refund. */
export const RefundOrderBody = z.object({
  amount_cents: z.number().int().positive().optional().openapi({ description: 'Omit for full refund' }),
}).openapi('RefundOrder');

/** Response after successfully issuing a Stripe refund. */
export const RefundResponse = z.object({
  stripe_refund_id: z.string(),
  status: z.string(),
}).openapi('RefundResult');

/** Request body for creating a seeded/test order in dev environments. */
export const CreateTestOrderBody = z.object({
  customer_email: z.string().email().openapi({ example: 'test@example.com' }),
  items: z.array(z.object({
    sku: z.string(),
    qty: z.number().int().positive(),
  })).min(1),
  region_id: z.string().uuid().optional().openapi({ description: 'Optional region for this order. If not specified, uses default region.' }),
  discount_code: z.string().optional(),
  shipping_address: z.object({
    name: z.string(),
    phone: z.string().optional(),
    line1: z.string(),
    line2: z.string().optional(),
    city: z.string(),
    state: z.string().optional(),
    postal_code: z.string(),
    country: z.string(),
  }).optional(),
  shipping_rate_id: z.string().uuid().optional(),
  shipping_cents: z.number().int().min(0).optional(),
  stripe_checkout_session_id: z.string().optional(),
  stripe_payment_intent_id: z.string().optional(),
}).openapi('CreateTestOrder');

/** Path parameter schema for routes that accept an `orderId` (UUID). */
export const OrderIdParam = z.object({
  orderId: z.string().uuid().openapi({ param: { name: 'orderId', in: 'path' } }),
});

// ============================================================
// CUSTOMER SCHEMAS
// ============================================================

/** Customer profile record. */
export const CustomerResponse = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  has_account: z.boolean(),
  accepts_marketing: z.boolean(),
  stats: z.object({
    order_count: z.number().int(),
    total_spent_cents: z.number().int(),
    last_order_at: z.string().datetime().nullable(),
  }),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
}).openapi('Customer');

/** Customer profile enriched with their saved address book. */
export const CustomerWithAddresses = CustomerResponse.extend({
  addresses: z.array(z.object({
    id: z.string().uuid(),
    label: z.string().nullable(),
    is_default: z.boolean(),
    name: z.string().nullable(),
    company: z.string().nullable(),
    line1: z.string(),
    line2: z.string().nullable(),
    city: z.string(),
    state: z.string().nullable(),
    postal_code: z.string(),
    country: z.string(),
    phone: z.string().nullable(),
  })),
}).openapi('CustomerWithAddresses');

/** Paginated list response for GET /v1/customers. */
export const CustomerListResponse = z.object({
  items: z.array(CustomerResponse),
  pagination: PaginationResponse,
}).openapi('CustomerList');

/** Query parameters for the customers list endpoint. */
export const CustomerQuery = PaginationQuery.extend({
  search: z.string().optional().openapi({ param: { name: 'search', in: 'query' } }),
});

/** Request body for PATCH /v1/customers/:id. */
export const UpdateCustomerBody = z.object({
  name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  accepts_marketing: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
}).openapi('UpdateCustomer');

/** Request body for POST /v1/customers/:id/addresses. */
export const CreateAddressBody = z.object({
  label: z.string().optional(),
  is_default: z.boolean().optional(),
  name: z.string().optional(),
  company: z.string().optional(),
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().optional(),
  postal_code: z.string().min(1),
  country: z.string().optional().default('US'),
  phone: z.string().optional(),
}).openapi('CreateAddress');

/** A customer address record returned by the API. */
export const AddressResponse = z.object({
  id: z.string().uuid(),
  label: z.string().nullable(),
  is_default: z.boolean(),
  name: z.string().nullable(),
  company: z.string().nullable(),
  line1: z.string(),
  line2: z.string().nullable(),
  city: z.string(),
  state: z.string().nullable(),
  postal_code: z.string(),
  country: z.string(),
  phone: z.string().nullable(),
}).openapi('Address');

/** Path parameters for routes that accept a customer `id` and an `addressId`. */
export const AddressIdParam = z.object({
  id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }),
  addressId: z.string().uuid().openapi({ param: { name: 'addressId', in: 'path' } }),
});

// ============================================================
// DISCOUNT SCHEMAS
// ============================================================

/** Allowed discount calculation strategies. */
export const DiscountType = z.enum(['percentage', 'fixed_amount']);
/** Allowed status values for a discount record. */
export const DiscountStatus = z.enum(['active', 'inactive']);

/** Full discount record as returned by the API. */
export const DiscountResponse = z.object({
  id: z.string().uuid(),
  code: z.string().nullable().openapi({ example: 'SAVE20' }),
  type: DiscountType,
  value: z.number().int().openapi({ example: 20, description: 'Percentage (0-100) or cents' }),
  status: DiscountStatus,
  min_purchase_cents: z.number().int(),
  max_discount_cents: z.number().int().nullable(),
  starts_at: z.string().datetime().nullable(),
  expires_at: z.string().datetime().nullable(),
  usage_limit: z.number().int().nullable(),
  usage_limit_per_customer: z.number().int().nullable(),
  usage_count: z.number().int(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().optional(),
}).openapi('Discount');

/** Flat list response for GET /v1/discounts. */
export const DiscountListResponse = z.object({
  items: z.array(DiscountResponse),
}).openapi('DiscountList');

/** Request body for POST /v1/discounts. */
export const CreateDiscountBody = z.object({
  code: z.string().optional().openapi({ example: 'SAVE20' }),
  type: DiscountType,
  value: z.number().int().min(0).openapi({ example: 20 }),
  min_purchase_cents: z.number().int().min(0).optional(),
  max_discount_cents: z.number().int().positive().optional(),
  starts_at: z.string().datetime().optional(),
  expires_at: z.string().datetime().optional(),
  usage_limit: z.number().int().positive().optional(),
  usage_limit_per_customer: z.number().int().positive().optional(),
}).openapi('CreateDiscount');

/** Request body for PATCH /v1/discounts/:id. All fields optional. */
export const UpdateDiscountBody = z.object({
  status: DiscountStatus.optional(),
  code: z.string().nullable().optional(),
  value: z.number().int().min(0).optional(),
  min_purchase_cents: z.number().int().min(0).optional(),
  max_discount_cents: z.number().int().positive().nullable().optional(),
  starts_at: z.string().datetime().nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  usage_limit: z.number().int().positive().nullable().optional(),
  usage_limit_per_customer: z.number().int().positive().nullable().optional(),
}).openapi('UpdateDiscount');

// ============================================================
// WEBHOOK SCHEMAS
// ============================================================

/** Allowed event type values for webhook subscriptions. */
export const WebhookEvent = z.enum([
  'order.created',
  'order.updated',
  'order.shipped',
  'order.refunded',
  'inventory.low',
  'order.*',
  '*',
]);

/** Allowed status values for a webhook endpoint. */
export const WebhookStatus = z.enum(['active', 'disabled']);

/** Webhook endpoint record (without signing secret). */
export const WebhookResponse = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  events: z.array(z.string()),
  status: WebhookStatus,
  has_secret: z.boolean(),
  created_at: z.string().datetime(),
}).openapi('Webhook');

/** Webhook record including the signing secret — only returned immediately after creation. */
export const WebhookWithSecret = WebhookResponse.extend({
  secret: z.string().openapi({ example: 'whsec_abc123...' }),
}).omit({ has_secret: true }).openapi('WebhookWithSecret');

/** Flat list response for GET /v1/webhooks. */
export const WebhookListResponse = z.object({
  items: z.array(WebhookResponse),
}).openapi('WebhookList');

/** Webhook detail including recent delivery attempts. */
export const WebhookDetailResponse = WebhookResponse.extend({
  recent_deliveries: z.array(z.object({
    id: z.string().uuid(),
    event_type: z.string(),
    status: z.enum(['pending', 'success', 'failed']),
    attempts: z.number().int(),
    response_code: z.number().int().nullable(),
    created_at: z.string().datetime(),
    last_attempt_at: z.string().datetime().nullable(),
  })),
}).openapi('WebhookDetail');

/** Request body for POST /v1/webhooks. */
export const CreateWebhookBody = z.object({
  url: z.string().url().openapi({ example: 'https://example.com/webhook' }),
  events: z.array(WebhookEvent).min(1).openapi({ example: ['order.created', 'order.shipped'] }),
}).openapi('CreateWebhook');

/** Request body for PATCH /v1/webhooks/:id. All fields optional. */
export const UpdateWebhookBody = z.object({
  url: z.string().url().optional(),
  events: z.array(WebhookEvent).min(1).optional(),
  status: WebhookStatus.optional(),
}).openapi('UpdateWebhook');

/** A single webhook delivery attempt record with request/response details. */
export const WebhookDeliveryResponse = z.object({
  id: z.string().uuid(),
  event_type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  status: z.enum(['pending', 'success', 'failed']),
  attempts: z.number().int(),
  response_code: z.number().int().nullable(),
  response_body: z.string().nullable(),
  created_at: z.string().datetime(),
  last_attempt_at: z.string().datetime().nullable(),
}).openapi('WebhookDelivery');

/** Path parameters for webhook delivery routes: `id` (webhook ID) and `deliveryId`. */
export const DeliveryIdParam = z.object({
  id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }),
  deliveryId: z.string().uuid().openapi({ param: { name: 'deliveryId', in: 'path' } }),
});

/** Response after rotating a webhook signing secret. */
export const RotateSecretResponse = z.object({
  secret: z.string(),
}).openapi('RotateSecretResult');

/** Response after triggering a manual delivery retry. */
export const RetryResponse = z.object({
  status: z.string(),
  message: z.string(),
}).openapi('RetryResult');

// ============================================================
// SETUP SCHEMAS
// ============================================================

/** Request body for POST /v1/setup/stripe. */
export const SetupStripeBody = z.object({
  stripe_secret_key: z.string().startsWith('sk_').openapi({ example: 'sk_test_...' }),
  stripe_webhook_secret: z.string().startsWith('whsec_').optional().openapi({ example: 'whsec_...' }),
}).openapi('SetupStripe');

/** Generic success response with a boolean `ok` field. */
export const OkResponse = z.object({
  ok: z.literal(true),
}).openapi('Ok');

/** Response returned after a successful DELETE operation. */
export const DeletedResponse = z.object({
  deleted: z.literal(true),
}).openapi('Deleted');

// ============================================================
// IMAGE SCHEMAS
// ============================================================

/** Response after uploading an image to R2 object storage. */
export const ImageUploadResponse = z.object({
  url: z.string().url(),
  key: z.string(),
}).openapi('ImageUpload');

// ============================================================
// MULTI-REGION SCHEMAS
// ============================================================

// Currencies
/** A currency record supported by the store. */
export const CurrencyResponse = z.object({
  id: z.string().uuid(),
  code: z.string().length(3).toUpperCase().openapi({ example: 'USD' }),
  display_name: z.string().openapi({ example: 'US Dollar' }),
  symbol: z.string().openapi({ example: '$' }),
  decimal_places: z.number().int().min(0).max(8).openapi({ example: 2 }),
  status: z.enum(['active', 'inactive']),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
}).openapi('Currency');

/** Request body for POST /v1/currencies. */
export const CreateCurrencyBody = z.object({
  code: z.string().length(3).toUpperCase().openapi({ example: 'USD' }),
  display_name: z.string().min(1).openapi({ example: 'US Dollar' }),
  symbol: z.string().min(1).openapi({ example: '$' }),
  decimal_places: z.number().int().min(0).max(8).optional().default(2).openapi({ example: 2 }),
}).openapi('CreateCurrency');

/** Request body for PATCH /v1/currencies/:id. All fields optional. */
export const UpdateCurrencyBody = z.object({
  display_name: z.string().min(1).optional(),
  symbol: z.string().min(1).optional(),
  decimal_places: z.number().int().min(0).max(8).optional(),
  status: z.enum(['active', 'inactive']).optional(),
}).openapi('UpdateCurrency');

/** Paginated list response for GET /v1/currencies. */
export const CurrencyListResponse = z.object({
  items: z.array(CurrencyResponse),
  pagination: PaginationResponse,
}).openapi('CurrencyList');

// Countries
/** A country record supported by the store. */
export const CountryResponse = z.object({
  id: z.string().uuid(),
  code: z.string().length(2).toUpperCase().openapi({ example: 'US' }),
  display_name: z.string().openapi({ example: 'United States' }),
  country_name: z.string().openapi({ example: 'United States of America' }),
  language_code: z.string().openapi({ example: 'en' }),
  status: z.enum(['active', 'inactive']),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
}).openapi('Country');

/** Request body for POST /v1/countries. */
export const CreateCountryBody = z.object({
  code: z.string().length(2).toUpperCase().openapi({ example: 'US' }),
  display_name: z.string().min(1).openapi({ example: 'United States' }),
  country_name: z.string().min(1).openapi({ example: 'United States of America' }),
  language_code: z.string().min(2).optional().default('en').openapi({ example: 'en' }),
}).openapi('CreateCountry');

// ============================================================
// TAX RATE SCHEMAS
// ============================================================

/** A tax rate record (applied by country code or globally). */
export const TaxRateResponse = z.object({
  id: z.string().uuid(),
  display_name: z.string().openapi({ example: '{"en-US":"VAT FR","fr-FR":"TVA FR"}', description: 'Localized tax name (JSON string)' }),
  country_code: z.string().length(2).toUpperCase().nullable().openapi({ example: 'FR', description: 'ISO 3166-1 alpha-2 country code' }),
  tax_code: z.string().nullable().openapi({ example: 'txcd_99999999' }),
  rate_percentage: z.number().openapi({ example: 20.0 }),
  status: z.enum(['active', 'inactive']),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
}).openapi('TaxRate');

/** Paginated list response for GET /v1/tax-rates. */
export const TaxRateListResponse = z.object({
  items: z.array(TaxRateResponse),
  pagination: PaginationResponse,
}).openapi('TaxRateList');

/** Request body for POST /v1/tax-rates. */
export const CreateTaxRateBody = z.object({
  display_name: z.string().min(1).openapi({ example: '{"en-US":"VAT FR","fr-FR":"TVA FR"}', description: 'Localized tax name (JSON string or plain text for migration)' }),
  country_code: z.string().length(2).toUpperCase().nullable().optional().openapi({ example: 'FR' }),
  tax_code: z.string().nullable().optional().openapi({ example: 'txcd_99999999' }),
  rate_percentage: z.number().min(0).openapi({ example: 20.0 }),
}).openapi('CreateTaxRate');

/** Request body for PATCH /v1/tax-rates/:id. All fields optional. */
export const UpdateTaxRateBody = z.object({
  display_name: z.string().min(1).optional(),
  country_code: z.string().length(2).toUpperCase().nullable().optional(),
  tax_code: z.string().nullable().optional(),
  rate_percentage: z.number().min(0).optional(),
  status: z.enum(['active', 'inactive']).optional(),
}).openapi('UpdateTaxRate');

/** Request body for PATCH /v1/countries/:id. All fields optional. */
export const UpdateCountryBody = z.object({
  display_name: z.string().min(1).optional(),
  country_name: z.string().min(1).optional(),
  language_code: z.string().min(2).optional(),
  status: z.enum(['active', 'inactive']).optional(),
}).openapi('UpdateCountry');

/** Paginated list response for GET /v1/countries. */
export const CountryListResponse = z.object({
  items: z.array(CountryResponse),
  pagination: PaginationResponse,
}).openapi('CountryList');

// Warehouses
/** A physical warehouse location used for inventory tracking. */
export const WarehouseResponse = z.object({
  id: z.string().uuid(),
  display_name: z.string().openapi({ example: 'Main Warehouse' }),
  address_line1: z.string().openapi({ example: '123 Main St' }),
  address_line2: z.string().nullable().openapi({ example: 'Building A' }),
  city: z.string().openapi({ example: 'New York' }),
  state: z.string().nullable().openapi({ example: 'NY' }),
  postal_code: z.string().openapi({ example: '10001' }),
  country_code: z.string().openapi({ example: 'US' }),
  priority: z.number().int().openapi({ example: 1 }),
  status: z.enum(['active', 'inactive']),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
}).openapi('Warehouse');

/** Request body for POST /v1/warehouses. */
export const CreateWarehouseBody = z.object({
  display_name: z.string().min(1).openapi({ example: 'Main Warehouse' }),
  address_line1: z.string().min(1).openapi({ example: '123 Main St' }),
  address_line2: z.string().optional().openapi({ example: 'Building A' }),
  city: z.string().min(1).openapi({ example: 'New York' }),
  state: z.string().optional().openapi({ example: 'NY' }),
  postal_code: z.string().min(1).openapi({ example: '10001' }),
  country_code: z.string().length(2).toUpperCase().openapi({ example: 'US' }),
  priority: z.number().int().optional().default(0).openapi({ example: 1 }),
}).openapi('CreateWarehouse');

/** Request body for PATCH /v1/warehouses/:id. All fields optional. */
export const UpdateWarehouseBody = z.object({
  display_name: z.string().min(1).optional(),
  address_line1: z.string().min(1).optional(),
  address_line2: z.string().nullable().optional(),
  city: z.string().min(1).optional(),
  state: z.string().nullable().optional(),
  postal_code: z.string().min(1).optional(),
  country_code: z.string().length(2).toUpperCase().optional(),
  priority: z.number().int().optional(),
  status: z.enum(['active', 'inactive']).optional(),
}).openapi('UpdateWarehouse');

/** Paginated list response for GET /v1/warehouses. */
export const WarehouseListResponse = z.object({
  items: z.array(WarehouseResponse),
  pagination: PaginationResponse,
}).openapi('WarehouseList');

// Shipping Classes
/** A shipping class used to group variants with special handling requirements. */
export const ShippingClassResponse = z.object({
  id: z.string().uuid(),
  code: z.string().openapi({ example: 'oversized' }),
  display_name: z.string().openapi({ example: 'Oversized / Freight' }),
  description: z.string().nullable().openapi({ example: 'For items > 50kg or requiring special handling' }),
  resolution: z.enum(['exclusive', 'additive']).openapi({ example: 'exclusive', description: 'exclusive = hides other rates; additive = adds to standard rates' }),
  status: z.enum(['active', 'inactive']),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
}).openapi('ShippingClass');

/** Request body for POST /v1/shipping-classes. */
export const CreateShippingClassBody = z.object({
  code: z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/, 'Code must be lowercase letters, numbers, hyphens or underscores').openapi({ example: 'oversized' }),
  display_name: z.string().min(1).openapi({ example: 'Oversized / Freight' }),
  description: z.string().optional().openapi({ example: 'For items > 50kg or requiring special handling' }),
  resolution: z.enum(['exclusive', 'additive']).default('exclusive').openapi({ example: 'exclusive' }),
}).openapi('CreateShippingClass');

/** Request body for PATCH /v1/shipping-classes/:id. All fields optional. */
export const UpdateShippingClassBody = z.object({
  display_name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  resolution: z.enum(['exclusive', 'additive']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
}).openapi('UpdateShippingClass');

/** Paginated list response for GET /v1/shipping-classes. */
export const ShippingClassListResponse = z.object({
  items: z.array(ShippingClassResponse),
  pagination: PaginationResponse,
}).openapi('ShippingClassList');

// Shipping Rates
/** A shipping rate including weight limits, delivery estimates, and class restrictions. */
export const ShippingRateResponse = z.object({
  id: z.string().uuid(),
  display_name: z.string().openapi({ example: 'Standard Shipping' }),
  description: z.string().nullable().openapi({ example: '5-7 business days' }),
  max_weight_g: z.number().int().nullable().openapi({ example: 5000 }),
  min_delivery_days: z.number().int().nullable().openapi({ example: 5 }),
  max_delivery_days: z.number().int().nullable().openapi({ example: 7 }),
  shipping_class_id: z.string().uuid().nullable().openapi({ example: null, description: 'null = universal rate; otherwise restricted to this class' }),
  tax_code: z.string().nullable().optional().openapi({ example: 'txcd_92010001' }),
  tax_inclusive: z.boolean().default(false).openapi({ example: true }),
  status: z.enum(['active', 'inactive']),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
}).openapi('ShippingRate');

/** Request body for POST /v1/shipping-rates. */
export const CreateShippingRateBody = z.object({
  display_name: z.string().min(1).openapi({ example: 'Standard Shipping' }),
  description: z.string().optional().openapi({ example: '5-7 business days' }),
  max_weight_g: z.number().int().optional().openapi({ example: 5000 }),
  min_delivery_days: z.number().int().optional().openapi({ example: 5 }),
  max_delivery_days: z.number().int().optional().openapi({ example: 7 }),
  shipping_class_id: z.string().uuid().nullable().optional().openapi({ example: null, description: 'null = universal rate; otherwise restricted to this class' }),
  tax_code: z.string().nullable().optional().openapi({ example: 'txcd_92010001' }),
  tax_inclusive: z.boolean().optional().default(false).openapi({ example: true }),
}).openapi('CreateShippingRate');

/** Request body for PATCH /v1/shipping-rates/:id. All fields optional. */
export const UpdateShippingRateBody = z.object({
  display_name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  max_weight_g: z.number().int().nullable().optional(),
  min_delivery_days: z.number().int().nullable().optional(),
  max_delivery_days: z.number().int().nullable().optional(),
  shipping_class_id: z.string().uuid().nullable().optional(),
  tax_code: z.string().nullable().optional(),
  tax_inclusive: z.boolean().optional(),
  status: z.enum(['active', 'inactive']).optional(),
}).openapi('UpdateShippingRate');

/** Paginated list response for GET /v1/shipping-rates. */
export const ShippingRateListResponse = z.object({
  items: z.array(ShippingRateResponse),
  pagination: PaginationResponse,
}).openapi('ShippingRateList');

// Regions
/** A sales region grouping countries, warehouses, and shipping rates under a currency. */
export const RegionResponse = z.object({
  id: z.string().uuid(),
  display_name: z.string().openapi({ example: 'North America' }),
  currency_id: z.string().uuid(),
  currency_code: z.string().optional().openapi({ example: 'USD' }),
  is_default: z.boolean(),
  tax_inclusive: z.boolean().default(false).openapi({ description: 'True if prices in this region already include tax' }),
  status: z.enum(['active', 'inactive']),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
}).openapi('Region');

/** Request body for POST /v1/regions. */
export const CreateRegionBody = z.object({
  display_name: z.string().min(1).openapi({ example: 'North America' }),
  currency_id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
  is_default: z.boolean().optional().default(false).openapi({ example: false }),
  tax_inclusive: z.boolean().optional().default(false).openapi({ example: false }),
  country_ids: z.array(z.string().uuid()).optional().default([]).openapi({ example: [] }),
  warehouse_ids: z.array(z.string().uuid()).optional().default([]).openapi({ example: [] }),
  shipping_rate_ids: z.array(z.string().uuid()).optional().default([]).openapi({ example: [] }),
}).openapi('CreateRegion');

/** Request body for PATCH /v1/regions/:id. All fields optional. */
export const UpdateRegionBody = z.object({
  display_name: z.string().min(1).optional(),
  currency_id: z.string().uuid().optional(),
  is_default: z.boolean().optional(),
  tax_inclusive: z.boolean().optional(),
  status: z.enum(['active', 'inactive']).optional(),
}).openapi('UpdateRegion');

/** Request body for setting a static shipping rate on a (region, cart) combination. */
export const SetCartShippingBody = z.object({
  shipping_rate_id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
}).openapi('SetCartShipping');

// Region Associations
/** Request body to associate a country with a region. */
export const RegionCountryAssociationBody = z.object({
  country_id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
}).openapi('RegionCountryAssociation');

/** Request body to associate a warehouse with a region. */
export const RegionWarehouseAssociationBody = z.object({
  warehouse_id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
}).openapi('RegionWarehouseAssociation');

/** Request body to associate a shipping rate with a region. */
export const RegionShippingRateAssociationBody = z.object({
  shipping_rate_id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
}).openapi('RegionShippingRateAssociation');

// Shipping Rate Pricing
/** Request body to set a currency-specific price for a shipping rate in a region. */
export const ShippingRatePriceBody = z.object({
  currency_id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
  amount_cents: z.number().int().positive().openapi({ example: 999 }),
}).openapi('ShippingRatePrice');

/** A resolved per-currency price for a shipping rate. */
export const ShippingRatePriceResponse = z.object({
  currency_id: z.string().uuid(),
  currency_code: z.string().openapi({ example: 'USD' }),
  amount_cents: z.number().int().openapi({ example: 999 }),
}).openapi('ShippingRatePriceResponse');

/** Flat list response for GET /v1/shipping-rates/:id/prices. */
export const ShippingRatePriceListResponse = z.object({
  items: z.array(ShippingRatePriceResponse),
}).openapi('ShippingRatePriceListResponse');

/** Paginated list response for GET /v1/regions. */
export const RegionListResponse = z.object({
  items: z.array(RegionResponse),
  pagination: PaginationResponse,
}).openapi('RegionList');

// Warehouse Inventory
/** Per-warehouse inventory record for a SKU. */
export const WarehouseInventoryItem = z.object({
  sku: z.string().openapi({ example: 'TEE-BLK-M' }),
  warehouse_id: z.string().uuid(),
  warehouse_name: z.string().nullable().openapi({ example: 'Main Warehouse' }),
  on_hand: z.number().int().openapi({ example: 100 }),
  reserved: z.number().int().openapi({ example: 5 }),
  available: z.number().int().openapi({ example: 95 }),
  variant_title: z.string().nullable().openapi({ example: 'Black / Medium' }),
  product_title: z.string().nullable().openapi({ example: 'Classic T-Shirt' }),
}).openapi('WarehouseInventoryItem');

/** Paginated list response for GET /v1/warehouse-inventory. */
export const WarehouseInventoryListResponse = z.object({
  items: z.array(WarehouseInventoryItem),
  pagination: PaginationResponse,
}).openapi('WarehouseInventoryList');

/** Query parameters for the warehouse-specific inventory list endpoint. */
export const WarehouseInventoryQuery = PaginationQuery.extend({
  sku: z.string().optional().openapi({ param: { name: 'sku', in: 'query' }, example: 'TEE-BLK-M' }),
  warehouse_id: z.string().uuid().optional().openapi({ param: { name: 'warehouse_id', in: 'query' } }),
  low_stock: z.string().optional().openapi({ param: { name: 'low_stock', in: 'query' } }),
});

/** Query parameters for the regional inventory endpoint. */
export const RegionalInventoryQuery = z.object({
  region_id: z.string().uuid().openapi({ param: { name: 'region_id', in: 'query' }, example: '550e8400-e29b-41d4-a716-446655440000' }),
});

/** Request body for POST /v1/warehouse-inventory/:sku/adjust. */
export const AdjustWarehouseInventoryBody = z.object({
  warehouse_id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
  delta: z.number().int().openapi({ example: 50, description: 'Positive to add, negative to subtract' }),
  reason: z.enum(['restock', 'correction', 'damaged', 'return', 'sale', 'release']).openapi({ example: 'restock' }),
}).openapi('AdjustWarehouseInventory');

/** Request body for DELETE /v1/warehouse-inventory/:sku (removes a SKU from a warehouse). */
export const DeleteWarehouseInventoryBody = z.object({
  warehouse_id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
}).openapi('DeleteWarehouseInventory');

/** Query parameters for the regional inventory endpoint. */
export const RegionalInventoryResponse = z.object({
  sku: z.string().openapi({ example: 'TEE-BLK-M' }),
  region_id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
  total_on_hand: z.number().int().openapi({ example: 100 }),
  total_reserved: z.number().int().openapi({ example: 20 }),
  total_available: z.number().int().openapi({ example: 80 }),
  warehouses: z.array(z.object({
    warehouse_id: z.string().uuid(),
    warehouse_name: z.string().nullable(),
    on_hand: z.number().int(),
    reserved: z.number().int(),
    available: z.number().int(),
  })),
}).openapi('RegionalInventoryResponse');

// ============================================================
// CONFIG SCHEMAS
// ============================================================

/** A single key-value configuration entry (e.g. Stripe credentials). */
export const ConfigEntry = z.object({
  key: z.string().openapi({ example: 'stripe' }),
  value: z.string().nullable().openapi({ example: '{\"secret_key\":\"sk_...\"}' }),
}).openapi('ConfigEntry');

/** Flat list response for GET /v1/config. */
export const ConfigListResponse = z.object({
  items: z.array(ConfigEntry),
}).openapi('ConfigList');

// ============================================================
// CATEGORY SCHEMAS (Feature 027)
// ============================================================

/** A product category with optional hierarchy via `parent_id`. */
export const CategoryResponse = z.object({
  id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
  handle: z.string().openapi({ example: 't-shirts', description: 'URL-friendly slug' }),
  name: z.string().openapi({ example: 'T-Shirts' }),
  description: z.string().nullable().openapi({ example: 'Collection of classic t-shirts' }),
  parent_id: z.string().uuid().nullable().openapi({ example: '550e8400-e29b-41d4-a716-446655440001' }),
  image_url: z.string().url().nullable().openapi({ example: 'https://example.com/category.jpg' }),
  thumbnail_url: z.string().url().nullable().optional().openapi({ description: 'Small WebP thumbnail (data URI for <1 MB, R2 URL for ≥1 MB)' }),
  position: z.number().int().openapi({ example: 0, description: 'Sort order' }),
  status: z.enum(['active', 'inactive']).openapi({ example: 'active' }),
  created_at: z.string().datetime().openapi({ example: '2026-03-27T10:00:00Z' }),
  updated_at: z.string().datetime().openapi({ example: '2026-03-27T10:00:00Z' }),
}).openapi('Category');

/** Flat list response for GET /v1/categories. */
export const CategoryListResponse = z.object({
  items: z.array(CategoryResponse),
}).openapi('CategoryList');

/** Request body for POST /v1/categories. */
export const CreateCategoryBody = z.object({
  handle: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).openapi({ 
    example: 't-shirts', 
    description: 'URL-friendly slug (lowercase, hyphens only)' 
  }),
  name: z.string().min(1).max(1000).openapi({ 
    example: 'T-Shirts',
    description: 'Category name (plain text or JSON for multilingual: {"en-US": "T-Shirts", "fr-FR": "T-Shirts"})' 
  }),
  description: z.string().optional().openapi({ 
    example: 'Collection of classic t-shirts',
    description: 'Category description (plain text or JSON for multilingual)' 
  }),
  parent_id: z.string().uuid().optional().openapi({ example: '550e8400-e29b-41d4-a716-446655440001' }),
  image_url: z.string().url().optional().openapi({ example: 'https://example.com/category.jpg' }),
  thumbnail_url: z.string().url().nullable().optional().openapi({ description: 'Small WebP thumbnail (data URI for <1 MB, R2 URL for ≥1 MB)' }),
  position: z.number().int().optional().default(0).openapi({ example: 0 }),
}).openapi('CreateCategory');

/** Request body for PATCH /v1/categories/:id. All fields optional. */
export const UpdateCategoryBody = z.object({
  handle: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional().openapi({ example: 't-shirts' }),
  name: z.string().min(1).max(1000).optional().openapi({ 
    example: 'T-Shirts',
    description: 'Category name (plain text or JSON for multilingual: {"en-US": "T-Shirts", "fr-FR": "T-Shirts"})'
  }),
  description: z.string().nullable().optional().openapi({ 
    example: 'Collection of classic t-shirts',
    description: 'Category description (plain text or JSON for multilingual)'
  }),
  parent_id: z.string().uuid().nullable().optional().openapi({ example: '550e8400-e29b-41d4-a716-446655440001' }),
  image_url: z.string().url().nullable().optional().openapi({ example: 'https://example.com/category.jpg' }),
  thumbnail_url: z.string().url().nullable().optional().openapi({ description: 'Small WebP thumbnail (data URI for <1 MB, R2 URL for ≥1 MB)' }),
  position: z.number().int().optional().openapi({ example: 0 }),
  status: z.enum(['active', 'inactive']).optional().openapi({ example: 'active' }),
}).openapi('UpdateCategory');

/** Request body to bulk-assign products to a category. */
export const AssignProductsToCategoryBody = z.object({
  product_ids: z.array(z.string().uuid()).openapi({ description: 'Array of product UUIDs' }),
}).openapi('AssignProductsToCategory');

/** Path parameter schema for category routes that accept a category `id`. */
export const CategoryIdParam = z.object({
  id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }),
});

/** Path parameter schema for category routes that accept a `handle` (URL slug). */
export const CategoryHandleParam = z.object({
  handle: z.string().openapi({ param: { name: 'handle', in: 'path' } }),
});

/** Paginated list of products belonging to a category. */
export const CategoryProductsResponse = z.object({
  items: z.array(ProductResponse),
  pagination: PaginationResponse,
}).openapi('CategoryProducts');

// ============================================================
// TYPE EXPORTS
// ============================================================

/** TypeScript type inferred from the `ProductResponse` schema. */
export type Product = z.infer<typeof ProductResponse>;
/** TypeScript type inferred from the `VariantResponse` schema. */
export type Variant = z.infer<typeof VariantResponse>;
/** TypeScript type inferred from the `OrderResponse` schema. */
export type Order = z.infer<typeof OrderResponse>;
/** TypeScript type inferred from the `CustomerResponse` schema. */
export type Customer = z.infer<typeof CustomerResponse>;
/** TypeScript type inferred from the `DiscountResponse` schema. */
export type Discount = z.infer<typeof DiscountResponse>;
/** TypeScript type inferred from the `WebhookResponse` schema. */
export type Webhook = z.infer<typeof WebhookResponse>;
/** TypeScript type inferred from the `InventoryItem` schema. */
export type InventoryItemType = z.infer<typeof InventoryItem>;
/** TypeScript type inferred from the `CartResponse` schema. */
export type CartType = z.infer<typeof CartResponse>;
/** TypeScript type inferred from the `CurrencyResponse` schema. */
export type CurrencyType = z.infer<typeof CurrencyResponse>;
/** TypeScript type inferred from the `CountryResponse` schema. */
export type CountryType = z.infer<typeof CountryResponse>;
/** TypeScript type inferred from the `WarehouseResponse` schema. */
export type WarehouseType = z.infer<typeof WarehouseResponse>;
/** TypeScript type inferred from the `ShippingRateResponse` schema. */
export type ShippingRateType = z.infer<typeof ShippingRateResponse>;
/** TypeScript type inferred from the `RegionResponse` schema. */
export type RegionType = z.infer<typeof RegionResponse>;
/** TypeScript type inferred from the `WarehouseInventoryItem` schema. */
export type WarehouseInventoryType = z.infer<typeof WarehouseInventoryItem>;
