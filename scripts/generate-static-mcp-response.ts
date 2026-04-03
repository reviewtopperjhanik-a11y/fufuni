#!/usr/bin/env npx tsx
/// <reference types="node" />
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

import { readFileSync, writeFileSync, mkdirSync, existsSync, globSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Static fallbacks (used when model metadata is unavailable) ───────────────
// These values target the Groq free-tier worst-case: 12 000 TPM per request.
const DEFAULT_MAX_SOURCE_CHARS = 14_000; // per-file, ~3 500 tokens
const DEFAULT_MAX_OUTPUT_TOKENS = 6_000;

// ── Budget computation constants ──────────────────────────────────────────────
/** Heuristic: 1 token ≈ 4 characters (GPT-4 / Llama tokenisers). */
const CHARS_PER_TOKEN = 4;
/**
 * Reserved tokens for the system prompt, buildPrompt boilerplate, manualFacts,
 * and Markdown fencing overhead.  Subtract this from context_window before
 * allocating source budget.
 */
const PROMPT_OVERHEAD_TOKENS = 2_000;
/** Hard upper bound on output tokens — longer rarely improves doc quality. */
const MAX_OUTPUT_TOKENS_CAP = 8_000;

// Keep legacy names as aliases so references elsewhere in the file still compile.
const MAX_SOURCE_CHARS = DEFAULT_MAX_SOURCE_CHARS;
const MAX_OUTPUT_TOKENS = DEFAULT_MAX_OUTPUT_TOKENS;

// ── Shared system prompt fragment reused across topics ──────────────────────
const BASE_SYSTEM_v0 = `You are a senior TypeScript developer documenting the Fufuni e-commerce framework.
Fufuni runs on Cloudflare Workers + Durable Objects (SQLite) for the backend (Hono + Zod-OpenAPI)
and React 19 + Vite + HeroUI v3 for the frontend.
Write concise, structured Markdown with TypeScript/SQL code examples.
Always use fenced code blocks with language tags (typescript, sql, etc.).
Target audience: junior developers contributing to or customising this framework.
Output ONLY the Markdown content — no preamble like "Here is the documentation:", no trailing notes.
When "## Verified facts" are provided, treat them as ground truth — they override any contradicting
inference from source code.`;

const BASE_SYSTEM = `You are a senior TypeScript developer documenting the Fufuni e‑commerce framework.
Fufuni runs on Cloudflare Workers + Durable Objects (SQLite) for the backend (Hono + Zod‑OpenAPI),
and React 19 + Vite + HeroUI v3 for the frontend.

WRITING RULES:
- Write in ENGLISH, using structured Markdown with typed code blocks (typescript, sql, bash, etc.)
- Every section must contain AT LEAST one complete and functional code example
- Examples must reflect the REAL conventions of the codebase (imports, naming, structure)
- Use only ## and ### headings — never # (reserved for the whole file)
- Target audience: junior developers contributing to the framework
- Target length: 800 to 1500 words per topic
- When “## Verified facts” are provided, they have PRIORITY over the source code — treat them as absolute truth
- NEVER start with a generic introductory sentence — jump straight into the topic
- NEVER add a final note such as “I hope this documentation is helpful”

REQUIRED FIRST LINE: Before any Markdown heading, output exactly one HTML comment:
<!--mcp-description: <one sentence ≤ 200 chars answering “when should an AI call this tool?”>-->
Example: <!--mcp-description: Call this when adding a Hono route, middleware, or sub-router to the Fufuni backend.-->`

// ─── resolve project root ────────────────────────────────────────────────────
// __dirname is not available in ESM; we derive it from import.meta.url.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..'); // repository root

// ─── CLI flags ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const topicFlag = argv.find(a => a.startsWith('--topic='))?.split('=')[1];
const dryRun = argv.includes('--dry-run');
const skipAI = argv.includes('--skip-ai');
const force = argv.includes('--force');
const discoverModels = argv.includes('--discover-models');
const verbose = argv.includes('--verbose');

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

// Merge .env values into process.env — only when the key is NOT already present.
// Using `in` (not falsiness) so that an explicit empty-string override on the
// command line (e.g. AI_API_KEY=${UNSET_VAR}) is still respected and not
// silently replaced by the .env value.
for (const [k, v] of Object.entries(dotenv)) {
  if (!(k in process.env)) process.env[k] = v;
}

// ─── AI configuration ────────────────────────────────────────────────────────

/** Maximum number of automatic retries on HTTP 429 rate-limit responses. */
const MAX_429_RETRIES = 5;

/**
 * Compute how many milliseconds to wait before retrying after a 429.
 *
 * Priority order:
 *  1. Groq / OpenAI inline message:  "Please try again in 18.96s."
 *  2. Standard retry-after HTTP header (value in seconds).
 *  3. Exponential back-off: 5 s × 2^attempt, capped at 60 s.
 *
 * A 500 ms safety buffer is added on top of the provider-reported delay
 * to account for clock skew and network latency.
 */
function parseRetryAfterMs(
  errorBody: string,
  retryAfterHeader: string | null,
  attempt: number,
): number {
  const match = errorBody.match(/try again in ([\d.]+)s/i);
  if (match) return Math.ceil(parseFloat(match[1]) * 1_000) + 500;
  if (retryAfterHeader) return (parseInt(retryAfterHeader, 10) + 1) * 1_000;
  return Math.min(5_000 * Math.pow(2, attempt), 60_000);
}

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
  const raw = process.env.AI_API_KEY ?? '';
  if (!raw) throw new Error('AI_API_KEY is not set. Add it to your .env file.');
  const keys = raw.split(',').map(k => k.trim()).filter(Boolean);
  const key = keys[keyIndex % keys.length];
  keyIndex++;
  // Show in log the index of the key being used (1-based for human readability) and the total number of keys.
  if (verbose) {
    console.log(`  [ai] Using API key ${keyIndex % keys.length || keys.length}/${keys.length}`);
  }
  return key;
}

const AI_API_URL = process.env.AI_API_URL ?? 'https://api.groq.com/openai/v1';

// ─── model discovery ─────────────────────────────────────────────────────────

/** Shape returned by GET /openai/v1/models on Groq and other OAI-compatible APIs. */
type GroqModel = {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
  active: boolean;
  context_window: number;
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

/**
 * Full GroqModel metadata for each entry in modelPool, in the same order.
 * Used by getModelBudget() to compute per-model token limits.
 */
let modelMeta: GroqModel[] = [];

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

// ─── per-request token cap (Groq TPM = per-request limit on free tier) ────────
//
// On the Groq free tier the TPM quota is consumed per request, not spread over
// the whole minute.  A single 15 000-token request saturates the 12 000 TPM
// budget immediately → HTTP 413.
//
// We learn the real cap from the first 413 error body ("Limit 12000, Requested…")
// and apply it to all subsequent topics so they start with the right budget and
// skip the halvings entirely.
//
// Pin it upfront via .env to avoid the first wasted 413 call:
//   MAX_TOKENS_PER_REQUEST=11000   # Groq free llama-3.3-70b  (TPM=12k, safety margin)
//   MAX_TOKENS_PER_REQUEST=5500    # Groq free llama-3.1-8b-instant (TPM=6k)

/** Per-request cap: from MAX_TOKENS_PER_REQUEST env var, or learned from first 413. */
let learnedRequestTokensCap: number | null =
  process.env.MAX_TOKENS_PER_REQUEST
    ? parseInt(process.env.MAX_TOKENS_PER_REQUEST, 10)
    : null;

/**
 * Try to extract the provider's hard per-request token limit from a 413 body.
 * Groq format: "Limit 12000, Requested 15101"
 * Returns null when not found.
 */
function parseRequestTokensCap(errorMsg: string): number | null {
  const m = errorMsg.match(/Limit\s+(\d[\d,]+)[,\s]/i);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
}

// ─── per-model budget ─────────────────────────────────────────────────────────

interface ModelBudget {
  /** Maximum tokens the model may generate in one response. */
  maxOutputTokens: number;
  /**
   * Total character budget for ALL source files of a topic combined.
   * Derived from: (context_window - maxOutputTokens - PROMPT_OVERHEAD_TOKENS) × CHARS_PER_TOKEN.
   * Callers divide this by the number of source files to get the per-file limit.
   */
  maxSourceCharsTotal: number;
}

type ModelSpec = {
  context_window: number;
  max_completion_tokens: number;
};
/**
 * Static specs for well-known models that won't appear in the Groq /models
 * discovery endpoint (e.g. Anthropic Claude, OpenAI, Gemini).
 * Used as a fallback in getModelBudget() when modelMeta is empty (pinned model
 * or non-Groq endpoint without /models support).
 */
const KNOWN_MODEL_SPECS: Record<string, ModelSpec> = {
  // ── Anthropic Claude ────────────────────────────────────────────────────────
    // Anthropic Claude API Docs — Models overview
  // https://platform.claude.com/docs/en/about-claude/models/overview
  'claude-opus-4-6': { context_window: 1_000_000, max_completion_tokens: 128_000 },
  'claude-sonnet-4-6': { context_window: 1_000_000, max_completion_tokens: 64_000 },
  'claude-haiku-4-5-20251001': { context_window: 200_000, max_completion_tokens: 64_000 },
  'claude-haiku-4-5': { context_window: 200_000, max_completion_tokens: 64_000 },
  'claude-sonnet-4-5': { context_window: 200_000, max_completion_tokens: 8_096 },
  'claude-opus-4-5': { context_window: 200_000, max_completion_tokens: 8_096 },
  'claude-3-5-haiku-20241022': { context_window: 200_000, max_completion_tokens: 8_096 },
  'claude-3-5-sonnet-20241022': { context_window: 200_000, max_completion_tokens: 8_096 },
  'claude-3-opus-20240229': { context_window: 200_000, max_completion_tokens: 4_096 },
  // ── OpenAI ──────────────────────────────────────────────────────────────────
  'gpt-4o': { context_window: 128_000, max_completion_tokens: 16_384 },
  'gpt-4o-mini': { context_window: 128_000, max_completion_tokens: 16_384 },
  'gpt-4-turbo': { context_window: 128_000, max_completion_tokens: 4_096 },
// OpenAI API — official model IDs confirmed by “All models”
  // https://developers.openai.com/api/docs/models/all
  // https://developers.openai.com/api/docs/models/gpt-5.4
  'gpt-5.4': { context_window: 1_000_000, max_completion_tokens: 128_000 },
  // ── Google Gemini ────────────────────────────────────────────────────────────
  'gemini-1.5-pro': { context_window: 1_000_000, max_completion_tokens: 8_192 },
  'gemini-1.5-flash': { context_window: 1_000_000, max_completion_tokens: 8_192 },
  'gemini-2.0-flash': { context_window: 1_048_576, max_completion_tokens: 8_192 },
  'gemini-3-flash': { context_window: 1_048_576, max_completion_tokens: 65_536 },
  // Google Vertex AI — Gemini 3.1 Pro (non-preview)
  // https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-1-pro
  // Historical note: older Gemini API docs also exposed a preview-suffixed variant.
  'gemini-3.1-pro': { context_window: 1_048_576, max_completion_tokens: 65_536 },
};

/**
 * Compute optimal generation limits for a given model ID.
 *
 * When the model is present in modelPool (populated by initModels()), its
 * context_window and max_completion_tokens are used to maximise the source
 * budget while leaving enough room for the expected output.
 *
 * Falls back to DEFAULT_* constants when the model is unknown (e.g. discovery
 * was skipped, the endpoint does not expose /models, or --skip-ai mode).
 *
 * Example outcomes:
 *   llama-3.3-70b   (131 072 ctx, 32 768 out) → maxOut=8 000  src≈488 k chars
 *   claude-haiku-4  (200 000 ctx,  8 096 out) → maxOut=8 000  src≈756 k chars
 *   groq/compound   (131 072 ctx,  8 192 out) → maxOut=8 000  src≈488 k chars
 *   fallback        —                          → maxOut=6 000  src= 56 k chars
 */
function getModelBudget(modelId: string): ModelBudget {
  // Priority: live pool metadata > static table > defaults.
  const poolEntry = modelMeta.find(p => p.id === modelId);
  const knownSpec = KNOWN_MODEL_SPECS[modelId];
  const spec = poolEntry ?? (knownSpec
    ? { context_window: knownSpec.context_window, max_completion_tokens: knownSpec.max_completion_tokens }
    : null);

  if (!spec) {
    return {
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
      // Assume up to 4 source files at the default per-file limit.
      maxSourceCharsTotal: DEFAULT_MAX_SOURCE_CHARS * 4,
    };
  }
  const maxOutputTokens = Math.min(
    spec.max_completion_tokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    MAX_OUTPUT_TOKENS_CAP,
  );
  // Start with the model's full context window.
  let inputBudgetTokens = Math.max(
    1_000,
    spec.context_window - maxOutputTokens - PROMPT_OVERHEAD_TOKENS,
  );

  // Apply the per-request cap when known (Groq free: TPM = per-request limit).
  // learnedRequestTokensCap is set from MAX_TOKENS_PER_REQUEST env var or from
  // the first 413 error — whichever arrives first.
  if (learnedRequestTokensCap !== null) {
    const cappedInput = Math.max(
      1_000,
      learnedRequestTokensCap - maxOutputTokens - PROMPT_OVERHEAD_TOKENS,
    );
    inputBudgetTokens = Math.min(inputBudgetTokens, cappedInput);
  }

  return {
    maxOutputTokens,
    maxSourceCharsTotal: inputBudgetTokens * CHARS_PER_TOKEN,
  };
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
  const raw = process.env.AI_API_KEY ?? '';
  const keys = raw.split(',').map(k => k.trim()).filter(Boolean);
  const apiKey = keys[0] ?? '';

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
    const data = await res.json() as { data: GroqModel[] };
    const usable = (data.data ?? [])
      .filter(m => m.active)
      .filter(m => (m.context_window ?? 0) >= MIN_CONTEXT_WINDOW)
      .filter(m => !EXCLUDED_MODEL_PATTERNS.test(m.id))
      .sort((a, b) => (b.context_window ?? 0) - (a.context_window ?? 0));

    if (usable.length === 0) {
      console.warn('  [warn] No suitable models found via GET /models. Using default.');
      modelPool = [process.env.AI_MODEL ?? 'openai/gpt-oss-20b'];
    } else {
      modelMeta = usable;
      modelPool = usable.map(m => m.id);

      // ── formatted table ──────────────────────────────────────────────────
      const colId = Math.max(8, ...usable.map(m => m.id.length));
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
 * A fresh API key is picked on every attempt (round-robin) so that
 * retrying after a 429 automatically rotates to the next key in the pool.
 * On HTTP 429 the function waits for the provider-reported delay (parsed
 * from the Groq/OpenAI error body or the retry-after header) then retries
 * up to MAX_429_RETRIES times before throwing.
 *
 * @param systemPrompt  High-level instructions to the model (role, output format).
 * @param userPrompt    The actual question / source context to summarise.
 * @param maxTokens     Maximum output size (defaults to MAX_OUTPUT_TOKENS).
 * @param model         Model ID (defaults to next model in the round-robin pool).
 */
async function callAI(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = MAX_OUTPUT_TOKENS,
  model = nextModel(),
): Promise<{ content: string; tokensIn: number; tokensOut: number }> {
  const isAnthropic = AI_API_URL.includes('anthropic.com');
  const isGemini = AI_API_URL.includes('generativelanguage.googleapis.com') && !AI_API_URL.includes('openai');

  if (verbose) {
    console.log(`  [ai] model=${model} endpoint=${AI_API_URL}`);
    console.log(`  [ai] input tokens ≈ ${estimateTokens(systemPrompt + userPrompt)}`);
  }

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    // Fresh key on every attempt — rotates through the pool automatically.
    const apiKey = nextApiKey();

    let response: Response;

    if (isAnthropic) {
      response = await fetch(`${AI_API_URL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
    } else if (isGemini) {
      response = await fetch(`${AI_API_URL}/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      });
    } else {
      // OpenAI / Groq / Together / any OAI-compatible endpoint
      response = await fetch(`${AI_API_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });
    }

    // ── 429 handling: wait then retry ────────────────────────────────────────
    if (response.status === 429 && attempt < MAX_429_RETRIES) {
      const errorText = await response.text();
      const waitMs = parseRetryAfterMs(errorText, response.headers.get('retry-after'), attempt);
      console.log(
        `  [retry] 429 rate-limit (attempt ${attempt + 1}/${MAX_429_RETRIES}). ` +
        `Waiting ${(waitMs / 1_000).toFixed(1)} s before next attempt…`,
      );
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    // ── other HTTP errors ─────────────────────────────────────────────────────
    if (!response.ok) {
      const errorText = await response.text();
      const label = isAnthropic ? 'Anthropic' : isGemini ? 'Gemini' : 'OpenAI/Groq';
      throw new Error(`AI API error (${label}) ${response.status}: ${errorText}`);
    }

    // ── parse successful response ─────────────────────────────────────────────
    if (isAnthropic) {
      const data = await response.json();
      return {
        content: data.content?.[0]?.text ?? '',
        tokensIn: data.usage?.input_tokens ?? estimateTokens(systemPrompt + userPrompt),
        tokensOut: data.usage?.output_tokens ?? 0,
      };
    }

    if (isGemini) {
      const data = await response.json();
      return {
        content: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
        tokensIn: data.usageMetadata?.promptTokenCount ?? estimateTokens(systemPrompt + userPrompt),
        tokensOut: data.usageMetadata?.candidatesTokenCount ?? 0,
      };
    }

    // OAI-compatible response
    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = data.choices?.[0]?.message?.content ?? '';
    const tokensIn = data.usage?.prompt_tokens ?? estimateTokens(systemPrompt + userPrompt);
    const tokensOut = data.usage?.completion_tokens ?? estimateTokens(content);
    if (verbose) console.log(`  [ai] output tokens ≈ ${tokensOut}`);
    return { content, tokensIn, tokensOut };
  }

  // Unreachable — the loop always returns or throws before exhausting retries.
  throw new Error(`AI call failed after ${MAX_429_RETRIES} retries.`);
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
function buildHeader(description: string, meta?: {
  model: string;
  tokensIn: number;
  tokensOut: number;
}): string {
  if (!meta) {
    return `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
  description:  ${description}
-->
`;
  }
  return `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
  description:  ${description}
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
  name: string;
  description: string;
  sources: string[];
  systemPrompt: string;
  buildPrompt: (sources: string) => string;
  staticHeader?: string;
  /** Curated facts injected verbatim into the AI prompt for priority inclusion. */
  manualFacts?: string[];
  /** Verbatim Markdown appended after the AI section (never reformulated). */
  staticAppend?: string;
  /**
   * Override the per-file character budget for source truncation.
   * Useful when a topic has many large files and would otherwise exceed
   * the model's per-request token limit (HTTP 413).
   * Defaults to MAX_SOURCE_CHARS when omitted.
   */
  maxSourceChars?: number;
};

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
      'The monorepo has three main workspaces: apps/client (React SPA), apps/merchant (Hono Worker + Durable Object), apps/mcp (MCP server).',
      'The monorepo uses **Turborepo** for task orchestration. The `npm run dev:env` inject the .env and launches the full stack locally with hot-reloading for both frontend, backend, mcp and stripe.',
      'The entire backend runs inside a single Durable Object (MerchantDO) so that all SQL is executed in one JS isolate — no connection pools, no latency.',
      'Public API keys are prefixed pk_; admin/secret keys are prefixed sk_. Never expose sk_ keys to the frontend.',
      'Secret sk_ key is kept only for legacy compatibility, RBAC auth via Auth0 permissions on access tokens is the source of truth.',
      'All database schema changes must be applied in THREE places simultaneously: SCHEMA constant in do.ts, ensureInitialized() in do.ts, and a new numbered SQL file in apps/merchant/migrations/.',
      'Auth0 is the sole identity provider. RBAC is managed via Auth0 permissions on the access token, not in the database.',
      'The frontend navbar items and their visibility are driven by siteConfig() in apps/client/src/config/site.ts — each navItem has a permissions[] array. Add a new page by adding an entry there.',
      'Fufuni is designed to run 100% free: Cloudflare Workers free tier (100k req/day), Durable Object SQLite (included), R2 free tier (10 GB/month), KV free tier (100k reads/day), Auth0 free tenant (7500 MAU), GitHub Pages for the frontend, and Mailgun 3000 emails/month. No credit card required.',
      'Three GitHub Actions workflows automate the full deployment: (1) deploy-cloudflare-worker.yaml (push to main → Worker deploy, needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID secrets); (2) pages.yaml (push to main → GitHub Pages frontend deploy); (3) reset-demo.yaml (manual/scheduled → resets and re-seeds the live demo).',
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
    manualFacts: [
      'The Durable Object can execute synchronous SQL queries via `this.sql.exec()` but incoming calls from the Worker are asynchronous (fetch-based).',
    ],
    buildPrompt: (src) => appendFacts(`
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
`),
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
      'Migrations are **idempotent by design** — `ensureInitialized()` never re‑applies a migration already recorded in the `migrations` table.',
      'Never retroactively modify a migration that has already been deployed to production — always create a new migration instead.',
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
`),
  },

  // ── 7. i18n patterns ──────────────────────────────────────────────────────
  {
    name: 'i18n-patterns',
    description: 'react-i18next usage, adding translations in all 6 locales',
    sources: [
      'apps/client/src/i18n.ts',
      'apps/client/src/locales/base/en-US.json',
      'apps/client/src/locales/base/fr-FR.json',
      'apps/client/src/locales/base/es-ES.json',
      'apps/client/src/locales/base/zh-CN.json',
      'apps/client/src/locales/base/ar-SA.json',
      'apps/client/src/locales/base/he-IL.json',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'New languages must be declared in i18n.ts within availableLanguages.',
      'Add a new object to the availableLanguages array with the following properties: code (e.g. "en-US"), nativeName (e.g. "English"), isRTL (boolean, true for ar-SA and he-IL). Optionally set isDefault: true to make it the fallback language (only one entry should have isDefault: true, currently en-US).',
      'json files contains the translation keys for each language. Keys use kebab-case. ex: "admin-users-page-title": "Admin Users Page Title"',
      'rtl styles are automatically applied to the layout when the language is set to a rtl language.',
      'Master language is en-US.json. All other languages are derived from this file.',
      'NEVER use t() default value parameter always add at least the en-US translation key as default value.',
    ],
    buildPrompt: (src) => appendFacts(`
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
`),
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
      'Adding a new page requires three steps: (1) create the page component in apps/client/src/pages/; (2) add it to the router in app.tsx (wrap with AuthenticationGuard or AuthenticationGuardWithPermission if protected); (3) optionally add a navItem entry in apps/client/src/config/site.ts with a permissions[] array to control navbar visibility.',
      'The navbar (apps/client/src/components/navbar.tsx) reads siteConfig().navItems: public items (permissions: []) are always shown; the admin dropdown is wrapped with <AuthenticationGuardWithPermission permission="admin:store"> and only shows items whose permissions[] includes "admin:store".',
      'The ThemeSwitch component (apps/client/src/shared/ui/navigation/theme-switch.tsx) is already included in the navbar. Users can switch between light/dark and custom themes. Theme config is stored in the store_themes DB table.',
      'Feature folder structure: apps/client/src/features/<feature-name>/components/, hooks/, index.ts. Export public API from index.ts only.',
      'New React hooks go in apps/client/src/hooks/ if they are page-agnostic, or in the feature folder if feature-specific.',
      'The LoginModal component handles both email/passwordless and social login. Show it instead of redirecting when you want the user to stay on the current page after login.',
      'Reusable display components (apps/client/src/components/): ProductCard (compact list card), ProductCardFull (detail view with variant selector, tax info), ProductImage (square image with fallback and variant-count badge), ProductReviews (review list + gated write form), CategoryBentoGrid (category landing 5-tile bento layout), ProductCarousel (horizontal snap-scroll product strip).',
      'ImageUploadInput (apps/client/src/components/image-upload-input.tsx) handles the full image upload flow: file picker, WebP conversion, auto-select base64 vs R2 based on size, preview, manual URL input, thumbnail generation. Use it for any admin image field.',
      'apps/client/src/provider.tsx wraps the app with exactly three providers in order: StoreThemeProvider (custom theme) > Toast.Provider (HeroUI toasts) > CartProvider (cart context). Auth0Provider is NOT in provider.tsx — authentication is initialised in the auth feature module.',
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
      '.github/workflows/create-env-artifact.yaml',
      '.github/workflows/deploy-cloudflare-worker.yaml',
      '.github/workflows/pages.yaml',
      'scripts/generate-wrangler-jsonc.py'


    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'Every .env variable has a 1:1 equivalent GitHub secret (same name). When you add a new env variable, also add it to .github/workflows/create-env-artifact.yaml (the CI encrypted artifact builder) so CI can pass it to the Worker build.',
      'generate-wrangler-jsonc.py generates wrangler.jsonc from .env and base wrangler.jsonc. It also generates secrets.json for wrangler secret bulk command.',
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

  // ── 11c. Checkout and UCP ─────────────────────────────────────────────────
  {
    name: 'checkout-and-ucp',
    description: 'Stripe checkout flow, UCP sessions, guest checkout vs account',
    sources: [
      'apps/merchant/src/routes/checkout.ts',
      'apps/merchant/src/routes/ucp.ts',
      'apps/merchant/src/schemas.ts',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'The endpoint /ucp/v1/checkout-sessions is the unique entry point for checkout; it creates both a CartSession and a Stripe PaymentIntent.',
      'checkout.session.completed is the Stripe event that finalizes the order on the backend (/stripe route).',
      'Guest checkout does not require a JWT — only the order_token is needed to view the order afterwards.',
      'ucp_checkout_sessions stores the intermediate state between session creation and finalization.',
    ],
    buildPrompt: (src) => appendFacts(`
Below are the checkout, UCP routes and schemas.

${src}

Task: Write a "Checkout and UCP Flow" reference.
Include:
1. Architecture: How UCP (Universal Checkout Page) sessions relate to Stripe PaymentIntents.
2. Step-by-step flow from cart to completed order.
3. Differences between guest checkout and authenticated user checkout.
4. Handling the Stripe webhook (checkout.session.completed) to finalize the order.
`),
  },

  // ── 11d. Orders and Refunds ───────────────────────────────────────────────
  {
    name: 'orders-and-refunds',
    description: 'Order lifecycle, statuses, Stripe refunds',
    sources: [
      'apps/merchant/src/routes/orders.ts',
      'apps/merchant/src/types.ts',
      'apps/client/src/config/order-status.ts',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'Order statuses are defined in apps/client/src/config/order-status.ts on the frontend and in the 001-add-order-statuses.sql migration on the backend. The 7 statuses are: "pending" (warning), "paid" (success), "processing" (accent), "shipped" (accent), "delivered" (success), "refunded" (danger), "canceled" (danger). The colour is used by the status badge component.',
      'A refund goes through Stripe then updates the status in the DB — never modify the DB directly without going through the Stripe API.',
    ],
    buildPrompt: (src) => appendFacts(`
Below are the files defining the orders lifecycle.

${src}

Task: Write an "Orders and Refunds" reference.
Include:
1. Order lifecycle and available statuses.
2. The refund process: How backend interacts with Stripe first before returning success.
3. Example code for triggering a refund.
`),
  },

  // ── 11e. Discounts & Pricing ──────────────────────────────────────────────
  {
    name: 'discounts-and-pricing',
    description: 'Promo codes, pricing by region/variant, final calculation',
    sources: [
      'apps/merchant/src/routes/discounts.ts',
      'apps/merchant/src/lib/pricing.ts',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'Prices by region are in variant_prices and shipping_rate_prices — never read the price from the variants table directly in a multi-region production context.',
      'lib/pricing.ts is the single source of truth for final price calculation (variant + region + discount + tax).',
    ],
    buildPrompt: (src) => appendFacts(`
Below are the files defining discounts and pricing logic.

${src}

Task: Write a "Discounts and Pricing" reference.
Include:
1. Difference between direct variant price and regional prices.
2. How promo codes / discounts are applied and calculated.
3. The role of lib/pricing.ts as the single source of truth.
`),
  },

  // ── 11f. Outbound Webhooks ────────────────────────────────────────────────
  {
    name: 'webhooks-outbound',
    description: 'Outbound webhooks, retry logic, HMAC signature, webhook_deliveries',
    sources: [
      'apps/merchant/src/routes/webhooks-outbound.ts',
      'apps/merchant/src/lib/webhooks.ts',
      'apps/merchant/src/routes/webhooks.ts',
      'apps/client/src/pages/admin/webhooks.tsx',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'Each outbound event triggers a fetch with headers: X-Fufuni-Signature (HMAC-SHA256 hex of payload), X-Fufuni-Timestamp (Unix seconds), X-Fufuni-Delivery-Id (delivery UUID), User-Agent: Fufuni-Webhook/1.0.',
      'MAX_ATTEMPTS = 3 with exponential backoff: 2^attempt × 1000 ms. Retries on network errors, 5xx, and 429. No retry on other 4xx.',
      'webhook_deliveries columns: id, webhook_id, event_type, payload (JSON), status (pending/success/failed), attempts, response_code, response_body, created_at, last_attempt_at.',
      'generateWebhookSecret() produces a whsec_ prefixed 64-char lowercase hex string (32 random bytes). Store this secret server-side and share it with the third-party for signature verification.',
      'Built-in event types: order.created, order.updated, order.shipped, order.refunded, inventory.low. LOW_INVENTORY_THRESHOLD = 5 — inventory.low fires when available stock ≤ 5.',
      'The admin UI (/admin/webhooks) displays deliveries, statuses, allows manual retries and secret rotation.',
    ],
    buildPrompt: (src) => appendFacts(`
Below are the outbound webhook files.

${src}

Task: Write an "Outbound Webhooks" reference for developers.
Include:
1. How webhook payloads are secured (X-Fufuni-Signature with HMAC-SHA256, X-Fufuni-Timestamp, X-Fufuni-Delivery-Id).
2. The retry mechanism via Cloudflare cron and webhook_deliveries tracking.
3. How developers can register new webhook events and view logs in the Admin UI.
`),
  },

  // ── 11g. Email Templates ──────────────────────────────────────────────────
  {
    name: 'email-templates',
    description: 'Mailgun email templates, configuration per order, variables',
    sources: [
      'apps/merchant/src/lib/email-templates.ts',
      'apps/merchant/src/lib/order-email.ts',
      'apps/merchant/src/routes/mails.ts',
      'apps/merchant/src/routes/order-email-settings.ts',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'Templates are stored in the DB in order_email_settings (HTML + text) and editable from /admin/email-templates.',
      'Variables available in templates ({{order_id}}, {{customer_name}}, etc.) are injected by lib/order-email.ts.',
      'Missing MAILGUN_API_KEY = sending is silently ignored — always check logs if emails do not send.',
    ],
    buildPrompt: (src) => appendFacts(`
Below are the files for the email templating and dispatching system.

${src}

Task: Write an "Email Templates and Dispatch" reference.
Include:
1. Where email templates are stored and how they can be edited.
2. How variables are interpolated using lib/order-email.ts.
3. Troubleshooting (e.g. absent MAILGUN_API_KEY).
`),
  },

  // ── 11h. Inventory & Warehouses ───────────────────────────────────────────
  {
    name: 'inventory-and-warehouses',
    description: 'Multi-warehouse inventory management, reservations, logs',
    sources: [
      'apps/merchant/src/lib/inventory.ts',
      'apps/merchant/src/routes/inventory.ts',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'warehouse_inventory is the actual stock table. warehouse_inventory_logs tracks every movement (in/out, reason).',
      'Stock reservation happens at order creation, definitive deduction at Stripe finalization.',
      'ApiError.insufficientInventory() must be thrown by the handler, not directly by lib/inventory.ts.',
    ],
    buildPrompt: (src) => appendFacts(`
Below are the files handling inventory and logistics.

${src}

Task: Write an "Inventory and Warehouses" reference.
Include:
1. How stock is tracked across multiple warehouses.
2. The difference between stock reservation and definitive deduction.
3. Error handling for insufficient inventory.
`),
  },

  // ── 11i. Regions, Taxes & Shipping ────────────────────────────────────────
  {
    name: 'regions-taxes-shipping',
    description: 'Regions, countries, inclusive/exclusive taxes, shipping classes',
    sources: [
      'apps/merchant/src/routes/regions.ts',
      'apps/merchant/src/routes/tax-rates.ts',
      'apps/merchant/src/lib/tax.ts',
      'apps/merchant/src/lib/shipping.ts',
    ],
    // regions.ts is very large; 4 files × 3000 chars ≈ 3 000 tokens of source,
    // well within the Groq free-tier 12 000 TPM per-request limit.
    maxSourceChars: 3000,
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'A region groups countries (region_countries), warehouses (region_warehouses) and shipping rates (region_shipping_rates).',
      'tax_inclusive on a region means the displayed price already includes VAT — lib/tax.ts adapts the calculation accordingly.',
      'The tax_code on a shipping rate allows applying specific tax rules to shipping.',
    ],
    buildPrompt: (src) => appendFacts(`
Below is the logic for Regions, Taxes and Shipping.

${src}

Task: Write a "Regions, Taxes and Shipping" reference.
Include:
1. What entities a region groups together.
2. Behavior of tax_inclusive and how lib/tax.ts handles it.
3. Applying specific tax_codes to shipping rates.
`),
  },

  // ── 11j. Embedded OAuth ───────────────────────────────────────────────────
  {
    name: 'oauth-embedded',
    description: 'Embedded OAuth2 server, third-party clients, authorization flow',
    sources: [
      'apps/merchant/src/routes/oauth.ts',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'The embedded OAuth server is distinct from Auth0 — it allows exposing the Fufuni API to third-party apps without sharing sk_ keys.',
      '.well-known/oauth-authorization-server exposes standard OAuth2 metadata.',
      'Scopes available for third-party OAuth clients are a subset of Auth0 permissions.',
    ],
    buildPrompt: (src) => appendFacts(`
Below is the embedded OAuth route.

${src}

Task: Write an "Embedded OAuth Server" reference.
Include:
1. Difference between this OAuth server and the main Auth0 instance.
2. The authorization_code flow for third parties.
3. How scopes are limited compared to Auth0.
`),
  },

  // ── 11k. Admin CRUD Pattern ───────────────────────────────────────────────
  {
    name: 'admin-crud-pattern',
    description: 'Reusable admin CRUD pattern, useAdminCrud hook, components',
    sources: [
      'apps/client/src/shared/ui/admin/admin-crud-layout.tsx',
      'apps/client/src/shared/ui/admin/row-actions.tsx',
      'apps/client/src/hooks/use-admin-crud.ts',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'AdminCrudLayout + useAdminCrud is the standard pattern for all admin pages. Do not reinvent a custom CRUD pattern.',
      'useAdminCrud handles: global text search (globalFilter/setGlobalFilter), status filter (statusFilter/setStatusFilter, values: ""/"active"/"inactive"), and modal state for create/edit (openCreate(), openEdit(item), closeModal(), isModalOpen, isEditMode, editingItem). It does NOT handle pagination or column sorting — implement those separately if needed.',
      'useAdminCrud<T extends HasIdAndStatus> returns: items, setItems, displayedItems (filtered), globalFilter, setGlobalFilter, statusFilter, setStatusFilter, isModalOpen, setIsModalOpen, isEditMode, editingItem, openCreate, openEdit, closeModal.',
      'AdminCrudLayout accepts: title, subtitle?, icon?, addLabel, onAdd, globalFilter, onGlobalFilterChange, filterPlaceholder?, statusFilter, onStatusFilterChange, statusLabel?, headerExtra?, children. Pass the HeroUI Table as children.',
    ],
    buildPrompt: (src) => appendFacts(`
Below is the admin CRUD layout code.

${src}

Task: Write an "Admin CRUD Pattern" reference.
Include:
1. How to create a new admin page using AdminCrudLayout.
2. Example of defining columns and wiring up useAdminCrud.
3. Avoiding custom implementations in favor of this unified pattern.
`),
  },

  // ── 11l. Invoice & PDF ────────────────────────────────────────────────────
  {
    name: 'invoice-and-pdf',
    description: 'Client-side PDF invoice generation, format, currency utilities',
    sources: [
      'apps/client/src/lib/invoice-generator.ts',
      'apps/client/src/utils/invoice-pdf.ts',
      'apps/client/src/utils/currency.ts',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'PDF generation is 100% client-side (browser) using jsPDF + jspdf-autotable — no server dependency.',
      'lib/invoice-generator.ts exposes generateInvoice(data: InvoiceData): void — generates an A4 PDF and downloads it as invoice-{orderNumber}.pdf.',
      'utils/invoice-pdf.ts exposes two public functions: downloadInvoicePdf(order, storeName?, locale?) triggers browser download; openInvoicePdf(order, storeName?, locale?) opens the PDF in a new browser tab via window.open(blobUri). Both accept an OrderForPdf object.',
      'utils/currency.ts formats cent amounts into locale-aware currency strings. Supported currencies: USD, EUR, GBP, CAD, CHF, AUD, JPY, CNY.',
    ],
    buildPrompt: (src) => appendFacts(`
Below are the files for invoice and PDF generation.

${src}

Task: Write an "Invoice and PDF Generation" reference.
Include:
1. The 100% client-side architecture (no backend load).
2. How currency formatting is handled based on locale.
3. Delivering the PDF payload using blob URLs.
`),
  },

  // ── 11m. Theming & Layouts ────────────────────────────────────────────────
  {
    name: 'theming-and-layouts',
    description: 'Themes (classic/luxury), layouts, CMS content config, theme switching',
    sources: [
      'apps/client/src/layouts/default.tsx',
      'apps/client/src/layouts/luxury.tsx',
      'apps/client/src/config/cms-content.ts',
      'apps/client/src/providers/theme-provider.tsx',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'The luxury layout is a complete visual variant: full-bleed main (no container padding), dedicated <Footer> component, min-h-screen instead of h-screen flex.',
      'cms-content.ts defines editable content blocks (hero banner, carousel, etc.) without an external CMS database.',
      'Per-user theme preference is stored in Auth0 user_metadata (not in the DB directly). StoreThemeProvider reads it from the JWT payload via decodeJwt() (jose library) and applies it as a data-theme attribute on <html>. Unauthenticated users have their theme in localStorage key "ui-theme".',
      'Theme changes are propagated across components via a custom DOM event THEME_UPDATED_EVENT = "fufuni:theme-updated". Dispatch this event after a theme mutation to sync all providers without a page reload.',
      'To persist a theme preference, call PATCH /v1/me/preferences — this updates Auth0 user_metadata via the Management API.',
    ],
    buildPrompt: (src) => appendFacts(`
Below are the layouts, CMS config, and theme provider.

${src}

Task: Write a "Theming and Layouts" reference.
Include:
1. Differences between the default and luxury layouts.
2. Custom theme storage in the DB and how they are injected at startup.
3. Using cms-content.ts for editable CMS blocks.
`),
  },

  // ── 11n. Migrations Reference ─────────────────────────────────────────────
  {
    name: 'migrations-reference',
    description: 'Complete reference of migrations: their order, content, what they add',
    sources: ['apps/merchant/src/do.ts', 'apps/merchant/migrations/*.sql'],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'The highest migration is currently 033. Any new migration must be numbered 034.',
      'ANY database migration MUST follow a strict 3-step process:',
      '1 - Add the SQL migration script to ensureInitialized() in apps/merchant/src/do.ts (to evolve existing databases).',
      '2 - Update the SCHEMA constant in apps/merchant/src/do.ts (so newly created databases have the complete, up-to-date schema).',
      '3 - Create a new .sql file in apps/merchant/migrations/ (for compatibility, historical tracking, and LLM visibility).',
    ],
    buildPrompt: (_src) => appendFacts(`
Task: Write a "Migrations Reference".
Include:
1. A conceptual overview of why we track migrations as they evolved up to 033.
2. The absolute STRICT necessity of the 3-step migration process:
   - Modifying ensureInitialized() in apps/merchant/src/do.ts
   - Modifying SCHEMA in apps/merchant/src/do.ts
   - Creating a .sql file in apps/merchant/migrations
3. The mechanism to run these on DO startup automatically.
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
      'Backend GET /v1/ai/parameters requires Auth0 permission ai:api (enforced by aiAccessOnly middleware). Returns { apiKey: string, model: string, url: string }. apiKey is randomly chosen from the AI_API_KEY comma-separated pool. Returns 503 if any of AI_API_KEY, AI_MODEL, or AI_API_URL is missing.',
      'apps/client/src/utils/ai-client.ts is the single AI utility module. Follow DRY — add new AI helpers here, never create a parallel AI client.',
      'AiParams interface: { apiKey: string, model: string, url: string, provider?: "openai" | "groq" | "anthropic" | "auto" }. Provider is auto-detected from the url field: url containing "anthropic" → Anthropic Messages API; "groq" → Groq (OAI-compatible); default → OpenAI.',
      'Current AI functions: analyzeReviewWithAi(review: ReviewInput, params: AiParams): Promise<ReviewAnalysisResult> — returns { success, recommendation: "approve"|"reject", reason?, error? }. analyzeReviewsBatchWithAi(reviews[], params, onProgress?) — processes up to 5 reviews in parallel. translateWithAi(content, targetLanguage, params, isHtml?, options?) — returns { success, content?, error? }.',
      'Gate AI UI with AuthenticationGuardWithPermission permission="ai:api" or hasPermission("ai:api") (from useSecuredApi()) before showing AI controls.',
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
      'Auth0 permissions used by Fufuni: admin:store (general admin → role "admin"), auth0:admin:api (Management API proxy → role "authadmin"), ai:api (AI features → role "aiadmin"), mail:api (email sending → role "mail"), admin:database (direct DB access → role "databaseadmin").',
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

  // ── 17. Product catalog & multilingual content ───────────────────────────────
  {
    name: 'product-catalog-and-localization',
    description: 'Product/variant CRUD, multilingual JSON fields, handle generation, catalog search',
    sources: [
      'apps/merchant/src/routes/catalog.ts',
      'apps/merchant/src/schemas.ts',
    ],
    maxSourceChars: 4000,
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'Multilingual text fields (title, description, vendor, tags) are stored as JSON objects keyed by locale code: {"en-US": "T-shirt", "fr-FR": "T-shirt"}. NEVER store a plain string in these columns.',
      'The handle is a URL-safe slug auto-generated from the en-US title. It must match /^[a-z0-9-]+$/ and be unique. Use the handle as the public URL identifier, never the id.',
      'Variant prices are in the variants table only for display; the source of truth for multi-region pricing is the variant_prices table. Read variant_prices for any checkout or order logic.',
      'Dimensions are stored as dims_cm JSON: {"l": 30, "w": 20, "h": 10} (length/width/height in cm). Weight is a separate weight_g integer column.',
      'Product search uses full-text LIKE queries across title_json, vendor_json, tags_json, and handle. The /v1/products/search endpoint accepts q= and category_id= query params.',
      'Status values for products and variants: "active" | "draft" | "archived". Only "active" products appear in public catalog.',
      'publicCatalog exports publicProducts (no auth); adminCatalog exports adminProducts (requires adminOnly). Both are registered in index.ts.',
    ],
    buildPrompt: (src) => appendFacts(`
Below are the catalog route and the shared Zod schemas.

${src}

Task: Write a "Product Catalog & Multilingual Content" reference.
Include:
1. Product data model: key fields, multilingual JSON pattern, handle convention.
2. Variant model: SKU, pricing columns, weight/dimensions JSON.
3. How to read and write multilingual fields (correct pattern and wrong pattern side-by-side).
4. Product search: endpoint, supported params, limitations.
5. Status lifecycle: draft → active → archived.
6. A worked example: adding a new "color" localized field to products (migration + route + frontend read).
`),
  },

  // ── 18. Customer-facing account portal ───────────────────────────────────────
  {
    name: 'customer-account-patterns',
    description: 'Customer portal: profile, order history, addresses, preferences — /v1/me/* routes',
    sources: [
      'apps/merchant/src/routes/me.ts',
      'apps/merchant/src/middleware/customer-auth.ts',
    ],
    maxSourceChars: 4000,
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'All /v1/me/* routes use customerAuthMiddleware (not authMiddleware). It accepts only Auth0 JWTs, sets role="customer", and does NOT require admin:store permission.',
      'On first login, the backend auto-creates a customer row from the JWT sub claim. If a customer already exists with the same email, the Auth0 sub is linked to that row (no duplicate).',
      'When Auth0 does not provide an email (some social providers), the backend generates a placeholder: <sub_hash>@auth0.local. Never display this to the user.',
      'Customer preferences are split: locale, theme, and marketing_consent are persisted in both the customers table and Auth0 user_metadata via PATCH /v1/me/preferences.',
      'Address management uses a default address flag. When the default address is deleted, the most recently created remaining address becomes the new default automatically.',
      'GET /v1/me/orders/:number returns the full order with items and tax breakdown (stored as taxes_json). Use the order number (e.g. "ORD-1234"), not the UUID id, in customer-facing URLs.',
      'customerAuthMiddleware extracts user_metadata from the JWT claim extra_user_info/user_metadata (Auth0 post-login Action namespace).',
    ],
    buildPrompt: (src) => appendFacts(`
Below are the /v1/me/* route handlers and customerAuthMiddleware.

${src}

Task: Write a "Customer Account Portal Patterns" reference.
Include:
1. customerAuthMiddleware: what it validates, how it differs from authMiddleware.
2. Auto-customer creation on first login: sub lookup, email fallback, placeholder email.
3. /v1/me/profile: readable fields, updatable fields.
4. /v1/me/orders: order list, single order with items and tax breakdown.
5. /v1/me/addresses: add/delete/default address logic.
6. /v1/me/preferences: which fields go to DB vs Auth0 user_metadata.
7. A worked example: building a "preferences" page that updates locale and theme.
`),
  },

  // ── 19. Product reviews & moderation ─────────────────────────────────────────
  {
    name: 'product-reviews',
    description: 'Review submission, purchase verification, moderation, AI sentiment analysis',
    sources: [
      'apps/merchant/src/routes/reviews.ts',
      'apps/client/src/pages/admin/reviews.tsx',
    ],
    maxSourceChars: 4000,
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'Only customers with a delivered order containing the reviewed product can submit a review (verified purchase check). The eligibility endpoint GET /v1/products/:id/reviews/eligibility returns { eligible: boolean, reason? }.',
      'Submitted reviews have status "pending" and are NOT shown publicly until an admin approves them (status = "approved"). Use the admin reviews page to moderate.',
      'Duplicate review prevention: one review per customer per product. A second submission returns 409 conflict.',
      'Reviews use cursor-based pagination by created_at ISO string, not by ID. Pass cursor= query param for next page.',
      'The admin reviews page uses analyzeReviewWithAi() or analyzeReviewsBatchWithAi() to get an AI recommendation (approve/reject + reason) before the admin decides. Requires ai:api Auth0 permission.',
      'reviews.ts uses inline JWT extraction (manual token decode) because Hono sub-app middleware does not propagate the prefix correctly in this context. Do NOT add authMiddleware to the sub-router.',
      'The helpful_count on a review is incremented by POST /v1/products/:id/reviews/:reviewId/helpful (no auth required, browser fingerprint via IP).',
    ],
    buildPrompt: (src) => appendFacts(`
Below are the reviews route and the admin reviews page.

${src}

Task: Write a "Product Reviews & Moderation" reference.
Include:
1. Review submission flow: eligibility check → submit → pending → approved.
2. Verified purchase requirement and how to check eligibility.
3. Admin moderation: approve/reject, AI recommendation integration.
4. Cursor-based pagination pattern (created_at, not ID).
5. The inline JWT extraction pattern and why it is necessary here.
6. A worked example: adding a "reply from merchant" field to reviews (migration + route + admin UI).
`),
  },

  // ── 20. JWT user_metadata patterns ───────────────────────────────────────────
  {
    name: 'jwt-user-metadata-patterns',
    description: 'Auth0 user_metadata in JWT: multi-store scoping, CustomEvent sync, use-token-user-data',
    sources: [
      'apps/client/src/hooks/use-token-user-data.ts',
      'apps/client/src/lib/store-metadata.ts',
      'apps/merchant/src/lib/store-metadata.ts',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'Auth0 user_metadata is injected into the JWT access token by a post-login Action under the namespace "extra_user_info/user_metadata". Read it client-side with decodeJwt() from jose — no extra API call.',
      'All per-user store data (wishlist, theme, saved carts) is namespaced under a store-scoped key to support multiple Fufuni instances sharing one Auth0 tenant. The key is derived from STORE_URL via normalizeStoreUrl().',
      'normalizeStoreUrl(url) replaces characters not allowed in Auth0 metadata keys (., :, /) with underscores. Example: "https://shop.example.com" → "https___shop_example_com". Both frontend and backend must use the same normalization.',
      'useTokenUserData<T>(selector, event) is the generic hook for reading any user_metadata field and reacting to cross-component changes. Wishlist, saved carts, and theme all use it.',
      'Cross-component sync uses window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: newValue })). Components listen on window and call getAccessTokenSilently() + decodeJwt() to refresh their view of user_metadata.',
      'To persist a change to user_metadata, call PATCH /v1/me/preferences (or /v1/me/wishlist). The Auth0 post-login Action will include the new value in the NEXT token refresh.',
      'To add a new user_metadata field: (1) update the type in use-token-user-data.ts; (2) read it via useTokenUserData with a new selector; (3) persist via PATCH /v1/me/preferences; (4) dispatch a CustomEvent to sync other components.',
    ],
    buildPrompt: (src) => appendFacts(`
Below are the useTokenUserData hook, and both frontend and backend store-metadata helpers.

${src}

Task: Write a "JWT User Metadata Patterns" reference.
Include:
1. How Auth0 user_metadata is embedded in the JWT (post-login Action, claim namespace).
2. Reading user_metadata client-side with decodeJwt() — no API call needed.
3. Multi-store scoping: normalizeStoreUrl(), getStoreMetadata() — why and how.
4. useTokenUserData<T>: generic pattern, selector function, CustomEvent sync.
5. Cross-component reactivity: dispatch → listen → token refresh cycle.
6. How to add a new per-user preference field end-to-end (step-by-step with code).
`),
  },

  // ── 21. Order view tokens ─────────────────────────────────────────────────────
  {
    name: 'order-view-tokens',
    description: 'Signed order tokens for guest order access — generation, verification, email links',
    sources: [
      'apps/merchant/src/lib/order-token.ts',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'Order view tokens (OVT) allow guests to view their order without an Auth0 account. They are signed HS256 JWTs with a 30-day TTL, generated by generateOrderViewToken(orderId, secret).',
      'The raw token is included in the order confirmation email as a query parameter (?token=…). On the frontend, the order page reads this token from the URL and passes it to GET /v1/orders/:id?token=….',
      'The ORDER_VIEW_TOKEN_SECRET env var is the signing secret. It must be set in wrangler secrets and in .env.',
      'Tokens are deterministic: calling generateOrderViewToken() with the same orderId and secret always produces the same token. This allows re-sending confirmation emails without storing the token.',
      'hashOrderToken(token) returns a SHA-256 hash for database storage (order_view_token column). Never store the raw token — only the hash.',
      'verifyOrderViewToken(token, orderId, secret) validates signature, expiry, AND cross-checks the orderId claim to prevent token reuse across orders.',
      'Guest order tracking URL pattern: /order/:orderNumber?token=<raw_token>. The frontend reads the token, sends it to the backend which verifies it before returning order details.',
    ],
    buildPrompt: (src) => appendFacts(`
Below is the order-token.ts library.

${src}

Task: Write an "Order View Tokens" reference.
Include:
1. Architecture: what OVTs solve (guest access without account).
2. generateOrderViewToken(): signature, deterministic property, TTL.
3. hashOrderToken(): why we hash before DB storage.
4. verifyOrderViewToken(): what it checks (signature + expiry + orderId cross-check).
5. Full flow: order created → token generated → included in email → guest visits URL → backend verifies.
6. The ORDER_VIEW_TOKEN_SECRET env var — how to set it.
`),
  },

  // ── 22. Localized content editing ────────────────────────────────────────────
  {
    name: 'localized-content-patterns',
    description: 'Multilingual content: JSON storage in DB, description.ts migration, useLocalizedTextInput hook',
    sources: [
      'apps/client/src/utils/description.ts',
      'apps/client/src/hooks/use-localized-text-input.ts',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'Localized text fields in the DB are JSON strings: {"en-US": "My product", "fr-FR": "Mon produit"}. The helper getLocalizedText(value, locale, fallback) parses this JSON and returns the best match.',
      'Legacy rows may contain plain HTML strings (not JSON). isLocalizedJson(value) detects the format. migrateToLocalizedJson(plainText) wraps a plain string into {"en-US": plainText} for backward compatibility.',
      'useLocalizedTextInput(fieldName, initialValue, options) manages a multilingual text field in an admin form: tracks current locale, provides onChange handlers, integrates AI auto-translation, detects RTL.',
      'The hook exposes: value (current locale string), allValues (full JSON object), handleChange(locale, text), translateAll(aiParams) → fills all locales via translateWithAi().',
      'AI translation is opt-in. The "Translate" button in admin forms calls translateAll() which loops over all 6 locales and calls translateWithAi() for each missing translation.',
      'RTL detection: the hook checks availableLanguages[locale].isRTL and sets dir="rtl" on the input element automatically for ar-SA and he-IL.',
      'When saving a localized field to the backend, always serialize allValues as JSON.stringify(allValues). Never pass the current-locale string alone.',
    ],
    buildPrompt: (src) => appendFacts(`
Below are the description.ts utility and the useLocalizedTextInput hook.

${src}

Task: Write a "Localized Content Patterns" reference.
Include:
1. The JSON storage format: {"en-US": "...", "fr-FR": "..."} — reading and writing.
2. getLocalizedText(), isLocalizedJson(), migrateToLocalizedJson() — when to use each.
3. useLocalizedTextInput(): props, return values, AI translation integration.
4. RTL handling in the input hook.
5. How to add a localized field to an admin form (complete example with the hook).
6. Common pitfall: saving only the current-locale string instead of the full JSON object.
`),
  },

  // ── 23. Analytics & dashboard ─────────────────────────────────────────────────
  {
    name: 'analytics-dashboard',
    description: 'Admin analytics: revenue, orders, stock alerts, KV cache metrics',
    sources: [
      'apps/merchant/src/routes/analytics.ts',
      'apps/client/src/pages/admin/analytics.tsx',
    ],
    maxSourceChars: 4000,
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'GET /v1/analytics/dashboard accepts period= query param: "7d" | "30d" | "90d" | "all". Period filtering uses SQLite date expressions — no external time library.',
      'The dashboard response includes: total_revenue_cents, order_count, avg_order_value_cents, new_customers_count, top_products (top 5 by revenue), orders_by_status (breakdown), low_stock_items (available ≤ LOW_INVENTORY_THRESHOLD).',
      'GET /v1/analytics/cache-stats returns KV cache hit/miss counts stored in KV keys analytics:cache:hits and analytics:cache:misses. Cache stats are incremented by the kvCacheMiddleware.',
      'Both endpoints require adminOnly middleware (admin:store permission).',
      'The frontend analytics page uses React Query for data fetching with a period selector state. Charts are rendered using HeroUI primitives (no external chart library by default).',
      'Revenue aggregations use SUM(oi.unit_price_cents * oi.quantity) across order_items joined with orders. Only orders with status NOT IN ("canceled", "refunded") are counted.',
    ],
    buildPrompt: (src) => appendFacts(`
Below are the analytics route and the admin analytics page.

${src}

Task: Write an "Analytics & Dashboard" reference.
Include:
1. Dashboard endpoint: available metrics, period param values, response shape.
2. How revenue is calculated (which statuses are excluded).
3. Low stock alerting: threshold, included fields.
4. Cache stats: what is tracked, KV key names, how to reset.
5. Frontend page: period selector, data fetching pattern with React Query.
6. How to add a new metric (backend aggregation + frontend display).
`),
  },

  // ── 24. Setup & database management ──────────────────────────────────────────
  {
    name: 'setup-and-initialization',
    description: 'Store setup: API key init, Stripe config, database reset, migration management via API',
    sources: [
      'apps/merchant/src/routes/setup.ts',
    ],
    systemPrompt: BASE_SYSTEM,
    staticHeader: `<!--
  AUTO-GENERATED by scripts/generate-static-mcp-response.ts
  Do not edit manually. Run the script to regenerate.
-->
`,
    manualFacts: [
      'POST /v1/setup/init is the one-time store initialization endpoint. It creates the first pk_/sk_ API key pair. It is idempotent — if api_keys already exist, it returns 409. Requires no auth (used before any key exists).',
      'POST /v1/setup/stripe validates the provided Stripe secret key via an API call before storing it in config. Always validate before saving.',
      'POST /v1/setup/reset wipes ALL data (cascade delete) and re-runs SCHEMA initialization. Requires databaseAdminOnly (admin:database Auth0 permission). NEVER expose this in production without IP restriction.',
      'GET /v1/setup/migrations/list returns all rows from the migrations table (name, applied_at). POST /v1/setup/migrations/run re-executes ensureInitialized() to apply any pending migrations.',
      'Config values are stored in the config table as key-value pairs. GET /v1/setup/config returns all config entries. Sensitive values (Stripe keys) are masked in the response.',
      'The setup routes are public (no authMiddleware) because they are used before any admin account exists. Secure them at the network level (Cloudflare Access or IP allowlist) in production.',
    ],
    buildPrompt: (src) => appendFacts(`
Below is the setup route.

${src}

Task: Write a "Setup & Initialization" reference.
Include:
1. First-time store setup flow: POST /setup/init → POST /setup/stripe → seed data.
2. Config table: what is stored, how to read/update, masking of sensitive values.
3. Migration management via API: list, run pending, clean history.
4. Database reset: when to use it (demo/testing only), required permissions, cascade behavior.
5. Security warning: why setup routes must be protected at the network level in production.
6. How to add a new configurable setting (config table pattern).
`),
  },

  // ── 16. Conventions & Anti-Patterns ─────────────────────────────────
  {
    name: 'conventions-and-anti-patterns',
    description: 'What NOT to do — common mistakes and the canonical patterns to use instead',
    sources: [],
    systemPrompt: BASE_SYSTEM,
    manualFacts: [
      'NEVER use c.req.json() directly — always use c.req.valid("json") after declaring the body schema in createRoute().',
      'NEVER declare Zod schemas inline in route files — always put them in apps/merchant/src/schemas/ and import them.',
      'NEVER modify an existing migration file — create a new numbered migration instead.',
      'NEVER update SCHEMA in do.ts without also updating ensureInitialized() and creating the SQL migration file.',
      'NEVER expose sk_ API keys to the frontend — only pk_ keys are safe for browser use.',
      'NEVER read variant price from the variants table directly in multi-region context — always use variant_prices joined with region.',
      'NEVER call the Auth0 Management API from the frontend directly — use the backend proxy /v1/__auth0/* endpoints.',
      'NEVER create a new AI client utility — always add helpers to the existing apps/client/src/utils/ai-client.ts.',
      'NEVER use localStorage or sessionStorage in artifacts or React components — they are not supported in the Claude.ai environment.',
      'NEVER use the legacy cloudflare-worker workspace — it is deprecated. All backend code lives in apps/merchant.',
      'NEVER add a new page to the router without also adding it to apps/client/src/config/site.ts if it needs navbar visibility.',
      'NEVER call a refund by modifying the DB directly — always go through the Stripe API first, then the DB update follows.',
      'NEVER pass jwt tokens manually in API calls — use the useSecuredApi() hook which handles this automatically.',
      'ALWAYS update scripts/generate-static-mcp-response.ts when adding new files (API routes, UI components, migrations). You MUST add the new file path to the `sources` array of the most relevant topic otherwise the AI knowledge base will desynchronize.',
    ],
    buildPrompt: (_src) => appendFacts(`
Task: Write a "Conventions & Anti-Patterns" reference for Fufuni developers.
Structure it as a series of DO / DON'T pairs covering:
1. Backend (routes, schemas, DB queries, auth, migrations)
2. Frontend (hooks, components, auth guards, image upload)
3. Infrastructure (env vars, CI secrets, Stripe webhooks)
4. AI features (ai-client.ts, permissions)

For each anti-pattern, show the WRONG code, then the CORRECT alternative.
`),
  },

];

// ─── main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Display how many keys we have in the pool before starting generation so we can correlate with AI call success/failures.


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
  let skipped = 0;
  let errors = 0;

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

    /**
     * Build combinedSources + userPrompt for a given per-file char budget.
     * Called once at the start, then again (with a halved budget) if the AI
     * returns HTTP 413 (request too large).
     */
    function buildContent(maxChars: number): { combinedSources: string; userPrompt: string } {
      let combined = '';
      for (const srcPath of topic.sources) {
        const content = readSrc(srcPath);
        if (!content) continue;
        const snippet = truncate(content, maxChars);
        combined += `\n\n### Source: ${srcPath}\n\`\`\`\n${snippet}\n\`\`\`\n`;
      }
      const rawPrompt = topic.buildPrompt(combined);
      return { combinedSources: combined, userPrompt: appendFacts(rawPrompt, topic.manualFacts) };
    }

    // Derive initial per-file char budget from the first (most capable) model's
    // context_window and max_completion_tokens.  topic.maxSourceChars wins when
    // set explicitly (e.g. for topics with many large files hitting Groq TPM).
    const modelsToTryForBudget = modelPool.length > 0 ? modelPool : [nextModel()];
    const initialBudget = getModelBudget(modelsToTryForBudget[0]);
    const numSources = Math.max(1, topic.sources.length);
    let charsPerSource = topic.maxSourceChars ?? Math.floor(initialBudget.maxSourceCharsTotal / numSources);
    let { combinedSources, userPrompt } = buildContent(charsPerSource);

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
        // Strategy: try each model in pool order.
        // On HTTP 413 (single request too large), halve charsPerSource, rebuild
        // the prompt, then restart the model loop — up to MAX_SIZE_HALVINGS times.
        const MAX_SIZE_HALVINGS = 3; // 14000 → 7000 → 3500 → 1750
        const modelsToTry = modelPool.length > 0 ? [...modelPool] : [nextModel()];
        let succeeded = false;
        let halvings = 0;

        modelLoop: while (halvings <= MAX_SIZE_HALVINGS) {
          for (let attempt = 0; attempt < modelsToTry.length; attempt++) {
            const chosenModel = modelsToTry[attempt];
            const sizeNote = halvings > 0 ? ` [src budget ${charsPerSource} chars]` : '';
            const retryNote = attempt > 0 ? ` (model fallback ${attempt}/${modelsToTry.length - 1})` : '';
            console.log(`  → calling AI [${chosenModel}]${sizeNote}${retryNote}…`);
            try {
              const { maxOutputTokens } = getModelBudget(chosenModel);
              const result = await callAI(topic.systemPrompt, userPrompt, maxOutputTokens, chosenModel);
              aiContent = result.content;
              aiMeta = { model: chosenModel, tokensIn: result.tokensIn, tokensOut: result.tokensOut };
              console.log(`  → received ${result.tokensOut} tokens out (${result.tokensIn} in)`);
              succeeded = true;
              break modelLoop;
            } catch (innerErr) {
              const msg = (innerErr as Error).message;
              const is413 = msg.includes('413') || msg.includes('Request too large') || msg.includes('rate_limit_exceeded');
              if (is413) {
                // Learn the per-request cap from this error so subsequent topics
                // start with the right budget without needing halvings.
                if (learnedRequestTokensCap === null) {
                  const cap = parseRequestTokensCap(msg);
                  if (cap) {
                    learnedRequestTokensCap = cap;
                    console.log(`  [info] Learned per-request token cap: ${cap} tokens — future topics will use this limit directly.`);
                  }
                }
                if (halvings < MAX_SIZE_HALVINGS) {
                  // Reduce prompt size and restart the model loop
                  halvings++;
                  charsPerSource = Math.floor(charsPerSource / 2);
                  console.warn(
                    `  [warn] 413 — prompt too large. Halving source budget to ${charsPerSource} chars/file (halving ${halvings}/${MAX_SIZE_HALVINGS})…`,
                  );
                  ({ combinedSources, userPrompt } = buildContent(charsPerSource));
                  continue modelLoop;
                }
                // Max halvings reached: fall through to next model
                if (attempt < modelsToTry.length - 1) {
                  console.warn(`  [warn] ${chosenModel} still too large after max halvings, trying next model…`);
                  continue;
                }
              } else if (attempt < modelsToTry.length - 1) {
                // Non-413 transient error: try next model
                console.warn(`  [warn] ${chosenModel} failed (${msg.slice(0, 80)}), trying next model…`);
                continue;
              }
              // All models exhausted or non-retryable: propagate
              throw innerErr;
            }
          }
          break; // models loop finished without 413 → exit while
        }

        if (!succeeded) {
          throw new Error('All models rejected the prompt (too large or all keys exhausted)');
        }
      } catch (err) {
        console.error(`  [error] AI call failed: ${(err as Error).message}`);
        errors++;
        // Write what we have (just the sources) so the file is not empty
        aiContent = `# ${topic.description}\n\n> AI generation failed. Raw source below.\n\n${combinedSources}`;
      }
    }

    // Extract AI-generated mcp-description (if present) then strip it from content.
    const mcpDescMatch = aiContent.match(/^<!--mcp-description:\s*(.+?)-->\n?/);
    const mcpDescription = mcpDescMatch?.[1]?.trim() ?? topic.description;
    if (mcpDescMatch) aiContent = aiContent.slice(mcpDescMatch[0].length);

    // Build the file: dynamic header (with AI metadata when available) +
    // AI content + optional static appendix.
    const header = buildHeader(mcpDescription, aiMeta);
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
