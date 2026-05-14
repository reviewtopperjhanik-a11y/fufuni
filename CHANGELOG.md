# Fufuni e-commerce platform changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased] — 2026-04-06

### Added

#### Digital products & downloadable files

- **New variant type `digital`**: variants can now be marked as `variant_type = 'digital'` with `requires_shipping` automatically coerced to `0`.
- **`digital_assets` table** (migration 035): stores file metadata per variant — either an R2 `file_key` or an external `file_url`.
- **Admin routes** (`apps/merchant/src/routes/digital-assets.ts`):
  - `POST /v1/products/:id/variants/:variantId/digital-asset` — upsert asset metadata.
  - `GET /v1/products/:id/variants/:variantId/digital-asset` — fetch asset metadata.
  - `DELETE /v1/products/:id/variants/:variantId/digital-asset` — remove asset and reset `variant_type` to `physical`.
  - `POST /v1/admin/digital-assets/upload-url` — generate presigned R2 upload URL.
  - `PUT /v1/admin/digital-assets/upload/:key` — proxy file upload to R2.
- **Customer download routes** (`apps/merchant/src/routes/downloads.ts`):
  - `GET /v1/orders/:orderId/downloads` — returns JWT-signed download URLs per digital item (requires order in paid/processing/shipped/delivered status).
  - `GET /v1/downloads/:token` — validates token, streams from R2 or redirects to external URL. TTL: 7 days.
- **Frontend**: order detail page now shows download buttons when digital items are present. i18n keys added for all 6 languages.
- **Optional `DIGITAL_ASSETS_BUCKET` R2 binding**: when unset, only external-URL storage is supported.

#### AI token packages

- **New variant type `ai_tokens`**: virtual products with `ai_token_units` (units per purchase), no shipping, no inventory row.
- **New tables** (migration 035): `ai_token_balances` (customer wallet per API key) and `ai_token_transactions` (credit/debit ledger).
- **Customer routes** (`apps/merchant/src/routes/ai-tokens.ts`):
  - `GET /v1/me/ai-tokens/balance` — view balance and masked API key.
  - `POST /v1/me/ai-tokens/link` — link an ai-proxy API key and apply any pending credits.
- **Proxy routes** (shared-secret auth, `AI_BALANCE_SHARED_SECRET` env var):
  - `GET /v1/ai-tokens/proxy/balance/:apiKey` — balance check for ai-proxy-cloudflare.
  - `POST /v1/ai-tokens/proxy/deduct` — deduct tokens after a successful AI request.
- **Admin routes**: `GET /v1/admin/ai-tokens` — paginated balance list.
- **Webhook integration**: `webhooks.ts` now calls `creditAiTokens()` after a successful Stripe `checkout.session.completed` event for orders containing `ai_tokens` variants. Runs non-blocking via `waitUntil`.
- **Profile convenience**: `PATCH /v1/me/profile` now accepts `ai_proxy_api_key` (stored in `customers.metadata`). Set `null` to unlink.
- **Frontend**: account dashboard has a new "AI Tokens" tab with balance display, API key link/unlink widget. i18n keys added for all 6 languages.

#### ai-proxy-cloudflare — balance enforcement

- **`src/lib/balance.ts`** (new): `checkBalance()` and `deductBalance()` helpers that call the Fufuni merchant backend.
- **`src/index.ts`**: before forwarding a request, checks balance (HTTP 402 if ≤ 0). After a successful response, deducts 1 unit via `waitUntil`.
- **Standalone mode**: when `FUFUNI_MERCHANT_URL` is empty/unset, balance enforcement is completely disabled — fully backward-compatible.
- `wrangler.jsonc` documents `FUFUNI_MERCHANT_URL` (plaintext var) and `AI_BALANCE_SHARED_SECRET` (secret).

#### MCP knowledge base

- New topic **`digital-products`**: covers variant types, digital assets, download token flow, and frontend integration.
- New topic **`ai-tokens-integration`**: covers AI token product setup, credit-on-purchase webhook, proxy balance enforcement, and customer account flow.
- Updated topic **`db-schema`**: documents migration 035 tables (`digital_assets`, `ai_token_balances`, `ai_token_transactions`).

#### UCP — Phase 4 post-audit

- **`PATCH /ucp/v1/checkout-sessions/{id}`** (P3): new endpoint for partial session updates.
  - `{ buyer }` — merges buyer fields into the existing record without touching line items or prices.
  - `{ line_items: [{ id, quantity }] }` — adjusts quantities, recalculates `total_price` per item, recomputes subtotal + tax via `computeTax()`, and rebuilds the `totals` array.
  - Returns `303 See Other` redirecting to `GET /ucp/v1/checkout-sessions/{id}` for the consolidated response.
  - Rejects updates on `completed` or `canceled` sessions with `400`.

#### UCP — OpenAPI integration

- **`apps/merchant/src/routes/ucp-schemas.ts`**: new file centralising all UCP Zod schemas used by `@hono/zod-openapi`:
  `UCPEnvelopeSchema`, `UCPLineItemSchema`, `UCPBuyerSchema`, `UCPTotalSchema`, `UCPMessageSchema`,
  `UCPLinkSchema`, `UCPPaymentHandlerSchema`, `UCPPaymentResponseSchema`, `UCPOrderConfirmationSchema`,
  `UCPCheckoutSessionSchema`, `UCPShippingOptionSchema`, `CreateCheckoutBodySchema`,
  `UpdateCheckoutBodySchema`, `PatchCheckoutBodySchema`, `CompleteCheckoutBodySchema`,
  `EstimateShippingBodySchema`, `SessionIdParamSchema`, `ProductsQuerySchema`, `ProductIdParamSchema`.
- All 11 UCP routes migrated from anonymous Hono handlers to `createRoute()` + `ucp.openapi()` so they appear automatically in `/openapi.json` without manual YAML maintenance.
- UCP router type changed from `new Hono<HonoEnv>()` to `new OpenAPIHono<HonoEnv>()`.

#### KV cache — UCP public routes

- `kvCacheMiddleware` now applied to UCP public GET routes in `apps/merchant/src/index.ts`:
  - `/.well-known/ucp`
  - `/ucp/v1/products` and `/ucp/v1/products/*`
  - `/ucp/v1/categories`
- `kvInvalidateMiddleware` extended to purge `cache:${origin}/ucp/v1/products`, `cache:${origin}/ucp/v1/categories`, and `cache:${origin}/.well-known/ucp` on successful product or category mutations.

### Changed

- **`apps/merchant/src/index.ts`**: `app.route('', ucp)` changed to `app.route('/', ucp)`. The empty-string base caused `mergePath` to produce double-slash paths (`//ucp/v1/...`, `//.well-known/ucp`) in the generated `openapi.json`.
- **`apps/merchant/src/middleware/kv-cache.ts`**: `X-KV-Cache` header is now only set to `HIT` when a response is served from KV. The `MISS` value was removed — no header is added on a cache miss or bypass, simplifying client-side detection.

### Fixed

#### UCP — Phase 4 post-audit (P1/P2)

- **`tax_cents` always `0` in UCP Stripe webhook orders** (`handleUCPStripeWebhook`): the function previously used only the `grand_total` entry to fill all order amount fields. It now independently extracts `subtotalAmount`, `taxAmount`, and `shippingAmount` from the session's `totals` array so `subtotal_cents`, `tax_cents`, and `shipping_cents` are persisted correctly on the created order.
- **Missing Browse + Catalog capabilities in `GET /.well-known/ucp`**: the discovery profile declared only 3 capabilities while `/ucp/v1/products` and `/ucp/v1/categories` were fully implemented. Added `dev.ucp.shopping.browse` and `dev.ucp.shopping.catalog` to the capabilities array, matching the output of `activeCapabilities()` (5 total: checkout, browse, catalog, identity_linking, order).
- **`POST /ucp/v1/checkout-sessions/{id}/complete` — session stuck in `complete_in_progress`** (P2): the `complete_in_progress` status update was applied before handler validation, leaving sessions permanently blocked when Stripe was not configured or `handler_id` was unknown. The update now only happens inside the Stripe branch. When no handler matches, the endpoint returns `200` with `status: "requires_escalation"`, a `continue_url` pointing to the web checkout, and a `warning` UCP message instead of throwing a `400`.

#### UCP — SQL and schema bugs

- **`no such column: active`**: `WHERE active = 1` replaced with `WHERE status = 'active'` in product list, product detail, and category queries. The schema uses a `status TEXT` column, not a boolean `active INTEGER`.
- **`no such column: p.thumbnail_url`**: `products` table has only `image_url`; `thumbnail_url` lives on `variants`. Product list query now uses `COALESCE(v.thumbnail_url, v.image_url, p.image_url)` for thumbnail and `COALESCE(v.image_url, p.image_url)` for full image, joining the first active variant.
- **`no such column: sort_order`** in `categories`: column is named `position`. Fixed in `ORDER BY`.
- **Product detail `GET /ucp/v1/products/{id}` returning 404**: the endpoint now accepts any of product UUID, product handle, variant UUID, or variant SKU via an `OR`-compound `WHERE` clause with an `EXISTS` sub-select on `variants`.
- **`:id` path syntax in generated `openapi.json`**: `createRoute` `path` fields use OpenAPI brace syntax (`{id}`) instead of Hono colon syntax (`:id`). `@hono/zod-openapi` converts `{id}` → `:id` internally for routing but preserves the OpenAPI form in the spec output.

---

## [Unreleased] — 2026-04-05

### Added

#### Cart UX
- **`CartDrawerContext`** (`apps/client/src/contexts/cart-drawer-context.tsx`): new React context exposing `useCartDrawer()` — `{ isOpen, open, close }` — to manage the cart drawer globally without prop drilling.
- `CartDrawerProvider` integrated into the root provider chain (`provider.tsx`) between `CartProvider` and its children.
- `ProductCard` and `ProductCardFull` now call `open()` from `useCartDrawer` immediately after `addItem()`, so the cart drawer opens automatically when a product is added.
- Mobile navbar (`sm:hidden` breakpoint) now shows a cart icon with badge count, matching the desktop behaviour. The icon is wired to `onCartOpen` when a handler is provided, or navigates to `/cart` otherwise.

#### SEO
- **`useSeoMeta`** hook (`apps/client/src/hooks/use-seo-meta.ts`): lightweight DOM-based meta tag injector for `<title>`, `og:title`, `og:description`, `og:image`, `og:type`, and `product:price:amount` / `product:price:currency`. No `react-helmet` dependency.
- `ProductPage` now calls `useSeoMeta` with the product name, description, image, and lowest variant price.
- **Dynamic XML sitemap** served at `GET /sitemap.xml` by the backend Worker (`apps/merchant/src/routes/sitemap.ts`). Includes all published products and active categories. Response is cached with `Cache-Control: public, max-age=3600`.

#### Refunds
- **Migration `034-enrich-refunds.sql`**: additive `ALTER TABLE` migration that adds `currency TEXT`, `reason TEXT`, `notes TEXT`, and `updated_at TEXT` columns to the existing `refunds` table, plus a composite index `(order_id, created_at DESC)`.
- **`GET /v1/orders/:orderId/refunds`** (admin auth): lists all refunds for a given order, returning `id`, `stripe_refund_id`, `amount_cents`, `currency`, `reason`, `notes`, `status`, and `created_at`.

#### UCP — Universal Commerce Protocol
- **Browse capability** (`dev.ucp.shopping.browse`):
  - `GET /ucp/v1/products` — paginated product listing with `limit`, `offset`, `category` (handle), and `q` (full-text search) query params.
  - `GET /ucp/v1/products/:id` — single product with all variants.
  - `GET /ucp/v1/categories` — all active categories ordered by `sort_order`.
- **Catalog capability** (`dev.ucp.shopping.catalog`) added to `activeCapabilities()`.
- **`POST /ucp/v1/checkout-sessions/:id/estimate-shipping`**: accepts `{ country_code }` and returns `shipping_options[]` from `shipping_rates` filtered by country, ordered by price ASC.

#### CI/CD & Documentation
- **`.github/workflows/ci.yml`**: new GitHub Actions workflow running `typecheck` and `ESLint` on every pull request targeting `main` or `develop`, and on every push to `develop`.
- **`CONTRIBUTING.md`**: contributor guide covering Quick Start, ADR table, 3-step feature guide (routes → migration → schema), and CI/deploy reference.
- `README.md` header restructured with `<div align="center">` badge block (CI status, license, Cloudflare Workers, HeroUI, Auth0), free-tier hosting table, and an *AI-native* UCP section with `curl` usage examples.
- `generate-static-mcp-response.ts` MCP static docs updated for all six affected topics: `framework-overview`, `db-schema`, `how-to-add-migration`, `frontend-react-patterns`, `checkout-and-ucp`, and `orders-and-refunds`.

### Changed

- **`apps/client/src/layouts/default.tsx`**: replaced local `useState(false)` for cart drawer with `useCartDrawer()` from the new context.
- **`apps/client/src/provider.tsx`**: provider count increased from three to four — `CartDrawerProvider` added after `CartProvider`.
- **`apps/merchant/src/do.ts`**: `SCHEMA` definition for the `refunds` table updated with new columns; migration `034_enrich_refunds` added to the `ensureInitialized()` run-once array.
- **`apps/merchant/src/schemas.ts`**: `RefundOrderBody` now accepts `reason` (`duplicate | fraudulent | requested_by_customer`, default `requested_by_customer`) and `notes`; `RefundResponse` now exposes `id` and `currency`.
- **`POST /v1/orders/:orderId/refund`**: augmented to persist `reason`, `notes`, and `currency`; sets order status to `partially_refunded` when `amount_cents` is less than `total_cents`, otherwise `refunded`. Records `updated_at` timestamp on the refund row.
- **`activeCapabilities()`** in `ucp.ts`: now returns five capabilities — `checkout`, `browse`, `catalog`, `identity_linking`, and `order`.

### Fixed

- **`cart-drawer.tsx`**: two native `<button onClick>` elements replaced with HeroUI `<Button onPress>` (`isIconOnly`, `variant="bordered"`, `radius="none"`, proper `aria-label`) to comply with the project's HeroUI-only interactive element policy.
- **UCP checkout-session totals** (`POST` and `PUT /ucp/v1/checkout-sessions`): `grand_total` was incorrectly set equal to `subtotal`. A new `computeTax()` helper queries the default region's tax rate (`tax_rates JOIN regions WHERE is_default=1`) and adds a tax line item; `grand_total = subtotal + taxAmount`.
