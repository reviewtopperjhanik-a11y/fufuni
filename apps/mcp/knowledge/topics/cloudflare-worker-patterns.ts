/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'cloudflare-worker-patterns',
  description: 'Worker bindings, Durable Objects, KV, R2, Wrangler config, CI secrets',
  sources: [
    'apps/merchant/wrangler.jsonc',
    'apps/merchant/worker-configuration.d.ts',
    '.github/workflows/create-env-artifact.yaml',
    '.github/workflows/deploy-cloudflare-worker.yaml',
    '.github/workflows/pages.yaml',
    'scripts/generate-wrangler-jsonc.py',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'Every .env variable has a 1:1 equivalent GitHub secret (same name). When you add a new env variable, also add it to .github/workflows/create-env-artifact.yaml (the CI encrypted artifact builder) so CI can pass it to the Worker build.',
    'generate-wrangler-jsonc.py generates wrangler.jsonc from .env and base wrangler.jsonc. It also generates secrets.json for wrangler secret bulk command.',
    'create-env-artifact.yaml generates an encrypted .env + wrangler.jsonc artifact consumed by CI deploy jobs. Without adding a new variable there, it will be absent from CI deployments.',
    'Frontend env vars are NOT VITE_ prefixed. They are injected via vite.config.ts define block as import.meta.env.VARIABLE_NAME. To expose a new variable to the browser: add it to the define block in apps/client/vite.config.ts.',
    'import.meta.env.PERMISSIONS is a string[] derived at build time from all *_PERMISSION .env keys (scopesArray in vite.config.ts). This drives navbar permission filtering without hardcoding permission strings.',
    'Mailgun is used for transactional emails. Required backend env vars (Wrangler secrets): MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_BASE_URL (default: https://api.mailgun.net), MAILGUN_USER (sender address). Email sending is silently skipped if MAILGUN_API_KEY is absent.',
    'kvCacheMiddleware (apps/merchant/src/middleware/kv-cache.ts) serves GET responses from KV before hitting the Durable Object. Cache key = cache:<full-url> including query params.',
    'KV cache TTL is configurable via three env vars (also GitHub Secrets): KV_CACHE_SEARCH_TTL_SECONDS (default 300s, search results), KV_CACHE_REVIEWS_TTL_SECONDS (default 600s, product reviews), KV_CACHE_DEFAULT_TTL_SECONDS (default 3600s, all other catalog/category routes).',
    'kvCacheMiddleware bypasses the cache for non-GET methods and for Authorization headers other than Bearer pk_* (admin JWTs and sk_ keys always hit the Durable Object directly).',
    'kvInvalidateMiddleware purges all cache:*/v1/products and cache:*/v1/categories keys after any successful POST/PATCH/DELETE. Invalidation is prefix-based and paginates through kv.list().',
    'deploy-cloudflare-worker.yaml runs automatically on push to main (apps/merchant/** changed). It decrypts the env artifact, runs wrangler secret bulk from secrets.json, then deploys. Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID GitHub Secrets.',
    'npm run dev:env is the recommended full-stack dev command (run from monorepo root). It starts both workspaces in parallel via Turborepo: the Merchant Worker (copies root .env to apps/merchant/.dev.vars then runs wrangler dev on localhost:8787) and the Client Vite SPA (sources root .env then runs vite on localhost:5173). Pass --base=/path to auto-adjust STORE_URL and CORS_ORIGIN for subpath testing.',
    'npm run stripe:listen is a SEPARATE command (not included in dev:env). It requires the Stripe CLI to be installed globally. It reads STRIPE_SECRET_KEY from .env and runs: stripe listen --load-from-webhooks-api --forward-to http://localhost:8787. Must be run in a second terminal alongside dev:env.',
    'npm run build:env builds all workspaces sourcing .env (used by CI). npm run build:client:env builds only the client SPA. Both resolve env vars at build time via the vite.config.ts define block.',
  ],
  buildPrompt: (src) => appendFacts(`
Below are the Wrangler configuration and the auto-generated worker-configuration.d.ts.

${src}

Task: Write a "Cloudflare Worker Patterns" reference.
Include:
1. How to access bindings in a route handler: c.env.MERCHANT, c.env.IMAGES, c.env.KV_CACHE.
2. The Durable Object pattern: why we use a single DO instance, how to get the stub,
   how to call query() and run().
3. KV cache: how kv-cache middleware works, how to invalidate cache manually.
4. R2: how product images are stored and served.
5. Secrets: what must go in Wrangler secrets vs .env file. Mailgun secrets list.
6. How to add a new binding: steps for wrangler.jsonc + worker-configuration.d.ts + Env type.
7. CI/CD: how env vars map to GitHub secrets, how create-env-artifact.yaml works, and how to expose a new var to the frontend via vite.config.ts define block.
`, topic.manualFacts),
};

export default topic;
