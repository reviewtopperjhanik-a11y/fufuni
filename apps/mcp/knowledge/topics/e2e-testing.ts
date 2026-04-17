/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'e2e-testing',
  description: 'Playwright E2E tests: fixtures, storage state, specs, setup scripts',
  sources: [
    'e2e/playwright.config.ts',
    'e2e/tests/public/navigation.spec.ts',
    'e2e/tests/auth/checkout.spec.ts',
    'e2e/tests/admin/admin-crud.spec.ts',
    'e2e/tests/setup/user.setup.ts',
    'e2e/tests/setup/admin.setup.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'E2E tests live in e2e/tests/. Run them with: npm run e2e (from monorepo root). Requires the dev server to be running.',
    'Three auth states are pre-created by setup scripts: storage-state.json (anonymous), storage-state-user.json (authenticated user), storage-state-admin.json (admin user).',
    'Setup scripts log in via the Auth0 Universal Login page (not the embedded modal). They use Playwright\'s page.fill() on the real Auth0 hosted pages.',
    'Test credentials come from E2E_USER_EMAIL, E2E_USER_PASSWORD, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD in .env (root). These are NOT committed.',
    'Public tests (navigation.spec.ts): use anonymous storage state. No login required.',
    'Auth tests (checkout.spec.ts): use user storage state. Tests are independent — each starts from homepage.',
    'Admin tests (admin-crud.spec.ts): use admin storage state. Each test cleans up after itself (delete created items).',
    'Playwright baseURL is set by VITE_APP_URL in .env (defaults to http://localhost:5173).',
    'playwright.config.ts defines 3 projects: setup-user, setup-admin (setup dependencies), and the main test project (depends on both setups).',
    'To add a new E2E spec: create a file under e2e/tests/<category>/<name>.spec.ts. Import the appropriate storage state fixture from e2e/fixtures/.',
  ],
  buildPrompt: (src) => appendFacts(`
Below are the Playwright config and key spec/setup files.

${src}

Task: Write an "E2E Testing Reference".
Include:
1. Project structure: folders, 3 auth states, fixture files.
2. How to run E2E tests (command, required prerequisites).
3. Auth state setup: how setup-user.ts and setup-admin.ts work, what credentials they use.
4. How to write a new spec: storage state selection, baseURL, page object pattern.
5. The 3 test categories (public, auth, admin) and their conventions.
6. Cleanup discipline: how admin tests delete created data.
7. CI integration: when E2E runs in CI, how the env vars are injected.
`, topic.manualFacts),
};

export default topic;
