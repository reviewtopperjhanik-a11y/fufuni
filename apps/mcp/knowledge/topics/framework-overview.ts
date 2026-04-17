/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'framework-overview',
  description: 'High-level architecture, file tree, stack summary',
  sources: [
    'README.md',
    'apps/merchant/src/index.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'The monorepo has three main workspaces: apps/client (React SPA), apps/merchant (Hono Worker + Durable Object), apps/mcp (MCP server).',
    'The monorepo uses **Turborepo** for task orchestration. The `npm run dev:env` inject the .env and launches the full stack locally with hot-reloading for both frontend, backend, mcp and stripe.',
    'The entire backend runs inside a single Durable Object (MerchantDO) so that all SQL is executed in one JS isolate — no connection pools, no latency.',
    'Public API keys are prefixed pk_; admin/secret keys are prefixed sk_. Never expose sk_ keys to the frontend.',
    'Secret sk_ key is kept only for legacy compatibility, RBAC auth via Auth0 permissions on access tokens is the source of truth.',
    'All database schema changes must be applied in THREE places simultaneously: SCHEMA constant in do.ts, ensureInitialized() in do.ts, and a new numbered SQL file in apps/merchant/migrations/.',
    'Auth0 is the sole identity provider. RBAC is managed via Auth0 permissions on the access token, not in the database.',
    'The frontend navbar items and their visibility are driven by siteConfig() in apps/client/src/config/site.ts — each navItem has a permissions[] array. Add a new page by adding an entry there.',
    'Fufuni is designed to run 100% free: Cloudflare Workers free tier (100k req/day), Durable Object SQLite (included), R2 free tier (10 GB/month), KV free tier (100k reads/day), Auth0 free tenant (7500 MAU), GitHub Pages for the frontend, and Mailgun 3000 emails/month. No credit card required.',
    'Three GitHub Actions workflows automate the full deployment: (1) deploy-cloudflare-worker.yaml (push to main → Worker deploy, needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID secrets); (2) pages.yaml (push to main → GitHub Pages frontend deploy); (3) reset-demo.yaml (manual/scheduled → resets and re-seeds the live demo).',
    'A fourth workflow ci.yml runs typecheck + ESLint on every pull-request targeting main or develop — it does NOT deploy anything.',
    'The sitemap is generated dynamically at GET /sitemap.xml by the backend Worker (no auth required). It lists all active products and categories with lastmod. Cloudflare edge caches it for 1 hour.',
    'UCP capabilities exposed: dev.ucp.shopping.checkout, dev.ucp.shopping.browse, dev.ucp.shopping.catalog, dev.ucp.common.identity_linking, dev.ucp.shopping.order. Browse and catalog endpoints: GET /ucp/v1/products, GET /ucp/v1/products/:id, GET /ucp/v1/categories. Shipping estimation: POST /ucp/v1/checkout-sessions/:id/estimate-shipping.',
  ],
  buildPrompt: (src) => appendFacts(`
Below is the root README and the Hono application entry point of the Fufuni framework.

${src}

Task: Write a "Framework Overview" reference document for the MCP knowledge base.
Include:
1. A one-paragraph project description.
2. A "Stack" table (layer | technology | notes).
3. A "Monorepo structure" section with the key directories and their purpose.
4. A "Request lifecycle" section explaining how a request flows from client → CF Worker → Durable Object → SQLite.
5. A "Key conventions" bullet list (naming, error handling, auth, i18n).
Keep it under 600 words. Use Markdown headings level 2 (##) and 3 (###).
`, topic.manualFacts),
};

export default topic;
