/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'customer-account-patterns',
  description: 'Customer profile, address book, order history, me-routes, customerAuthMiddleware',
  sources: [
    'apps/merchant/src/routes/me.ts',
    'apps/merchant/src/middleware/customer-auth.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  maxSourceChars: 4000,
  manualFacts: [
    'All /v1/me/* routes require customerAuthMiddleware which validates the Auth0 Bearer token and resolves the Auth0 sub claim to a customers.id (creating the customer row on first access).',
    'The customer row is auto-created on first authenticated request: customerAuthMiddleware calls getOrCreateCustomer(db, sub, email) which inserts if not exists.',
    'GET /v1/me returns the current customer profile (id, email, name, created_at, auth_provider_id).',
    'PATCH /v1/me updates customer profile fields: name, phone, marketing_opt_in.',
    'GET /v1/me/addresses — list addresses. POST — create. PATCH /:id — update. DELETE /:id — delete. Only the authenticated customer\'s own addresses are accessible.',
    'Each address: id, label (Home/Work/Other), first_name, last_name, line1, line2?, city, postal_code, country_code (ISO 3166-1 alpha-2), is_default.',
    'GET /v1/me/orders returns orders for the authenticated customer only (pagination: ?page=1&limit=10).',
    'GET /v1/me/saved-cart, PUT /v1/me/saved-cart, DELETE /v1/me/saved-cart manage the customer\'s persisted cart.',
    'GET /v1/me/preferences, PUT /v1/me/preferences — locale and display currency preferences.',
  ],
  buildPrompt: (src) => appendFacts(`
Below are me.ts and customer-auth.ts middleware.

${src}

Task: Write a "Customer Account Patterns Reference".
Include:
1. customerAuthMiddleware: how it validates JWTs, how it resolves/creates the customer row.
2. Auto-creation on first access: getOrCreateCustomer flow.
3. Profile endpoints: GET /v1/me, PATCH /v1/me — fields and examples.
4. Address book: full CRUD endpoint table, address schema.
5. Order history: endpoint, pagination params.
6. Saved cart endpoints.
7. Preferences: locale and currency endpoints.
8. How to add a new /v1/me/* route following the existing pattern.
`, topic.manualFacts),
};

export default topic;
