/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'setup-and-initialization',
  description: 'Store setup wizard endpoint, first-run configuration, setup routes',
  sources: [
    'apps/merchant/src/routes/setup.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'POST /v1/setup/init is the first-run endpoint. It creates the initial admin user, store info, and default region/currency. Can only be called when no admin exists yet (guard: if adminExists → 409).',
    'POST /v1/setup/init body: { adminEmail, storeName, defaultCurrency, defaultCountryCode }. It calls the Auth0 Management API to invite the admin user.',
    'GET /v1/setup/status returns { initialized: boolean } — used by the frontend setup wizard to know if setup is needed.',
    'The setup wizard in the frontend (apps/client/src/pages/setup/) walks the admin through: (1) store name + currency; (2) admin email invite; (3) Auth0 tenant verify.',
    'After setup completes, POST /v1/setup/init is locked. Calling it again returns 409 Conflict.',
    'Store info (name, logo, address, support email, social links) is managed separately via GET/PUT /v1/store-info (admin) after initial setup.',
    'The setup flow also calls auth0:deploy automatically if AUTH0_MANAGEMENT_CLIENT_ID is set and the Auth0 tenant has not been configured yet.',
  ],
  buildPrompt: (src) => appendFacts(`
Below is setup.ts.

${src}

Task: Write a "Setup & Initialization Reference".
Include:
1. GET /v1/setup/status: what it returns, how the frontend uses it.
2. POST /v1/setup/init: required fields, what it creates, idempotency (409 guard).
3. Auth0 Management API interaction during setup.
4. Store info management after setup (separate endpoint).
5. Setup wizard frontend flow: the 3 steps.
6. What happens if setup is called twice.
`, topic.manualFacts),
};

export default topic;
