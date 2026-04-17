/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'oauth-embedded',
  description: 'Embedded OAuth2 authorization server: clients, tokens, scopes management',
  sources: [
    'apps/merchant/src/routes/oauth.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'The embedded OAuth2 server (routes/oauth.ts) is NOT the primary Auth0 authentication. It provides machine-to-machine tokens for third-party integrations or merchant API access.',
    'Endpoints: POST /v1/oauth/token (client_credentials grant), GET /v1/oauth/clients (admin), POST /v1/oauth/clients (admin, create client), DELETE /v1/oauth/clients/:id (admin).',
    'Client credentials: client_id + client_secret (bcrypt-hashed) stored in oauth_clients table. client_secret is returned ONCE at creation and never stored in plaintext.',
    'POST /v1/oauth/token body: { grant_type: "client_credentials", client_id, client_secret, scope? }. Response: { access_token, token_type: "Bearer", expires_in, scope }.',
    'Tokens are signed JWTs (HS256) using the OAUTH_JWT_SECRET Wrangler secret. TTL: 3600 s by default.',
    'Scope validation: requested scopes must be a subset of scopes granted to the oauth_client record. Available scopes: read:products, write:products, read:orders, write:orders, read:customers.',
    'OAuth tokens are verified by oauthMiddleware (separate from customerAuthMiddleware). Routes can accept EITHER an Auth0 Bearer token OR an OAuth Bearer token.',
  ],
  buildPrompt: (src) => appendFacts(`
Below is oauth.ts.

${src}

Task: Write an "Embedded OAuth2 Server Reference".
Include:
1. Purpose: why this exists alongside Auth0.
2. Client registration: admin endpoint, fields, how client_secret is handled.
3. Token request: full request/response example (curl), grant type.
4. Token verification: how oauthMiddleware works, which routes accept OAuth tokens.
5. Scope system: available scopes, how they restrict access.
6. Token structure: JWT claims, TTL, signing algorithm.
7. Required Wrangler secret: OAUTH_JWT_SECRET.
`, topic.manualFacts),
};

export default topic;
