/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'jwt-user-metadata-patterns',
  description: 'Auth0 JWT claims, user_metadata storage, useTokenUserData, store-metadata',
  sources: [
    'apps/client/src/hooks/use-token-user-data.ts',
    'apps/client/src/lib/store-metadata.ts',
    'apps/merchant/src/lib/store-metadata.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'useTokenUserData() parses the Auth0 ID token payload and returns strongly-typed user claims: { sub, email, name, picture, permissions, roles, user_metadata }.',
    'user_metadata in Auth0 is arbitrary JSON stored per-user. The wishlist and any other client-side preferences use user_metadata as the storage backend.',
    'Store metadata (store_metadata table) is different from Auth0 user_metadata. It stores per-store settings keyed by metadata_key (string).',
    'apps/client/src/lib/store-metadata.ts: getStoreMetadata(key, getJson), setStoreMetadata(key, value, patchJson). Used by the frontend to read/write store-level config.',
    'apps/merchant/src/lib/store-metadata.ts: getMetadata(db, key), setMetadata(db, key, value). Used in route handlers for server-side store config reads.',
    'GET /v1/store-metadata/:key (admin) and PUT /v1/store-metadata/:key (admin) are the HTTP endpoints wrapping the server-side lib.',
    'Permissions array in the JWT is injected by the Auth0 Login post-action. Access via useTokenUserData().permissions or useAuth().user?.[namespace + "permissions"].',
    'Do NOT store sensitive data in user_metadata — it is readable by the client after token decode. Use store-side DB tables for sensitive per-customer state.',
  ],
  buildPrompt: (src) => appendFacts(`
Below are use-token-user-data.ts, client-side store-metadata.ts, and server-side store-metadata.ts.

${src}

Task: Write a "JWT & User Metadata Patterns Reference".
Include:
1. useTokenUserData() hook: return type, all available claims, usage example.
2. Auth0 user_metadata: what it is, how to read/write it, what to store there.
3. Store metadata: purpose, client-side helpers, server-side helpers, HTTP endpoints.
4. Permissions in the JWT: how they get there (Login action), how to read them.
5. Security note: what NOT to store in user_metadata.
`, topic.manualFacts),
};

export default topic;
