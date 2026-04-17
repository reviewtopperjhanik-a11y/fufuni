#!/usr/bin/env tsx
/**
 * Rewrite topic descriptions to be information-dense, discriminant, and ≤ 200 chars.
 * Run once; after that, edit the topic files directly.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOPICS_DIR = join(__dirname, '../knowledge/topics');

/**
 * Curated descriptions. Rules:
 *  - One declarative sentence naming the topic clearly.
 *  - Mention 2–3 concrete symbols so the model can match by name.
 *  - Distinguishable from sibling topics.
 *  - ≤ 200 characters.
 */
const DESCRIPTIONS: Record<string, string> = {
  'admin-crud-pattern':
    'Standardized admin list/edit architecture built from AdminCrudLayout, useAdminCrud hook, and RowActions — the three-part composition every admin page uses.',
  'ai-assisted-features':
    'AI-assisted features (review moderation, auto-translation) — GET /v1/ai/parameters endpoint, ai-client.ts helpers, and the browser-side inference pattern.',
  'analytics-dashboard':
    'Merchant analytics surface — revenue, orders and traffic endpoints plus the chart wrappers rendered on the admin analytics page.',
  'api-error-patterns':
    'ApiError class and static helpers (notFound, unauthorized, invalidRequest, conflict…), Hono-to-JSON conversion, and frontend error-handling patterns.',
  'auth-patterns':
    'Backend authMiddleware, RBAC guards (adminOnly, superAdminOnly, databaseAdminOnly…), and the frontend AuthenticationGuardWithPermission wrapper used to gate admin pages.',
  'auth0-tenant-setup':
    'Auth0 tenant deployment — auto-install script, resource-server scopes, RBAC roles, social connections, and the Auth0 Deploy CLI workflow.',
  'checkout-and-ucp':
    'Checkout flow and the Universal Commerce Protocol (UCP) — Stripe Checkout integration, UCP sessions, browse/catalog endpoints consumed by AI shopping agents.',
  'cloudflare-worker-patterns':
    'Cloudflare Worker building blocks: Durable Objects with SQLite, KV, R2, Rate Limiter bindings, wrangler.jsonc layout, and CI secrets handling.',
  'conventions-and-anti-patterns':
    'Fufuni coding conventions and forbidden patterns — naming rules, no c.req.json, no Drizzle, Zod-in-createRoute, plus AI-agent contributor guidelines.',
  'customer-account-patterns':
    'Customer account surface: /me routes, customerAuthMiddleware, address book, order history, and profile-update flows for logged-in shoppers.',
  'db-schema':
    'Complete Durable Object SQL schema — every table, column, index and foreign key used by the Fufuni backend.',
  'discounts-and-pricing':
    'Discount codes and tiered pricing — lib/pricing.ts helpers, promotion endpoints, and the discount-application order for cart totals.',
  'e2e-testing':
    'Playwright end-to-end setup — fixtures, storage-state auth reuse, test specs under e2e/, and helper scripts that seed a temporary store.',
  'email-templates':
    'Transactional email delivery via Mailgun — Handlebars templates (order confirmation, password reset, refund), sending helpers, and trigger points.',
  'framework-overview':
    'High-level Fufuni architecture — stack (CF Workers + Durable Objects + React), monorepo layout, request lifecycle, and core conventions. Start here.',
  'frontend-react-patterns':
    'React 19 patterns on the merchant UI — React Query defaults, HeroUI v3 components, client routing, custom hooks, navbar wiring, and theme integration.',
  'how-to-add-hono-route':
    'Step-by-step pattern for adding a new OpenAPIHono route — Zod schemas, public vs admin split (publicApp + adminApp export), and RBAC guards.',
  'how-to-add-migration':
    'Step-by-step pattern for changing the DB schema — update SCHEMA constant, append to ensureInitialized, add numbered SQL file under apps/merchant/migrations/.',
  'i18n-patterns':
    'react-i18next usage across the six supported locales — locale files layout, useTranslation hook, and fallback-language behaviour.',
  'image-storage-patterns':
    'Image upload and display — base64-in-SQL vs R2-hosted trade-off, ImageUploadInput component, uploadImageFile utility, and URL resolution.',
  'inventory-and-warehouses':
    'Stock tracking per variant × warehouse — inventory table, reserveStock/releaseStock/deductStock helpers in lib/inventory.ts, and the admin adjustment UI.',
  'invoice-and-pdf':
    'Client-side PDF invoice generation with jsPDF — invoice layout, order-view tokens for public access, and the download entry point.',
  'jwt-user-metadata-patterns':
    'Auth0 JWT custom claims — user_metadata vs app_metadata, useTokenUserData hook, store-metadata propagation, and per-user theme storage.',
  'localized-content-patterns':
    'Multilingual content model — LocalizedText type, useLocalizedTextInput hook, and the renderLocalized utility used across product and category surfaces.',
  'mcp-server-quickstart':
    'Setup and extension of the Fufuni MCP server itself — generate.ts pipeline, adding a new topic, running gen-knowledge, and deploying to Cloudflare.',
  'migrations-reference':
    'Enumeration of every numbered SQL migration — applied order, schema changes introduced, and a mini changelog per migration file.',
  'oauth-embedded':
    'Embedded OAuth2 authorization server — client registration, token issuance, scopes, introspection endpoint, and integration with external apps.',
  'order-view-tokens':
    'Signed order-view tokens — how they are generated, how the public invoice route validates them, and when to use them instead of JWT auth.',
  'orders-and-refunds':
    'Order lifecycle (pending → paid → fulfilled → refunded), partial-refund audit trail from migration 034, and the CSV export endpoint.',
  'product-catalog-and-localization':
    'Product catalogue — CRUD endpoints, variant management, category tree, and how product names and descriptions are localized per store locale.',
  'product-reviews':
    'Product review system — customer submission, rating aggregation, AI-assisted moderation, and the admin review management page.',
  'regions-taxes-shipping':
    'Regions, tax rates, and shipping zones — lib/tax.ts and lib/shipping.ts helpers, rate tables, and region → shipping-zone mapping.',
  'seed-data-patterns':
    'Seed script structure — how demo data is inserted, how to add new seed records, and the reset-demo GitHub Action that triggers it on a schedule.',
  'setup-and-initialization':
    'First-run store setup — the /v1/setup endpoint, initial-configuration fields, and the routes that bootstrap a fresh Fufuni instance.',
  'theming-and-layouts':
    'Theme and layout system — ThemeProvider, the Default and Luxury layouts, CMS-driven content blocks, and siteConfig integration.',
  'use-secured-api':
    'useSecuredApi React hook for authenticated calls — getJson, postJson, putJson, patchJson, deleteJson, postForm, plus Auth0 bearer injection.',
  'user-preferences-and-wishlist':
    'Per-user state — wishlist stored in Auth0 user_metadata, saved carts, and the custom hooks that wrap the metadata updates.',
  'webhooks-outbound':
    'Outbound webhooks — endpoint registration, delivery retry logic, and the HMAC signature scheme used by consumers to verify authenticity.',
};

async function main() {
  const slugs = Object.keys(DESCRIPTIONS);
  console.log(`Updating descriptions for ${slugs.length} topics...`);

  let updated = 0;
  let unchanged = 0;
  let maxLen = 0;

  for (const slug of slugs) {
    const filePath = join(TOPICS_DIR, `${slug}.ts`);
    const newDesc = DESCRIPTIONS[slug];

    if (newDesc.length > 200) {
      console.error(`  ✗ ${slug}: description too long (${newDesc.length} > 200)`);
      process.exit(1);
    }
    maxLen = Math.max(maxLen, newDesc.length);

    const content = readFileSync(filePath, 'utf8');

    // Replace description in the Topic literal. The line currently looks like:
    //   description: 'old text',
    // Escape single quotes in the new description.
    const escaped = newDesc.replace(/'/g, "\\'");
    const replaced = content.replace(
      /description:\s*'[^']*'/,
      `description: '${escaped}'`,
    );

    if (replaced === content) {
      unchanged++;
      console.log(`  · ${slug} (unchanged)`);
      continue;
    }

    writeFileSync(filePath, replaced, 'utf8');
    updated++;
    console.log(`  ✓ ${slug} (${newDesc.length} chars)`);
  }

  console.log(`\nDone. updated=${updated} unchanged=${unchanged} max_length=${maxLen}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
