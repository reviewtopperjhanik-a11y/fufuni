/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'auth0-tenant-setup',
  description: 'Auth0 tenant deployment — auto-install script, resource-server scopes, RBAC roles, social connections, and the Auth0 Deploy CLI workflow.',
  tags: ["auth","auth0","ci","security","testing"],
  sources: [
    'scripts/auth0/deploy-tenant-resources.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'deploy-tenant-resources.ts is a one-shot setup script. Run it once to configure a new Auth0 tenant: npm run auth0:deploy (from monorepo root).',
    'It configures: (1) the SPA application client (PKCE, allowed origins/callbacks); (2) the API resource server with all permission scopes; (3) social connections (Google, GitHub); (4) the authadmin role with admin:store + auth0:admin:api scopes.',
    'The authadmin role is the admin role in Auth0. Users assigned this role can access all admin endpoints (permission: admin:store) and call the Auth0 Management API (permission: auth0:admin:api).',
    'Required env vars for the deploy script: AUTH0_DOMAIN, AUTH0_MANAGEMENT_CLIENT_ID, AUTH0_MANAGEMENT_CLIENT_SECRET, AUTH0_SPA_CLIENT_ID, AUTH0_AUDIENCE.',
    'To add a new Auth0 permission scope: (1) add it to the scopes array in deploy-tenant-resources.ts; (2) re-run npm run auth0:deploy to push the updated scopes to Auth0; (3) add it to the role grants if it should be admin-only; (4) use hasPermission("new:scope") in the frontend guard.',
    'The Management API client (AUTH0_MANAGEMENT_CLIENT_ID) is a machine-to-machine client used only by the deploy script and the backend Management API proxy. It is NOT the SPA client.',
    'Auth0 Action: the deploy script also installs a Login post-action that enriches the ID token with the user\'s permissions array. This is how import.meta.env.PERMISSIONS (frontend) matches the Auth0 scopes.',
  ],
  buildPrompt: (src) => appendFacts(`
Below is deploy-tenant-resources.ts.

${src}

Task: Write an "Auth0 Tenant Setup Reference".
Include:
1. Purpose and when to run the deploy script.
2. What it configures: SPA client, API resource server, social connections, authadmin role.
3. Required env vars for the script.
4. How to add a new permission scope: 4 steps.
5. The authadmin role: what permissions it grants, how to assign it to a user.
6. Management API client vs SPA client: the difference and which is used where.
7. The Login post-action: what it does, why it is needed for frontend permission guards.
`, topic.manualFacts),
};

export default topic;
