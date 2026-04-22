/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'conventions-and-anti-patterns',
  description: 'Fufuni coding conventions and forbidden patterns — naming rules, no c.req.json, no Drizzle, Zod-in-createRoute, plus AI-agent contributor guidelines.',
  tags: ["ai-agents","frontend","react","ucp","ui"],
  sources: [],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'ALWAYS add new topic files in apps/mcp/knowledge/topics/ when adding major new features. Each topic file must export a default Topic object with name, description, sources, systemPrompt, and buildPrompt. To add source files to an existing topic, edit the relevant apps/mcp/knowledge/topics/<topic-name>.ts file.',
    'ALWAYS run npm run mcp:generate:force after editing a topic file. This regenerates the .md knowledge file in mcp/. Then run npm run mcp:gen-knowledge to publish to the MCP server.',
    'DO NOT edit apps/mcp/src/knowledge.ts directly — it is auto-generated from mcp/*.md files by gen-knowledge.ts.',
    'NEVER use onClick on interactive elements — always use onPress (HeroUI/React Aria requirement).',
    'NEVER use variant="bordered" (does not exist in HeroUI v3) — use variant="outline" instead.',
    'NEVER add radius prop to Button — use Tailwind classes (rounded-none, rounded-full, etc.) in className.',
    'NEVER use useEffect to synchronize state — use React Query for server state, derive UI state from props/query data.',
    'NEVER store the Auth0 access token in localStorage or sessionStorage — the Auth0 React SDK stores it in memory.',
    'NEVER hardcode permission strings — use import.meta.env.PERMISSIONS (frontend) or the permissions array from the JWT (backend middleware).',
    'NEVER call the Auth0 Management API from the frontend without going through the getAuth0ManagementToken() helper — raw Management API tokens must not be exposed in the browser.',
    'ALWAYS wrap admin routes in AuthenticationGuardWithPermission in app.tsx — never rely only on UI hiding.',
    'ALWAYS use getDb(c.var.db) in Hono route handlers — never access c.env.MERCHANT directly in route logic.',
    'ALWAYS add new migrations to both the .sql file in apps/merchant/migrations/ AND the ensureInitialized() function in do.ts.',
    'ALWAYS add new backend environment variables to .github/workflows/create-env-artifact.yaml to ensure they are available in CI deployments.',
    'Monetary values are ALWAYS stored as integers (smallest currency unit, e.g. cents). NEVER store floats for money.',
    'Use ApiError static helpers (ApiError.notFound(), ApiError.unauthorized(), etc.) rather than throwing raw errors in route handlers.',
    'Images MUST go through the ImageUploadInput component in admin forms — never use a plain <input type="file">.',
    'All i18n keys must be added to en-US.json first (master language), then to all other locale files. NEVER use t() without a translation key that exists in en-US.json.',
    'Avoid adding fields to the Auth0 user_metadata for data that should be in the DB — user_metadata is for client-managed preferences only (wishlist, UI prefs).',
    'DO NOT use dangerouslySetInnerHTML outside of renderDescription() — all user-generated HTML has already been sanitized by the backend.',
  ],
  buildPrompt: (src) => appendFacts(`
Task: Write a "Conventions & Anti-Patterns Guide" for the Fufuni project.
Organize as two sections:
1. CONVENTIONS (what you MUST do): coding standards, naming, file placement, migration rules,
   i18n requirements, monetary storage, error handling, admin route protection.
2. ANTI-PATTERNS (what you MUST NOT do): forbidden patterns with explanation of WHY each is wrong
   and what to do instead.
Each rule should have a clear one-line heading and a 1-2 sentence explanation.
`, topic.manualFacts),
};

export default topic;
