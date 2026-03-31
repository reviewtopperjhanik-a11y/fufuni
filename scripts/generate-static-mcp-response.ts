#!/usr/bin/env npx tsx
/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 *
 * generate-static-mcp-response.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates static knowledge-base files in `mcp/` that will later be served
 * by a remote MCP (Model Context Protocol) server running on Cloudflare Workers.
 *
 * PURPOSE
 * -------
 * An MCP server exposes "tools" that an AI assistant can call to get focused,
 * structured context about a codebase. Instead of dumping the whole source into
 * every AI prompt, the assistant asks for exactly what it needs:
 *   - "How do I add a DB migration in Fufuni?"
 *   - "Show me the useSecuredApi() usage pattern."
 *   - "What tables exist in the Durable Object schema?"
 *
 * This script reads the project's real source files, calls an AI to summarise
 * and explain each topic in a structured way, then writes one Markdown file per
 * topic into `mcp/`.  Those files become the static responses the MCP server
 * will return without needing runtime AI calls (free Cloudflare Worker tier).
 *
 * USAGE
 * -----
 *   npx tsx scripts/generate-static-mcp-response.ts [--topic=<name>] [--dry-run]
 *
 *   --topic=<name>   Only regenerate a single topic (use the file stem, e.g. migrations)
 *   --dry-run        Print prompts without calling the AI or writing files
 *   --skip-ai        Build files from extracted source only, no AI call
 *   --force          Overwrite existing files (by default, existing files are skipped)
 *   --discover-models  Ignore AI_MODEL env var and force model auto-discovery via GET /models,
 *                    even when AI_MODEL is set.  Useful to test which models are available.
 *   --verbose        Show token counts and full AI responses
 *
 * RESTARTABLE
 * -----------
 * The script is safe to restart at any time:
 *   - Files that already exist and contain valid AI output are skipped automatically.
 *   - Only files that contain the failure marker
 *     "AI generation failed. Raw source below." are re-queued for regeneration.
 *   - Use --force to unconditionally overwrite ALL existing files.
 *
 * ENVIRONMENT VARIABLES (loaded from root .env)
 * -----------------------------------------------
 *   AI_API_KEY   Comma-separated list of API keys (Groq format: gsk_…).
 *                Keys are rotated in round-robin order across all AI calls
 *                to distribute load evenly and avoid per-key rate limits.
 *   AI_MODEL     (optional) Pin a specific model ID, e.g. llama-3.3-70b-versatile.
 *                When omitted the script calls GET /models on the Groq endpoint,
 *                filters for active chat-capable models (context ≥ 8192 tokens),
 *                sorts them by context window, and rotates through them in
 *                round-robin order alongside the API keys.
 *   AI_API_URL   Base URL for the OpenAI-compatible API (default: Groq endpoint)
 *
 * HOW THE AI CALLS WORK
 * ----------------------
 * Each topic defines:
 *   - A list of source files to read and include as raw context.
 *   - A `systemPrompt` that tells the AI its role and output format.
 *   - A `userPrompt` function that injects the source content.
 *
 * The AI is asked to produce concise, structured Markdown with code examples.
 * The output is written verbatim to `mcp/<topic>.md`.
 *
 * TOKEN BUDGET
 * ────────────
 * openai/gpt-oss-20b on Groq has ~32k token context.  We target ≤ 8000 tokens
 * of input per call (source excerpts + prompt overhead) to leave room for the
 * model's reasoning.  Source files are truncated with a configurable MAX_SOURCE_CHARS
 * constant if they exceed this budget.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── resolve project root ────────────────────────────────────────────────────
// __dirname is not available in ESM; we derive it from import.meta.url.
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = resolve(__dirname, '..'); // repository root

// ─── CLI flags ────────────────────────────────────────────────────────────────
const argv          = process.argv.slice(2);
const topicFlag     = argv.find(a => a.startsWith('--topic='))?.split('=')[1];
const dryRun        = argv.includes('--dry-run');
const skipAI        = argv.includes('--skip-ai');
const force         = argv.includes('--force');
const discoverModels = argv.includes('--discover-models');
const verbose       = argv.includes('--verbose');

// ─── load .env from project root ────────────────────────────────────────────
// We do a minimal manual parse rather than importing dotenv to keep this script
// self-contained.
function loadDotenv(envPath: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync(envPath)) return env;
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    // Strip optional surrounding quotes from values
    let value = line.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const dotenv = loadDotenv(join(ROOT, '.env'));

// Merge .env values into process.env so the rest of the script can use them.
for (const [k, v] of Object.entries(dotenv)) {
  if (!process.env[k]) process.env[k] = v;
}

// ─── AI configuration ────────────────────────────────────────────────────────

// ─── round-robin state ───────────────────────────────────────────────────────

/**
 * Monotonically increasing counter for API key round-robin.
 * Incremented by nextApiKey() after each call.
 */
let keyIndex = 0;

/**
 * Return the next API key using strict round-robin rotation across the
 * comma-separated AI_API_KEY list.  Every key is used once before any key is
 * reused, giving the most uniform distribution of requests across rate-limit
 * buckets.
 */
function nextApiKey(): string {
  const raw  = process.env.AI_API_KEY ?? '';
  if (!raw) throw new Error('AI_API_KEY is not set. Add it to your .env file.');
  const keys = raw.split(',').map(k => k.trim()).filter(Boolean);
  const key  = keys[keyIndex % keys.length];
  keyIndex++;
  return key;
}

const AI_API_URL = process.env.AI_API_URL ?? 'https://api.groq.com/openai/v1';

// Conservative limit: keeps input prompt small enough for the 32k-token models
// on Groq.  8000 chars ≈ 2000 tokens; leaves ≥ 80% of context for the output.
const MAX_SOURCE_CHARS = 8_000;

// ─── model discovery ─────────────────────────────────────────────────────────

/** Shape returned by GET /openai/v1/models on Groq and other OAI-compatible APIs. */
type GroqModel = {
  id:                    string;
  object:                'model';
  created:               number;
  owned_by:              string;
  active:                boolean;
  context_window:        number;
  max_completion_tokens?: number;
};

/** Minimum context window (tokens) required to qualify as a text-generation model. */
const MIN_CONTEXT_WINDOW = 8_192;

/**
 * Patterns that identify non-text models (audio transcription, TTS, vision-only,
 * content-guard, etc.).  Matched case-insensitively against the model ID.
 */
const EXCLUDED_MODEL_PATTERNS = /whisper|distil-whisper|playai|guard|tts|speech/i;

/**
 * Ordered list of usable model IDs populated by initModels() at startup.
 * Sorted by context_window descending so the most capable models are preferred.
 * When empty, nextModel() falls back to AI_MODEL env var or the hard-coded default.
 */
let modelPool: string[] = [];

/** Monotonically increasing counter for model round-robin. */
let modelIndex = 0;

/**
 * Return the next model using strict round-robin rotation across modelPool.
 * Falls back to the AI_MODEL env var (or Groq's flagship default) when the pool
 * is empty (e.g. discovery failed, --skip-ai mode, or non-Groq endpoint).
 */
function nextModel(): string {
  if (modelPool.length > 0) {
    const m = modelPool[modelIndex % modelPool.length];
    modelIndex++;
    return m;
  }
  return process.env.AI_MODEL ?? 'openai/gpt-oss-20b';
}

/**
 * Query the /models endpoint once at startup to build the modelPool.
 *
 * Behaviour:
 *   - If AI_MODEL is set in the environment, pin to that single model and skip
 *     the API call entirely (explicit override wins).
 *   - Otherwise call GET <AI_API_URL>/models with the first available API key.
 *   - Filter results: active=true, context_window >= MIN_CONTEXT_WINDOW,
 *     id does not match EXCLUDED_MODEL_PATTERNS.
 *   - Sort survivors by context_window descending.
 *   - On any failure (network error, bad HTTP status, empty result) fall back
 *     gracefully to the hard-coded default without aborting the script.
 */
async function initModels(): Promise<void> {
  if (process.env.AI_MODEL && !discoverModels) {
    modelPool = [process.env.AI_MODEL];
    console.log(`Model      : ${modelPool[0]} (pinned via AI_MODEL; use --discover-models to override)`);
    return;
  }

  // Peek at key[0] without advancing keyIndex for subsequent callAI() calls.
  const raw     = process.env.AI_API_KEY ?? '';
  const keys    = raw.split(',').map(k => k.trim()).filter(Boolean);
  const apiKey  = keys[0] ?? '';

  const url = `${AI_API_URL}/models`;
  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn(`  [warn] GET /models returned ${res.status}: ${body.slice(0, 200)}. Falling back to default model.`);
      modelPool = [process.env.AI_MODEL ?? 'openai/gpt-oss-20b'];
      return;
    }
    const data    = await res.json() as { data: GroqModel[] };
    const usable  = (data.data ?? [])
      .filter(m => m.active)
      .filter(m => (m.context_window ?? 0) >= MIN_CONTEXT_WINDOW)
      .filter(m => !EXCLUDED_MODEL_PATTERNS.test(m.id))
      .sort((a, b) => (b.context_window ?? 0) - (a.context_window ?? 0));

    if (usable.length === 0) {
      console.warn('  [warn] No suitable models found via GET /models. Using default.');
      modelPool = [process.env.AI_MODEL ?? 'openai/gpt-oss-20b'];
    } else {
      modelObjects = usable;
      modelPool    = usable.map(m => m.id);

      // ── formatted table ──────────────────────────────────────────────────
      const colId  = Math.max(8, ...usable.map(m => m.id.length));
      const colOwn = Math.max(5, ...usable.map(m => m.owned_by.length));
      const header =
        `  ${'#'.padStart(2)}  ${'Model'.padEnd(colId)}  ${'Owner'.padEnd(colOwn)}  ${'Context'.padStart(9)}  ${'Max out'.padStart(9)}`;
      const sep = `  ${'─'.repeat(2)}  ${'─'.repeat(colId)}  ${'─'.repeat(colOwn)}  ${'─'.repeat(9)}  ${'─'.repeat(9)}`;
      console.log(`\nModels available (${usable.length}):`);
      console.log(header);
      console.log(sep);
      usable.forEach((m, i) => {
        const maxOut = m.max_completion_tokens != null
          ? m.max_completion_tokens.toLocaleString('en')
          : '—';
        console.log(
          `  ${String(i + 1).padStart(2)}  ${m.id.padEnd(colId)}  ${m.owned_by.padEnd(colOwn)}  ${m.context_window.toLocaleString('en').padStart(9)}  ${maxOut.padStart(9)}`
        );
      });
      console.log();
    }
  } catch (err) {
    console.warn(`  [warn] Failed to query /models: ${(err as Error).message}. Using default.`);
    modelPool = [process.env.AI_MODEL ?? 'openai/gpt-oss-20b'];
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Read a file relative to the project root. Returns '' if not found. */
function readSrc(relativePath: string): string {
  const abs = join(ROOT, relativePath);
  try {
    return readFileSync(abs, 'utf8');
  } catch {
    console.warn(`  [warn] could not read ${relativePath}`);
    return '';
  }
}

/**
 * Truncate a string to maxChars, adding a `…[truncated]` marker if needed.
 * Truncation happens at a newline boundary when possible.
 */
function truncate(text: string, maxChars = MAX_SOURCE_CHARS): string {
  if (text.length <= maxChars) return text;
  const cut = text.lastIndexOf('\n', maxChars);
  return text.slice(0, cut > 0 ? cut : maxChars) + '\n…[truncated for token budget]';
}

/** Rough token estimator: ~1 token per 4 chars (GPT-4 heuristic). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Call the AI API with a system + user prompt.
 * Returns the assistant's response text.
 *
 * The function picks a fresh API key for each call so that if you are
 * regenerating multiple topics in a row, you automatically rotate keys.
 *
 * @param systemPrompt  High-level instructions to the model (role, output format).
 * @param userPrompt    The actual question / source context to summarise.
 * @param maxTokens     Maximum output size (defaults to 4096).
 */
async function callAI(
  systemPrompt: string,
  userPrompt:   string,
  maxTokens = 4096,
  model = nextModel(),
): Promise<{ content: string; tokensIn: number; tokensOut: number }> {
  const apiKey = nextApiKey();
  const url    = `${AI_API_URL}/chat/completions`;

  if (verbose) {
    console.log(`  [ai] model=${model} endpoint=${AI_API_URL}`);
    console.log(`  [ai] input tokens ≈ ${estimateTokens(systemPrompt + userPrompt)}`);
  }

  const body = {
    model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API error ${response.status}: ${errorText}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const content   = data.choices?.[0]?.message?.content ?? '';
  const tokensIn  = data.usage?.prompt_tokens     ?? estimateTokens(systemPrompt + userPrompt);
  const tokensOut = data.usage?.completion_tokens ?? estimateTokens(content);

  if (verbose) {
    console.log(`  [ai] output tokens ≈ ${tokensOut}`);
  }
  return { content, tokensIn, tokensOut };
}

// ─── output directory ─────────────────────────────────────────────────────────
const MCP_DIR = join(ROOT, 'mcp');
if (!dryRun) {
  mkdirSync(MCP_DIR, { recursive: true });
}

/**
 * Build the HTML comment header that is prepended to every generated file.
 * When AI metadata is provided the comment includes model, token counts and
 * the API endpoint so readers can trace exactly how the file was produced.
 */
function buildHeader(meta?: {
  model:      string;
  tokensIn:   number;
  tokensOut:  number;
}): string {
  if (!meta) {
    return `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`;
  }
  return `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
  model:        ${meta.model}
  tokens_in:    ${meta.tokensIn}
  tokens_out:   ${meta.tokensOut}
  api_endpoint: ${AI_API_URL}
-->
`;
}

// ─── topic definitions ────────────────────────────────────────────────────────
/**
 * Each topic produces one Markdown file in mcp/.
 *
 * Fields:
 *   name         File stem (mcp/<name>.md)
 *   description  One-line description shown in logs
 *   sources      Relative paths of source files to include verbatim in the prompt
 *   systemPrompt Role / format instructions for the AI
 *   buildPrompt  Function that receives the collected source text and returns the
 *                full user prompt sent to the AI.
 *   staticHeader  Optional header prepended to the file BEFORE the AI response.
 *                 Use this to add a YAML-like metadata block, a warning note, etc.
 *   manualFacts   Curated facts that the AI must incorporate into the document.
 *                 These are things the AI cannot deduce from source code alone:
 *                 architectural decisions, naming conventions, anti-patterns,
 *                 deployment constraints, etc.
 *                 Format: plain English bullet points as an array of strings.
 *                 They are injected into the user prompt under a
 *                 "## Verified facts" heading so the AI gives them priority.
 *   staticAppend  Verbatim Markdown appended AFTER the AI-generated section.
 *                 Use this for content that should never be reformulated:
 *                 exact code snippets, reference tables, CLI commands.
 *                 When sources and buildPrompt are both absent, the staticAppend
 *                 is written directly without any AI call.
 */
type Topic = {
  name:          string;
  description:   string;
  sources:       string[];
  systemPrompt:  string;
  buildPrompt:   (sources: string) => string;
  staticHeader?: string;
  /** Curated facts injected verbatim into the AI prompt for priority inclusion. */
  manualFacts?:  string[];
  /** Verbatim Markdown appended after the AI section (never reformulated). */
  staticAppend?: string;
};

// ── Shared system prompt fragment reused across topics ──────────────────────
const BASE_SYSTEM = `You are a senior TypeScript developer documenting the Fufuni e-commerce framework.
Fufuni runs on Cloudflare Workers + Durable Objects (SQLite) for the backend (Hono + Zod-OpenAPI)
and React 19 + Vite + HeroUI v3 for the frontend.
Write concise, structured Markdown with TypeScript/SQL code examples.
Always use fenced code blocks with language tags (typescript, sql, etc.).
Target audience: junior developers contributing to or customising this framework.
Output ONLY the Markdown content — no preamble like "Here is the documentation:", no trailing notes.
When "## Verified facts" are provided, treat them as ground truth — they override any contradicting
inference from source code.`;

/**
 * Helper: append the manualFacts block to a user prompt when facts are provided.
 * Keeps individual buildPrompt functions clean — they don't need to know about facts.
 */
function appendFacts(prompt: string, facts?: string[]): string {
  if (!facts || facts.length === 0) return prompt;
  const block = facts.map(f => `- ${f}`).join('\n');
  return `${prompt}\n\n## Verified facts (treat as authoritative)\n${block}`;
}

// ─────────────────────────────────────────────────────────────────────────────
const TOPICS: Topic[] = [

  // ── 1. Framework overview ───────────────────────────────────────────────────
  {
    name: 'framework-overview',
    description: 'High-level architecture, file tree, stack summary',
    sources: [
      'README.md',
      'apps/merchant/src/index.ts',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'The monorepo has three main workspaces: apps/client (React SPA), apps/merchant (Hono Worker + Durable Object), apps/cloudflare-worker.',
      'The entire backend runs inside a single Durable Object (MerchantDO) so that all SQL is executed in one JS isolate — no connection pools, no latency.',
      'Public API keys are prefixed pk_; admin/secret keys are prefixed sk_. Never expose sk_ keys to the frontend.',
      'All database schema changes must be applied in THREE places simultaneously: SCHEMA constant in do.ts, ensureInitialized() in do.ts, and a new numbered SQL file in apps/merchant/migrations/.',
      'Auth0 is the sole identity provider. RBAC is managed via Auth0 permissions on the access token, not in the database.',
      'The frontend navbar items and their visibility are driven by siteConfig() in apps/client/src/config/site.ts — each navItem has a permissions[] array. Add a new page by adding an entry there.',
      'Fufuni is designed to run 100% free: Cloudflare Workers free tier (100k req/day), Durable Object SQLite (included), R2 free tier (10 GB/month), KV free tier (100k reads/day), Auth0 free tenant (7500 MAU), GitHub Pages for the frontend, and Mailgun 3000 emails/month. No credit card required.',
      'Three GitHub Actions workflows automate the full deployment: (1) deploy-cloudflare-worker.yaml (push to main → Worker deploy, needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID secrets); (2) pages.yaml (push to main → GitHub Pages frontend deploy); (3) reset-demo.yaml (manual/scheduled → resets and re-seeds the live demo).',,
    ],
    buildPrompt: (src) => appendFacts(`
Below is the root README and the Hono application entry point of the Fufuni framework.

${src}

Task: Write a "Framework Overview" reference document for the MCP knowledge base.
Include:
1. A one-paragraph project description.
2. A "Stack" table (layer | technology | notes).
3. A "Monorepo structure" section with the key directories and their purpose.
4. A "Request lifecycle" section explaining how a request flows from client → CF Worker → Durable Object → SQLite.
5. A "Key conventions" bullet list (naming, error handling, auth, i18n).
Keep it under 600 words. Use Markdown headings level 2 (##) and 3 (###).
`),
  },

  // ── 2. DB schema ───────────────────────────────────────────────────────────
  {
    name: 'db-schema',
    description: 'Durable Object SQL schema — all tables and columns',
    sources: [
      'apps/merchant/src/do.ts',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    buildPrompt: (src) => `
Below is the source of the Durable Object class (do.ts).  It contains the SCHEMA
constant with the full DDL for all SQLite tables, and the ensureInitialized() method
that applies runtime migrations.

${src}

Task: Write a "Database Schema Reference" document.
Include:
1. A brief explanation of how the Durable Object pattern works (SCHEMA + ensureInitialized).
2. For every table found in the DDL, produce a sub-section "### tableName" with:
   - Column list (name | type | notes) as a table.
   - Any relevant indexes or constraints.
3. An "Entity Relationship" section with a plain-text ERD showing which tables
   reference others via foreign keys.
Do not include any DDL code — summarise in tables and prose only.
`,
  },

  // ── 3. How to add a migration ──────────────────────────────────────────────
  {
    name: 'how-to-add-migration',
    description: 'Step-by-step guide: add a DB migration to do.ts + SQL file',
    sources: [
      'apps/merchant/src/do.ts',
      'apps/merchant/migrations/027-categories.sql',
      'apps/merchant/migrations/028_product_reviews.sql',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'Every schema change MUST be applied in three places: (1) the SCHEMA constant in do.ts — full DDL with CREATE TABLE IF NOT EXISTS; (2) a migration block in ensureInitialized() in do.ts that uses a migrations table to track what has already been applied; (3) a numbered SQL file in apps/merchant/migrations/ for forward-compatibility tooling.',
      'Migration files are named NNN-description.sql where NNN is a zero-padded 3-digit integer (e.g. 034-add-tags.sql). The current highest migration is 033.',
      'The migration record name stored in the migrations table must match the SQL file stem exactly (e.g. "033-order-email-settings-add-pending-paid").',
      'ensureInitialized() is synchronous (no await) because Durable Object SQL is synchronous. Use this.sql.exec() directly, not db.run().',
      'Always use IF NOT EXISTS on CREATE TABLE and CREATE INDEX to make migrations idempotent.',
      'Column types: use TEXT for UUIDs and ISO dates, INTEGER for booleans (0/1) and cents, REAL for percentages and ratings.',
    ],
    buildPrompt: (src) => appendFacts(`
Below are:
1. The do.ts file showing the ensureInitialized() migration pattern.
2. Two example migration SQL files (027 and 028).

${src}

Task: Write a "How to Add a Database Migration" guide.
Include:
1. When to use a migration (vs editing the SCHEMA constant directly).
2. Exact numbered steps:
   a. Create the SQL file in apps/merchant/migrations/ with the correct numbering convention.
   b. Add the migration block in ensureInitialized() inside do.ts (show the exact code template with comments).
   c. Add the full DDL to the SCHEMA constant in do.ts.
3. A complete worked example creating a hypothetical "tags" table (all 3 files).
4. Common pitfalls (IF NOT EXISTS, idempotency, column types, migration name must match file stem).
`),
  },

  // ── 4. How to add a Hono route ─────────────────────────────────────────────
  {
    name: 'how-to-add-hono-route',
    description: 'Pattern for adding a new OpenAPIHono route with Zod validation',
    sources: [
      'apps/merchant/src/routes/categories.ts',
      'apps/merchant/src/types.ts',
      'apps/merchant/src/db.ts',
      'apps/merchant/src/index.ts',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'Route files export two named OpenAPIHono instances: publicXxx (no auth) and adminXxx (uses authMiddleware). Example: export { publicApp as publicCategories, adminApp as adminCategories }.',
      'Never use c.req.json() directly — always declare the body schema inside createRoute() and read it with c.req.valid("json").',
      'Zod schemas are defined in apps/merchant/src/schemas/ and imported into route files, never declared inline.',
      'Read-only queries use db.query<T>(); mutations use db.run(). Both return Promises.',
      'The KV cache is automatically invalidated for /v1/categories/* and /v1/products/* — no manual action required after a mutation on those resources.',
      'Public routes are registered BEFORE authMiddleware in index.ts. Admin routes are registered after.',
      'Public API keys (pk_) are accepted on public routes; secret keys (sk_) and Auth0 JWTs are accepted on admin routes after authMiddleware.',
      'Available RBAC guards to import from ../middleware/auth: adminOnly, superAdminOnly, databaseAdminOnly, aiAccessOnly, mailAccessOnly, validJwtAuthOnly.',
    ],
    buildPrompt: (src) => appendFacts(`
Below are the categories route (full example), types.ts, db.ts, and index.ts.

${src}

Task: Write a "How to Add a New API Route" guide.
Include:
1. File to create: apps/merchant/src/routes/my-feature.ts
2. The minimal boilerplate (imports, OpenAPIHono instance, createRoute, handler).
3. How to split public vs admin endpoints (publicApp + adminApp export pattern).
4. How to use getDb() to run queries.
5. How to use ApiError for error responses.
6. How to register the route in index.ts (public before auth, admin after).
7. The complete list of available RBAC guards and when to use each.
8. A complete worked example: a "tags" endpoint with GET / (list, public) + POST / (create, adminOnly).
Show full TypeScript code.
`),
  },

  // ── 5. Authentication patterns ────────────────────────────────────────────
  {
    name: 'auth-patterns',
    description: 'Backend auth middleware, RBAC guards, roles — backend + frontend',
    sources: [
      'apps/merchant/src/middleware/auth.ts',
      'apps/merchant/src/middleware/customer-auth.ts',
      'apps/merchant/src/types.ts',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'Auth0 is the sole identity provider. RBAC (roles/permissions) is managed exclusively in the Auth0 dashboard — not in the database.',
      'Token types accepted by authMiddleware: (1) Auth0 JWT (3-part, requires admin:store permission); (2) sk_ database API key; (3) 64-char hex OAuth token.',
      'Available RBAC guards (all in apps/merchant/src/middleware/auth.ts): adminOnly (requires role=admin or roles includes "admin"), superAdminOnly (requires authadmin / Auth0 admin), databaseAdminOnly (databaseadmin), aiAccessOnly (aiadmin), mailAccessOnly (mail), validJwtAuthOnly (any valid JWT, no permission required).',
      'superAdminOnly is required to reach GET /v1/__auth0/token, which returns a cached Auth0 Management API token. The cache avoids hitting Auth0\'s M2M token quota.',
      'customerAuthMiddleware is for customer-facing endpoints (/v1/me/*). It validates the JWT but does NOT require admin:store — any authenticated user is allowed.',
      'On the frontend, use AuthenticationGuard to protect a whole page/component (redirects to login if not authenticated). Use AuthenticationGuardWithPermission to conditionally show UI based on a specific Auth0 permission.',
      'On the frontend, LoginModal provides a local (no Auth0 redirect) modal with email/passwordless and social login options.',
      'hasPermission(permission) from useAuth() checks asynchronously whether the current user\'s token contains a specific Auth0 permission string.',
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
7. Frontend: AuthenticationGuard, AuthenticationGuardWithPermission, hasPermission(), isAuthenticated — when to use each.
8. Frontend: LoginModal — when to use it instead of redirecting to Auth0.
9. Frontend: UsersAndPermissionsPage — how admins manage permissions without the Auth0 dashboard.
`),
  },

  // ── 6. useSecuredApi frontend hook ────────────────────────────────────────
  {
    name: 'use-secured-api',
    description: 'Frontend hook: getJson, postJson, patchJson, deleteJson, postForm, putJson',
    sources: [
      'apps/client/src/features/auth/components/auth-components.tsx',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
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
      'useSecuredApi() also exposes Auth0 Management API helpers: getAuth0ManagementToken(), listAuth0Users(), getUserPermissions(), addPermissionToUser(), removePermissionFromUser(). These require the authadmin role.',
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
`),
  },

  // ── 7. i18n patterns ──────────────────────────────────────────────────────
  {
    name: 'i18n-patterns',
    description: 'react-i18next usage, adding translations in all 6 locales',
    sources: [
      'apps/client/src/i18n.ts',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    buildPrompt: (src) => `
Below is the i18n configuration file.

${src}

Task: Write an "Internationalisation (i18n) Reference" for frontend developers.
Include:
1. The 6 supported locales (en-US, fr-FR, es-ES, zh-CN, ar-SA, he-IL) and where
   the locale JSON files live.
2. How to add a new translation key:
   a. Which files to edit.
   b. JSON structure (flat keys, interpolation syntax).
3. How to use the hook in a component: useTranslation(), t('key'), t('key', {count}).
4. How to handle RTL languages (ar-SA, he-IL) in layout.
5. A worked example: adding a new "product tags" feature with 3 translation keys.
`,
  },

  // ── 8. API error patterns ─────────────────────────────────────────────────
  {
    name: 'api-error-patterns',
    description: 'ApiError class, static helpers, error response format',
    sources: [
      'apps/merchant/src/types.ts',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    buildPrompt: (src) => `
Below is types.ts which contains the ApiError class.

${src}

Task: Write an "API Error Handling Reference".
Include:
1. The ApiError class static helpers table: method | HTTP status | use case.
2. How Hono converts thrown ApiError into JSON responses.
3. Code examples for each common error type (notFound, unauthorized, forbidden,
   conflict, invalidRequest, insufficientInventory, internalServerError).
4. How to create custom error messages with ApiError.
5. Frontend: how to handle API errors from useSecuredApi() callers.
`,
  },

  // ── 9. Frontend React patterns ────────────────────────────────────────────
  {
    name: 'frontend-react-patterns',
    description: 'React 19 patterns: React Query, HeroUI v3, routing, hooks, navbar, theme',
    sources: [
      'apps/client/src/app.tsx',
      'apps/client/src/provider.tsx',
      'apps/client/src/config/site.ts',
      'apps/client/src/components/navbar.tsx',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'The UI uses HeroUI v3 (not v2). Import from "@heroui/react". Use compound component syntax: <Dropdown.Trigger>, <Card.Header>, etc.',
      'Adding a new page requires two steps: (1) create the page component in apps/client/src/pages/; (2) add it to the router in app.tsx; (3) optionally add a navItem entry in apps/client/src/config/site.ts with a permissions[] array to control visibility.',
      'The navbar (apps/client/src/components/navbar.tsx) reads siteConfig().navItems and shows/hides items using AuthenticationGuardWithPermission based on the permissions[] array on each item.',
      'The ThemeSwitch component (apps/client/src/shared/ui/navigation/theme-switch.tsx) is already included in the navbar. Users can switch between light/dark and custom themes. Theme config is stored in the store_themes DB table.',
      'Feature folder structure: apps/client/src/features/<feature-name>/components/, hooks/, index.ts. Export public API from index.ts only.',
      'New React hooks go in apps/client/src/hooks/ if they are page-agnostic, or in the feature folder if feature-specific.',
      'The LoginModal component handles both email/passwordless and social login. Show it instead of redirecting when you want the user to stay on the current page after login.',
      'Reusable display components (apps/client/src/components/): ProductCard (compact list card), ProductCardFull (detail view with variant selector, tax info), ProductImage (square image with fallback and variant-count badge), ProductReviews (review list + gated write form), CategoryBentoGrid (category landing 5-tile bento layout), ProductCarousel (horizontal snap-scroll product strip).',
      'ImageUploadInput (apps/client/src/components/image-upload-input.tsx) handles the full image upload flow: file picker, WebP conversion, auto-select base64 vs R2 based on size, preview, manual URL input, thumbnail generation. Use it for any admin image field.',
    ],
    buildPrompt: (src) => appendFacts(`
Below are the React application entry files, site config, and navbar.

${src}

Task: Write a "Frontend React Patterns" guide.
Include:
1. React Router setup: how routes are declared, protected routes pattern with AuthenticationGuard.
2. How to add a new page: 3 steps (page component + router + siteConfig navItem).
3. How the navbar auto-shows/hides items based on Auth0 permissions.
4. HeroUI v3: compound component pattern, key components (Button, Card, Modal, Table, Form).
5. ThemeSwitch: what it does, how it\'s already wired in.
6. Feature folder structure and hook placement conventions.
7. A worked example: adding a "Product Tags" admin page end-to-end.
`),
  },

  // ── 10. Seed data patterns ────────────────────────────────────────────────
  {
    name: 'seed-data-patterns',
    description: 'How the seed script works, how to add new seed data',
    sources: [
      'apps/merchant/scripts/seed.ts',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    buildPrompt: (src) => `
Below is the seed.ts script (may be truncated).

${src}

Task: Write a "Seed Data Script Reference".
Include:
1. How to run the seed script (exact command, required arguments).
2. The PRODUCT_CATALOG structure: how to add a new product with variants and pricing.
3. How to add a new seed category.
4. The apiWithRetry helper: why it exists, how to use it for custom seed data.
5. How currency conversion works (EUR → USD / GBP).
6. How images are embedded: toWebpDataUri helper, base64 fallback.
7. How to add a new seed helper function following the existing pattern.
`,
  },

  // ── 11. Cloudflare Worker patterns ────────────────────────────────────────
  {
    name: 'cloudflare-worker-patterns',
    description: 'Worker bindings, Durable Objects, KV, R2, Wrangler config, CI secrets',
    sources: [
      'apps/merchant/wrangler.jsonc',
      'apps/merchant/worker-configuration.d.ts',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'Every .env variable has a 1:1 equivalent GitHub secret (same name). When you add a new env variable, also add it to .github/workflows/create-env-artifact.yaml (the CI encrypted artifact builder) so CI can pass it to the Worker build.',
      'create-env-artifact.yaml generates an encrypted .env + wrangler.jsonc artifact consumed by CI deploy jobs. Without adding a new variable there, it will be absent from CI deployments.',
      'Frontend env vars are NOT VITE_ prefixed. They are injected via vite.config.ts define block as import.meta.env.VARIABLE_NAME. To expose a new variable to the browser: add it to the define block in apps/client/vite.config.ts.',
      'import.meta.env.PERMISSIONS is a string[] derived at build time from all *_PERMISSION .env keys (scopesArray in vite.config.ts). This drives navbar permission filtering without hardcoding permission strings.',
      'Mailgun is used for transactional emails. Required backend env vars (Wrangler secrets): MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_BASE_URL (default: https://api.mailgun.net), MAILGUN_USER (sender address). Email sending is silently skipped if MAILGUN_API_KEY is absent.',
      'kvCacheMiddleware (apps/merchant/src/middleware/kv-cache.ts) serves GET responses from KV before hitting the Durable Object. Cache key = cache:<full-url> including query params.',
      'KV cache TTL is configurable via three env vars (also GitHub Secrets): KV_CACHE_SEARCH_TTL_SECONDS (default 300s, search results), KV_CACHE_REVIEWS_TTL_SECONDS (default 600s, product reviews), KV_CACHE_DEFAULT_TTL_SECONDS (default 3600s, all other catalog/category routes).',
      'kvCacheMiddleware bypasses the cache for non-GET methods and for Authorization headers other than Bearer pk_* (admin JWTs and sk_ keys always hit the Durable Object directly).',
      'kvInvalidateMiddleware purges all cache:*/v1/products and cache:*/v1/categories keys after any successful POST/PATCH/DELETE. Invalidation is prefix-based and paginates through kv.list().',
      'deploy-cloudflare-worker.yaml runs automatically on push to main (apps/merchant/** changed). It decrypts the env artifact, runs wrangler secret bulk from secrets.json, then deploys. Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID GitHub Secrets.',
      'npm run dev:env is the recommended full-stack dev command (run from monorepo root). It starts both workspaces in parallel via Turborepo: the Merchant Worker (copies root .env to apps/merchant/.dev.vars then runs wrangler dev on localhost:8787) and the Client Vite SPA (sources root .env then runs vite on localhost:5173). Pass --base=/path to auto-adjust STORE_URL and CORS_ORIGIN for subpath testing.',
      'npm run stripe:listen is a SEPARATE command (not included in dev:env). It requires the Stripe CLI to be installed globally. It reads STRIPE_SECRET_KEY from .env and runs: stripe listen --load-from-webhooks-api --forward-to http://localhost:8787. Must be run in a second terminal alongside dev:env.',
      'npm run build:env builds all workspaces sourcing .env (used by CI). npm run build:client:env builds only the client SPA. Both resolve env vars at build time via the vite.config.ts define block.',
    ],
    buildPrompt: (src) => appendFacts(`
Below are the Wrangler configuration and the auto-generated worker-configuration.d.ts.

${src}

Task: Write a "Cloudflare Worker Patterns" reference.
Include:
1. How to access bindings in a route handler: c.env.MERCHANT, c.env.IMAGES, c.env.KV_CACHE.
2. The Durable Object pattern: why we use a single DO instance, how to get the stub,
   how to call query() and run().
3. KV cache: how kv-cache middleware works, how to invalidate cache manually.
4. R2: how product images are stored and served.
5. Secrets: what must go in Wrangler secrets vs .env file. Mailgun secrets list.
6. How to add a new binding: steps for wrangler.jsonc + worker-configuration.d.ts + Env type.
7. CI/CD: how env vars map to GitHub secrets, how create-env-artifact.yaml works, and how to expose a new var to the frontend via vite.config.ts define block.
`),
  },
  // ── 11b. Image storage patterns ───────────────────────────────────────────────
  {
    name: 'image-storage-patterns',
    description: 'Image upload: base64 vs R2, ImageUploadInput component, uploadImageFile utility',
    sources: [
      'apps/client/src/utils/image-upload.ts',
      'apps/client/src/components/image-upload-input.tsx',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'There are 3 image storage methods: (1) base64 — WebP data URI stored directly in the SQLite column (small images < 1 MB); (2) r2 — uploaded to Cloudflare R2 bucket via POST /v1/images and stored as a URL; (3) url — external URL stored as-is.',
      'ALL uploaded images are converted to WebP (max 1200 px, quality 0.8) before storage. Thumbnails are generated separately at 300 px.',
      'Storage method is chosen automatically by uploadImageFile(): base64 if file < 1 MB after conversion, r2 otherwise. Pass forceR2=true to always use R2.',
      'The 1 MB base64 threshold (BASE64_SIZE_LIMIT) and 5 MB upload limit (FILE_SIZE_LIMIT) are constants in image-upload.ts.',
      'ImageUploadInput is the canonical admin UI for image fields. Props: value (current URL/data-URI), onChange(url), onThumbnailChange(url), apiBaseUrl, disabled, forceR2. postForm can be injected or is picked from useSecuredApi() by default.',
      'isValidImageUrl(url) only allows http(s): and data:image/ protocols. Use it to guard any URL that comes from user input before passing to <img src>.',
      'The R2 upload endpoint POST /v1/images requires admin:store permission and returns { url, key }.',
      'Images served from R2 go through the KV CDN cache layer — DELETE /v1/images/:key purges both R2 and the CDN cache entry.',
    ],
    buildPrompt: (src) => appendFacts(`
Below are the image-upload.ts utility and the ImageUploadInput component.

${src}

Task: Write an "Image Storage Patterns" reference.
Include:
1. The 3 storage methods: base64, r2, external URL — when each is used.
2. The automatic size-based selection logic (thresholds, forceR2 flag).
3. WebP conversion: why it is always applied, quality and max-size parameters.
4. uploadImageFile() signature and usage example (with useSecuredApi().postForm).
5. ImageUploadInput component: props table, complete usage example in an admin form.
6. isValidImageUrl() security guard: what it accepts, when to call it.
7. The R2 backend endpoints (upload, delete, cache purge) and their required permission.
8. How CDN caching interacts with R2 objects and when to purge.
`),
  },
  // ── 12. MCP server quick-start ────────────────────────────────────────────
  {
    name: 'mcp-server-quickstart',
    description: 'Guide to building the remote MCP Worker on top of these static files',
    sources: [],  // no source files — pure AI generation from framework knowledge
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    buildPrompt: (_src) => appendFacts(`
Context: Fufuni is a Cloudflare Workers + Durable Objects + React 19 e-commerce framework.
The mcp/ directory contains static Markdown knowledge-base files generated by a build script.
We want to expose these as a remote MCP (Model Context Protocol) server running on the free
Cloudflare Workers tier.

Reference: https://developers.cloudflare.com/agents/guides/remote-mcp-server/

Task: Write a "Building the Fufuni MCP Server" guide.
Include:
1. What a remote MCP server is and why it accelerates AI-assisted development.
2. The Worker entry file skeleton (index.ts) using @cloudflare/agents McpAgent and McpServer.
3. How to register one "tool" per static Markdown file in mcp/ (tool name = file stem,
   description = first H1 line, response = file content).
4. The wrangler.jsonc configuration for the mcp Worker.
5. How to serve SSE (/sse) and HTTP (/mcp) endpoints.
6. How to add KV caching so the file reads don't happen on every invocation.
7. Deployment command and how to connect it to Claude Desktop / VS Code Copilot.

Be specific — include working TypeScript code for the Worker entry point.
`),
  },

  // ── 13. Wishlist, saved preferences, user_metadata ──────────────────────────
  {
    name: 'user-preferences-and-wishlist',
    description: 'Wishlist / saved carts / user preferences via Auth0 user_metadata',
    sources: [
      'apps/client/src/hooks/use-wishlist.ts',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'The wishlist (product favourites) is stored in Auth0 user_metadata, NOT in the SQLite database. This avoids a DB table for a per-user preference.',
      'user_metadata is namespaced under a key derived from STORE_URL so multiple Fufuni instances sharing the same Auth0 tenant do not collide.',
      'The WISHLIST_UPDATED_EVENT ("fufuni:wishlist-updated") is a custom DOM event dispatched after a wishlist mutation. Components listen to it and trigger a token refresh so the UI reflects the change without a full page reload.',
      'Backend PATCH /v1/me/preferences (updateMyPreferences) persists changes to Auth0 user_metadata via the Management API.',
      'Saved carts use the saved_carts DB table (not user_metadata) because they reference cart rows by FK. Managed via PATCH /v1/me/saved-carts.',
      'The useWishlist() hook decodes the JWT access token client-side with decodeJwt() to read user_metadata — this avoids an extra API roundtrip on every render.',
      'To add a new preference field: (1) update the user_metadata type; (2) read it in the hook via decodeJwt(); (3) persist with patchJson on /v1/me/preferences; (4) dispatch a custom event to trigger token refresh.',
    ],
    buildPrompt: (src) => appendFacts(`
Below is the use-wishlist.ts hook.

${src}

Task: Write a "User Preferences, Wishlist and Saved Carts" reference.
Include:
1. Architecture: why Auth0 user_metadata is used for preferences instead of a DB table.
2. user_metadata namespacing (multi-tenant safety).
3. useWishlist() hook: API, how it reads the JWT client-side, toggle() flow.
4. WISHLIST_UPDATED_EVENT: how to dispatch and listen, why it triggers a token refresh.
5. Backend: PATCH /v1/me/preferences — payload shape and when to call it.
6. Saved carts: how they differ from wishlist (DB table vs user_metadata).
7. Step-by-step: how to add a new preference field.
`),
  },

  // ── 14. AI-assisted features ─────────────────────────────────────────────────
  {
    name: 'ai-assisted-features',
    description: 'Client-side AI: review moderation, auto-translation, ai-client.ts',
    sources: [
      'apps/client/src/utils/ai-client.ts',
      'apps/merchant/src/routes/ai.ts',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'ALL AI inference runs in the browser — there is no server-side inference. The browser fetches credentials then calls the AI provider directly.',
      'Backend GET /v1/ai/parameters requires Auth0 permission ai:api (enforced by aiAccessOnly middleware). Returns { apiKey, model, url }. apiKey is randomly chosen from a comma-separated pool to distribute rate limits.',
      'apps/client/src/utils/ai-client.ts is the single AI utility module. Follow DRY — add new AI helpers here, never create a parallel AI client.',
      'ai-client.ts supports OpenAI, Groq (OpenAI-compatible), and Anthropic. Provider is auto-detected from the url field.',
      'Current AI use cases: (1) analyzeReviewWithAi() — moderate product reviews (approve/reject + reason); (2) translateWithAi() — auto-translate content into the 6 supported locales.',
      'Gate AI UI with AuthenticationGuardWithPermission permission="ai:api" or hasPermission("ai:api") before showing AI controls.',
      'To add a new AI feature: add a typed helper function to ai-client.ts following the AiParams interface, then fetch credentials from GET /v1/ai/parameters and pass them to your helper.',
    ],
    buildPrompt: (src) => appendFacts(`
Below are ai-client.ts and the ai.ts backend route.

${src}

Task: Write an "AI-Assisted Features" reference.
Include:
1. Architecture: why AI runs in the browser (no backend inference) and security implications.
2. Backend: GET /v1/ai/parameters — required permission, response shape, API key rotation.
3. ai-client.ts: AiParams interface, supported providers, auto-detection logic.
4. analyzeReviewWithAi(): signature, ReviewAnalysisResult type, usage example.
5. translateWithAi(): signature, usage example.
6. How to gate AI features with the ai:api Auth0 permission.
7. How to add a new AI use case (step-by-step with code).
`),
  },

  // ── 15. Auth0 tenant provisioning ────────────────────────────────────────────
  {
    name: 'auth0-tenant-setup',
    description: 'Auth0 deploy script, permissions model, M2M token cache',
    sources: [
      'scripts/auth0/deploy-tenant-resources.ts',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'scripts/auth0/deploy-tenant-resources.ts provisions all Auth0 resources in one command: SPA app, API resource server, permission scopes, post-login Action (injects user_metadata into JWT), and M2M client for Management API.',
      'Auth0 permissions used by Fufuni: admin:store (general admin), auth0:admin:api (Management API proxy — superAdmin), ai:api (AI features), mail:api (email sending), database:admin (direct DB access).',
      'The post-login Action injects user_metadata into the access token as a custom claim. This makes wishlist and preferences available in the JWT without extra API calls.',
      'The M2M token for the Management API is cached in KV (key: auth0_management_token) for ~23 hours to avoid exhausting the monthly M2M token quota.',
      'UsersAndPermissionsPage (/admin/users-and-permissions) requires auth0:admin:api permission. It uses the backend proxy then calls Auth0 Management API directly from the browser.',
      'To add a new permission: (1) add to deploy-tenant-resources.ts; (2) re-run the script; (3) add a backend RBAC guard; (4) gate the frontend with AuthenticationGuardWithPermission.',
    ],
    buildPrompt: (src) => appendFacts(`
Below is the Auth0 tenant deployment script.

${src}

Task: Write an "Auth0 Tenant Setup & Permissions" reference.
Include:
1. What resources the deploy script provisions and how to run it.
2. The full table of Auth0 permissions/scopes and what each grants.
3. The post-login Action: what it injects into the JWT and why.
4. M2M token caching: why it exists, KV key, TTL.
5. UsersAndPermissionsPage: what admins can manage there, required permission.
6. Step-by-step: adding a new permission end-to-end.
`),
  },
];

// ─── main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Discover usable models from the API before printing the summary.
  // Skipped in dry-run and skip-ai modes to avoid unnecessary API calls.
  if (!dryRun && !skipAI) {
    await initModels();
  }

  // Filter to a single topic if --topic= was provided
  const topics = topicFlag
    ? TOPICS.filter(t => t.name === topicFlag)
    : TOPICS;

  if (topicFlag && topics.length === 0) {
    console.error(`Error: unknown topic "${topicFlag}". Available topics:`);
    for (const t of TOPICS) console.error(`  ${t.name}`);
    process.exit(1);
  }

  console.log(`Fufuni MCP static generator`);
  console.log(`Output dir : ${MCP_DIR}`);
  console.log(`AI endpoint: ${AI_API_URL}`);
  console.log(`Topics     : ${topics.length} (${topics.map(t => t.name).join(', ')})`);
  console.log(`Dry run    : ${dryRun}`);
  console.log(`Skip AI    : ${skipAI}`);
  console.log('─'.repeat(60));

  let generated = 0;
  let skipped   = 0;
  let errors    = 0;

  for (const topic of topics) {
    const outPath = join(MCP_DIR, `${topic.name}.md`);
    console.log(`\n[${topic.name}] ${topic.description}`);

    // Skip existing files unless --force or the previous generation failed.
    // Files that contain the failure marker are always re-queued so the script
    // can be safely restarted after a partial run.
    if (!force && !dryRun && existsSync(outPath)) {
      const existing = readFileSync(outPath, 'utf8');
      if (!existing.includes('AI generation failed. Raw source below.')) {
        console.log(`  → skipped (file exists; use --force to overwrite)`);
        skipped++;
        continue;
      }
      console.log(`  → regenerating (previous AI generation failed)`);
    }

    // Collect source file contents
    let combinedSources = '';
    for (const srcPath of topic.sources) {
      const content = readSrc(srcPath);
      if (!content) continue;
      const snippet = truncate(content);
      combinedSources += `\n\n### Source: ${srcPath}\n\`\`\`\n${snippet}\n\`\`\`\n`;
    }

    // Inject manualFacts into the prompt if the topic defines them.
    // appendFacts() appends them under a "## Verified facts" heading so the
    // AI treats them as ground truth and incorporates them into the document.
    const rawPrompt    = topic.buildPrompt(combinedSources);
    const userPrompt   = appendFacts(rawPrompt, topic.manualFacts);

    if (verbose) {
      console.log('  User prompt preview:');
      console.log(userPrompt.slice(0, 300) + '…');
    }

    if (dryRun) {
      console.log(`  → dry run: prompt built (${estimateTokens(
        topic.systemPrompt + userPrompt
      )} est. tokens), not calling AI or writing file.`);
      skipped++;
      continue;
    }

    let aiContent = '';
    let aiMeta: { model: string; tokensIn: number; tokensOut: number } | undefined;

    if (skipAI) {
      // Build a minimal file from the raw source without an AI call
      aiContent = `# ${topic.description}\n\n> Auto-generated from source (no AI call).\n\n${combinedSources}`;
    } else {
      try {
        // Try each model in pool order; on 413 (prompt too large / TPM exceeded)
        // move to the next one rather than failing immediately.
        const modelsToTry = modelPool.length > 0 ? [...modelPool] : [nextModel()];
        let succeeded = false;
        for (let attempt = 0; attempt < modelsToTry.length; attempt++) {
          const chosenModel = modelsToTry[attempt];
          const retry = attempt > 0 ? ` (fallback ${attempt}/${modelsToTry.length - 1})` : '';
          console.log(`  → calling AI [${chosenModel}]${retry}…`);
          try {
            const result = await callAI(topic.systemPrompt, userPrompt, 4096, chosenModel);
            aiContent = result.content;
            aiMeta    = { model: chosenModel, tokensIn: result.tokensIn, tokensOut: result.tokensOut };
            console.log(`  → received ${result.tokensOut} tokens out (${result.tokensIn} in)`);
            succeeded = true;
            break;
          } catch (innerErr) {
            const msg = (innerErr as Error).message;
            const is413 = msg.includes('413') || msg.includes('Request too large') || msg.includes('rate_limit_exceeded');
            if (is413 && attempt < modelsToTry.length - 1) {
              console.warn(`  [warn] ${chosenModel} rejected (too large/TPM), trying next model…`);
              continue;
            }
            // Non-413 error or last model: propagate to outer catch
            throw innerErr;
          }
        }
        if (!succeeded) {
          throw new Error('All models in pool rejected the prompt (too large / TPM limit on all keys)');
        }
      } catch (err) {
        console.error(`  [error] AI call failed: ${(err as Error).message}`);
        errors++;
        // Write what we have (just the sources) so the file is not empty
        aiContent = `# ${topic.description}\n\n> AI generation failed. Raw source below.\n\n${combinedSources}`;
      }
    }

    // Build the file: dynamic header (with AI metadata when available) +
    // AI content + optional static appendix.
    const header      = buildHeader(aiMeta);
    const fileContent = header + aiContent +
      (topic.staticAppend ? '\n\n' + topic.staticAppend : '');

    writeFileSync(outPath, fileContent, 'utf8');
    console.log(`  → written to mcp/${topic.name}.md`);
    generated++;
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`Done. generated=${generated} skipped=${skipped} errors=${errors}`);

  if (errors > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
