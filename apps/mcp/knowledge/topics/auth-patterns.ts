/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'auth-patterns',
  description: 'Backend auth middleware, RBAC guards, roles — backend + frontend',
  sources: [
    'apps/merchant/src/middleware/auth.ts',
    'apps/merchant/src/middleware/customer-auth.ts',
    'apps/merchant/src/types.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'Auth0 is the sole identity provider. RBAC (roles/permissions) is managed exclusively in the Auth0 dashboard — not in the database.',
    'Token types accepted by authMiddleware: (1) Auth0 JWT (3-part Bearer, must include the permission set in ADMIN_STORE_PERMISSION env var, default "admin:store"); (2) sk_ database API key (hashed lookup in api_keys table); (3) 64-char lowercase hex OAuth token (lookup in oauth_tokens table).',
    'AuthRole values (TypeScript type): "public" | "admin" | "oauth" | "authadmin" | "databaseadmin" | "aiadmin" | "mail" | "customer". Role is stored in c.var.auth.role after middleware runs.',
    'Available RBAC guards (all in apps/merchant/src/middleware/auth.ts): adminOnly (role="admin", Auth0 permission "admin:store"), superAdminOnly (role="authadmin", Auth0 permission "auth0:admin:api"), databaseAdminOnly (role="databaseadmin", Auth0 permission "admin:database"), aiAccessOnly (role="aiadmin", Auth0 permission "ai:api"), mailAccessOnly (role="mail", Auth0 permission "mail:api"), validJwtAuthOnly (any valid Auth0 JWT, no specific permission required). Also: requireScope(...scopes) for OAuth token scope checks.',
    'superAdminOnly is required to reach GET /v1/__auth0/token, which returns a cached Auth0 Management API token. The cache avoids hitting Auth0\'s M2M token quota.',
    'customerAuthMiddleware is for customer-facing endpoints (/v1/me/*). It validates Auth0 JWTs only (rejects sk_/pk_ keys), sets role="customer", and does NOT require any specific permission. It extracts sub, email, permissions[], and user_metadata from the JWT.',
    'On the frontend, use AuthenticationGuard (prop: component={MyComponent}) to protect a whole page (redirects to login if not authenticated). Use AuthenticationGuardWithPermission (props: permission="admin:store", children, fallback?) to conditionally show UI based on a specific Auth0 permission.',
    'hasPermission(permission) is exposed by useSecuredApi() — NOT by useAuth() directly. It checks asynchronously whether the current user\'s access token contains a specific Auth0 permission string.',
    'isAuthenticated from useAuth() is a synchronous boolean indicating whether the user is logged in.',
    'The UsersAndPermissionsPage (/admin/users-and-permissions) allows admins to manage Auth0 user permissions from the storefront UI without going to the Auth0 dashboard.',
    'The deploy-tenant-resources script (scripts/auth0/deploy-tenant-resources.ts) provisions all required Auth0 resources (application, API, permissions, actions) with minimal effort.',
  ],
  buildPrompt: (src) => appendFacts(`
Below are the authentication middleware files and the types definition.

${src}

Task: Write a unified "Authentication Patterns" reference covering both backend middleware and frontend guards.
Include:
1. The three token types accepted (Auth0 JWT, sk_ API key, OAuth hex token).
2. AuthRole values and when each role is assigned.
3. Backend: complete table of all RBAC guards, the role they check, and typical use case.
4. Backend: code example — protecting a route with authMiddleware + adminOnly.
5. Backend: code example — superAdminOnly and the /v1/__auth0/token Management API endpoint.
6. Backend: customerAuthMiddleware for customer-scoped routes.
7. Frontend: AuthenticationGuard (prop: component), AuthenticationGuardWithPermission (props: permission, children, fallback?), hasPermission() from useSecuredApi(), isAuthenticated from useAuth() — when to use each.
8. Frontend: LoginLogoutLink / LoginButton — when to use them instead of redirecting to Auth0.
9. Frontend: UsersAndPermissionsPage — how admins manage permissions without the Auth0 dashboard.
10. requireScope(...scopes) factory for OAuth-scoped routes.
`, topic.manualFacts),
};

export default topic;
