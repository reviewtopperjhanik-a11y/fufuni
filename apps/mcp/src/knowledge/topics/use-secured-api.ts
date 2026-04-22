/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'use-secured-api',
  description: 'useSecuredApi React hook for authenticated calls — getJson, postJson, putJson, patchJson, deleteJson, postForm, plus Auth0 bearer injection.',
  tags: ["frontend","react","ui"],
  sources: [
    'apps/client/src/features/auth/components/auth-components.tsx',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'Import path: import { useSecuredApi } from "@/features/auth/components/auth-components";',
    'useSecuredApi() wraps useAuth() and automatically attaches the Auth0 Bearer token to every request — you never set Authorization headers manually.',
    'Use getJson(url) for authenticated GET requests that return JSON.',
    'Use postJson(url, body) for authenticated POST requests with a JSON body.',
    'Use putJson(url, body) for authenticated PUT (full replace) requests.',
    'Use patchJson(url, body) for authenticated PATCH (partial update) requests.',
    'Use deleteJson(url) for authenticated DELETE requests.',
    'Use postForm(url, formData) for authenticated multipart/form-data POST (e.g. image upload).',
    'Use hasPermission(permissionString) to async-check whether the current user has a specific Auth0 permission before showing/calling admin features.',
    'For unauthenticated public endpoints (e.g. product listing), use plain fetch() or a custom hook with useQuery — do NOT use useSecuredApi() for public routes.',
    'useSecuredApi() also exposes Auth0 Management API helpers (all require the authadmin role / auth0:admin:api permission): getAuth0ManagementToken(), listAuth0Users(), getUserPermissions(), addPermissionToUser(), removePermissionFromUser(), deleteAuth0User(), getResourceServers(), updateResourceServerScopes(), getResourceServerScopes(), checkResourceServerScopes().',
    'The AI-assisted features (review moderation, auto-translation) use getJson on GET /v1/ai/parameters to obtain { apiKey, model, url } then call ai-client.ts helpers directly from the browser — no backend inference call.',
  ],
  buildPrompt: (src) => appendFacts(`
Below is the auth-components.tsx file that contains the useSecuredApi() hook.

${src}

Task: Write a "useSecuredApi() Hook Reference" for frontend developers.
Include:
1. Import path.
2. Return values table: method | signature | when to use.
   Cover: getJson, postJson, putJson, patchJson, deleteJson, postForm, hasPermission.
3. How the JWT Bearer token is automatically injected.
4. Three complete usage examples in React components (one GET, one POST, one DELETE).
5. hasPermission() example: guard an admin UI element.
6. When NOT to use this hook (public routes).
7. Auth0 Management helpers exposed by the hook (brief list + use case).
`, topic.manualFacts),
};

export default topic;
