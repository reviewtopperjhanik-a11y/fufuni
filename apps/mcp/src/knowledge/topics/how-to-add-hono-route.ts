/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'how-to-add-hono-route',
  description: 'Step-by-step pattern for adding a new OpenAPIHono route — Zod schemas, public vs admin split (publicApp + adminApp export), and RBAC guards.',
  tags: ["api","backend","hono"],
  sources: [
    'apps/merchant/src/routes/categories.ts',
    'apps/merchant/src/types.ts',
    'apps/merchant/src/db.ts',
    'apps/merchant/src/index.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'Route files export two named OpenAPIHono instances: publicXxx (no auth) and adminXxx (uses authMiddleware). Example: export { publicApp as publicCategories, adminApp as adminCategories }.',
    'Never use c.req.json() directly — always declare the body schema inside createRoute() and read it with c.req.valid("json").',
    'Zod schemas are defined in apps/merchant/src/schemas/ and imported into route files, never declared inline.',
    'Read-only queries use db.query<T>(); mutations use db.run(). Both return Promises.',
    'The KV cache is automatically invalidated for /v1/categories/* and /v1/products/* — no manual action required after a mutation on those resources.',
    'Public routes are registered BEFORE authMiddleware in index.ts. Admin routes are registered after.',
    'Public API keys (pk_) are accepted on public routes; secret keys (sk_) and Auth0 JWTs are accepted on admin routes after authMiddleware.',
    'Available RBAC guards to import from ../middleware/auth: adminOnly, superAdminOnly, databaseAdminOnly, aiAccessOnly, mailAccessOnly, validJwtAuthOnly.',
  ],
  buildPrompt: (src) => appendFacts(`
Below are the categories route (full example), types.ts, db.ts, and index.ts.

${src}

Task: Write a "How to Add a New API Route" guide.
Include:
1. File to create: apps/merchant/src/routes/my-feature.ts
2. The minimal boilerplate (imports, OpenAPIHono instance, createRoute, handler).
3. How to split public vs admin endpoints (publicApp + adminApp export pattern).
4. How to use getDb() to run queries.
5. How to use ApiError for error responses.
6. How to register the route in index.ts (public before auth, admin after).
7. The complete list of available RBAC guards and when to use each.
8. A complete worked example: a "tags" endpoint with GET / (list, public) + POST / (create, adminOnly).
Show full TypeScript code.
`, topic.manualFacts),
};

export default topic;
