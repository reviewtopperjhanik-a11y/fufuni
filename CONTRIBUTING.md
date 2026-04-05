# Contributing to Fufuni

Thank you for your interest! Fufuni is an open-source e-commerce framework
that runs entirely on free-tier cloud services.

## Quick Start

1. Fork the repository
2. `npm install` at the root (npm workspaces)
3. Copy `_sensitive_datas/wrangler.example.toml` → `apps/merchant/wrangler.toml`
4. Fill in your Auth0, Stripe, Mailgun credentials
5. `npm run dev` — starts the Cloudflare Worker locally + Vite SPA

## Architecture Decision Records (ADR)

| Decision | Choice | Why |
|---|---|---|
| Edge runtime | Cloudflare Workers | Zero cold start, free tier, Durable Objects |
| HTTP framework | Hono | Native Workers support, OpenAPI built-in |
| Database | Durable Objects SQLite | Per-tenant isolation, no external DB |
| UI library | HeroUI v3 | Full Tailwind theming, accessible, Drawer/Modal |
| Auth | Auth0 | Free tier, passwordless, social providers |
| Commerce protocol | UCP | AI-agent interoperability standard |

## How to Add a Feature

1. Read the relevant guide in `/mcp/` (e.g., `how-to-add-hono-route.md`)
2. Add a migration in `apps/merchant/migrations/NNN-description.sql`
3. Update `SCHEMA` in `apps/merchant/src/do.ts` (DDL definition) **and** `ensureInitialized()` (inline migration array)
4. Add route in `apps/merchant/src/routes/`
5. Add tests in `apps/merchant/src/routes/__tests__/`
6. Update `/mcp/` documentation if needed (run `npx tsx scripts/generate-static-mcp-response.ts`)

## CI / Deploy

| Workflow | Trigger | Purpose |
|---|---|---|
| `pages.yaml` | Push to `main` | Deploys SPA → GitHub Pages |
| `deploy-cloudflare-worker.yaml` | Push to `main` | Deploys Worker to Cloudflare |
| `deploy-mcp.yaml` | Push to `main` | Deploys MCP server |
| `ci.yml` | Pull requests | TypeScript typecheck + ESLint |
| `reset-demo.yaml` | Manual / scheduled | Resets and re-seeds live demo |
| `seed.yaml` | Manual | Seeds demo data |

## Code Style

- TypeScript strict mode — no `any` without justification comment
- HeroUI components: always `onPress` (not `onClick`), `radius="none"` for luxury theme
- DRY: extract shared logic to `apps/merchant/src/lib/`
- Migrations: additive only (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN`)
- All database schema changes require **three** simultaneous updates:
  1. `SCHEMA` constant in `do.ts`
  2. `ensureInitialized()` inline migration array in `do.ts`
  3. Numbered SQL file in `apps/merchant/migrations/`

## Reporting Issues

Please open a GitHub Issue with:
- A clear description of the bug or feature request
- Steps to reproduce (for bugs)
- Expected vs actual behaviour
