#!/usr/bin/env npx tsx
/// <reference types="node" />
/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT - SCTG Development
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
 * generate.ts  (formerly scripts/generate-static-mcp-response.ts)
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates static knowledge-base files in `mcp/` that will later be served
 * by a remote MCP (Model Context Protocol) server running on Cloudflare Workers.
 *
 * Topics are auto-discovered from apps/mcp/src/knowledge/topics/*.ts
 * Each topic file must export a default Topic object.
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
 *   npx tsx apps/mcp/src/knowledge/generate.ts [--topic=<name>] [--dry-run]
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

import { faker } from '@faker-js/faker';
import { nanoid } from 'nanoid';
import gitlog from 'gitlog';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import { join, resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import {
  decryptAiConfig,
  selectModels,
  collectKeys,
  resolveProviderEndpoint,
  resolveModelId,
  selectEmbeddingModels,
  type ModelBudget,
  getModelBudget as getModelBudgetImpl,
  maskAiConfig,
} from '../lib/ai-enc.js';
import {
  buildHeader,
  callAi,
  computeTopicChecksums,
  estimateTokens,
  generateBm25Index,
  generateChunks,
  generateEmbedding,
  normalizeVector,
  parseHeaderChecksums,
  parseRetryAfterMs,
  truncate,
  buildManifest,
  buildApiKeyPool,
  createRoundRobinKeyProvider,
  maskApiKey
} from '../lib/generate-knowledge.js';
import type { Topic } from './base.js';

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

// ─── resolve project root ────────────────────────────────────────────────────
// __dirname is not available in ESM; we derive it from import.meta.url.
// File is at apps/mcp/src/knowledge/generate.ts → root is 3 levels up.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../../../..'); // repository root
const TOPICS_DIR = join(__dirname, 'topics');
// this filename path relative to project root, used in generated Markdown headers and source_file_hashes
const RELATIVE_PATH = 'apps/mcp/src/knowledge/generate.ts';
// ─── CLI flags ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const topicFlags = argv
  .filter(a => a.startsWith('--topic='))
  .map(a => a.split('=')[1])
  .filter(Boolean);
const aiJsonEncFlag = argv.find(a => a.startsWith('--ai-json-enc='))?.split('=')[1];
const showKeyOwner = argv.includes('--show-key-owner');
const showKeyUsageSummary = argv.includes('--key-usage-summary');
const exportMaskedAiJson = argv.includes('--export-masked-ai-json');
const dryRun = argv.includes('--dry-run');
const skipAI = argv.includes('--skip-ai');
const force = argv.includes('--force');
const autoRefresh = argv.includes('--auto-refresh');
const discoverModels = argv.includes('--discover-models');
const noModelFallback = argv.includes('--no-model-fallback');
const fetchTimeoutMs = (() => {
  const f = argv.find(a => a.startsWith('--fetch-timeout='));
  return f ? parseInt(f.split('=')[1], 10) * 1_000 : 90_000;
})();
const maxTokenOverride = (() => {
  const f = argv.find(a => a.startsWith('--max-token-override='));
  return f ? parseInt(f.split('=')[1], 10) : null;
})();
const verbose = argv.includes('--verbose');
const manifestOnly = argv.includes('--manifest-only');
const bm25IndexOnly = argv.includes('--bm25-index-only');
const showHelp = argv.includes('--help') || argv.includes('-h');

const decryptedAiKeys: string[] = [];
const decryptedOwnerEmails: string[] = [];
const aiKeyReplacements = new Map<string, string>();
const ownerEmailReplacements = new Map<string, string>();

/**
 * Return a stable synthetic replacement for a decrypted AI API key.
 *
 * @param key - The original decrypted API key.
 * @returns A deterministic synthetic key for masking in generated output.
 */
function getAiKeyReplacement(key: string): string {
  if (!aiKeyReplacements.has(key)) {
    aiKeyReplacements.set(key, nanoid(16));
  }
  return aiKeyReplacements.get(key)!;
}

/**
 * Return a stable synthetic replacement for a decrypted owner email.
 *
 * @param email - The original decrypted owner email.
 * @returns A deterministic synthetic email for masking in generated output.
 */
function getOwnerEmailReplacement(email: string): string {
  if (!ownerEmailReplacements.has(email)) {
    ownerEmailReplacements.set(email, faker.internet.email());
  }
  return ownerEmailReplacements.get(email)!;
}

type GitignorePattern = {
  raw: string;
  negative: boolean;
  directoryOnly: boolean;
  anchored: boolean;
  hasSlash: boolean;
  regex: RegExp;
};

const gitignoreCache = new Map<string, GitignorePattern[]>();

/**
 * Parse the contents of a .gitignore file into matchable patterns.
 *
 * @param content - The raw text of a .gitignore file.
 * @returns Parsed gitignore patterns with matching metadata.
 */
function parseGitignorePatterns(content: string): GitignorePattern[] {
  return content.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line !== '' && !line.startsWith('#'))
    .map(raw => {
      let line = raw;
      const negative = line.startsWith('!');
      if (negative) line = line.slice(1);
      const directoryOnly = line.endsWith('/');
      if (directoryOnly) line = line.slice(0, -1);
      const anchored = line.startsWith('/');
      if (anchored) line = line.slice(1);
      const hasSlash = line.includes('/');
      const regex = gitignorePatternToRegex(line, anchored, directoryOnly, hasSlash);
      return { raw, negative, directoryOnly, anchored, hasSlash, regex };
    });
}

/**
 * Convert a gitignore-style pattern into a regular expression.
 *
 * @param pattern - The gitignore pattern text.
 * @param anchored - Whether the pattern is anchored to the current directory.
 * @param directoryOnly - Whether the pattern matches directories only.
 * @param hasSlash - Whether the pattern includes a slash.
 * @returns A RegExp that matches paths affected by the pattern.
 */
function gitignorePatternToRegex(pattern: string, anchored: boolean, directoryOnly: boolean, hasSlash: boolean): RegExp {
  let regex = '^';
  const escaped = pattern.split('**').map(escapeRegExp).join('.*');
  const withWildcards = escaped.replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');

  if (anchored || hasSlash) {
    regex += withWildcards;
  } else {
    regex += '(.*/)?' + withWildcards + '($|/.*)';
  }

  if (directoryOnly) {
    if (!regex.endsWith('(/.*)')) {
      regex += '(/.*)?';
    }
  }

  regex += '$';
  return new RegExp(regex);
}

/**
 * Escape special regex characters in a string.
 *
 * @param value - The string to escape.
 * @returns The escaped string safe for inclusion in a RegExp.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

/**
 * Load and cache .gitignore patterns for a directory.
 *
 * @param dir - The directory in which to look for .gitignore.
 * @returns Parsed patterns from the .gitignore file, or an empty array.
 */
function loadGitignorePatterns(dir: string): GitignorePattern[] {
  if (gitignoreCache.has(dir)) return gitignoreCache.get(dir)!;
  const patterns: GitignorePattern[] = [];
  const gitignorePath = join(dir, '.gitignore');
  if (existsSync(gitignorePath)) {
    patterns.push(...parseGitignorePatterns(readFileSync(gitignorePath, 'utf8')));
  }
  gitignoreCache.set(dir, patterns);
  return patterns;
}

/**
 * Determine whether a path is ignored by any .gitignore file in its ancestry.
 *
 * @param relativePath - A path relative to the repo root.
 * @returns True when the file is matched by .gitignore patterns.
 */
function isGitignored(relativePath: string): boolean {
  const normalizedPath = relativePath.split('\\').join('/');
  const pathSegments = normalizedPath.split('/');
  const dirs = [''];
  for (let i = 0; i < pathSegments.length - 1; i++) {
    dirs.push(dirs[i] ? `${dirs[i]}/${pathSegments[i]}` : pathSegments[i]);
  }

  let ignored = false;
  for (const dirRel of dirs) {
    const dir = dirRel ? join(ROOT, dirRel) : ROOT;
    const patterns = loadGitignorePatterns(dir);
    const relativeToGitignore = dirRel ? normalizedPath.slice(dirRel.length + 1) : normalizedPath;
    for (const pattern of patterns) {
      if (pattern.regex.test(relativeToGitignore)) {
        ignored = !pattern.negative;
      }
    }
  }
  return ignored;
}

/**
 * Mask gitignored source content before sending it to AI.
 *
 * @param relativePath - The relative path of the source file.
 * @param content - The raw file contents.
 * @returns The original content when not ignored, or a sanitized version when ignored.
 */
function getAiSafeContent(relativePath: string, content: string): string {
  if (!isGitignored(relativePath)) return content;
  console.warn(`Warning: file "${relativePath}" is gitignored. Masking sensitive content for AI input.`);
  return sanitizeGeneratedContent(content);
}

/**
 * Sanitize generated content by masking sensitive environment values and decrypted secrets.
 *
 * @param content - The raw content to sanitize.
 * @returns The sanitized content safe for writing or sending to AI.
 */
function sanitizeGeneratedContent(content: string): string {
  let sanitized = content.replaceAll('process.env.CLOUDFLARE_ACCOUNT_ID', '___cloudflare_account_id___');

  const cloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (cloudflareAccountId) {
    sanitized = sanitized.split(cloudflareAccountId).join('___cloudflare_account_id___');
  }

  for (const key of decryptedAiKeys) {
    if (!key) continue;
    sanitized = sanitized.split(key).join(getAiKeyReplacement(key));
  }

  for (const email of decryptedOwnerEmails) {
    if (!email) continue;
    sanitized = sanitized.split(email).join(getOwnerEmailReplacement(email));
  }

  return sanitized;
}

/**
 * Write a generated file to disk after applying sanitization.
 *
 * @param filePath - The absolute path to the target file.
 * @param content - The content to write.
 */
function writeGeneratedFile(filePath: string, content: string): void {
  writeFileSync(filePath, sanitizeGeneratedContent(content), 'utf8');
}

const VALID_FLAGS = new Set([
  '--help',
  '-h',
  '--dry-run',
  '--skip-ai',
  '--force',
  '--auto-refresh',
  '--discover-models',
  '--verbose',
  '--ai-json-enc',
  '--show-key-owner',
  '--key-usage-summary',
  '--no-model-fallback',
  '--fetch-timeout',
  '--max-token-override',
  '--export-masked-ai-json',
  '--manifest-only',
  '--bm25-index-only',
  '--provider',
]);

/**
 * Print CLI usage help and exit.
 *
 * @param exitCode - Exit code to use when terminating the process.
 */
function printHelp(exitCode = 0): void {
  console.log(`Usage: npx tsx ${RELATIVE_PATH} [options]

Options:
  --help, -h           Show this help message and exit
  --topic=<name>       Generate the named topic (use the topic slug from the topic list). Can be specified multiple times.
  --ai-json-enc=<file> Specify an alternative ai.json.enc config file path
  --show-key-owner     Print the owner of the API key used for each AI call
  --key-usage-summary  Print a summary of each API key's success/failure counts at the end of execution
  --export-masked-ai-json  Decrypt ai.json.enc and print a masked JSON export to stdout
  --provider=<key>     Only use models from the specified provider key
  --dry-run            Build prompts without calling the AI or writing files
  --skip-ai            Build files from extracted source only, no AI call
  --manifest-only      Build only the manifest from existing generated topic markdown files
  --bm25-index-only    Build only the BM25 index and chunk files from existing generated topic markdown files
  --force              Overwrite existing mcp/*.md files
  --auto-refresh       Only regenerate topics whose source/manualFacts checksum changed
  --discover-models    Ignore AI_MODEL and force discovery via GET /models
  --no-model-fallback  Never switch to another model on error; retry transient failures on the same model only
  --fetch-timeout=<s>       Abort a stalled AI request after this many seconds and retry (default: 90)
  --max-token-override=<n>  Override the per-request token cap (like MAX_TOKENS_PER_REQUEST env var)
  --verbose                 Show additional debug logs

Environment variables:
  AI_API_KEY           Comma-separated list of Groq API keys
  AI_MODEL             Optional pinned model ID
  AI_API_URL           Optional API endpoint override
  CRYPTOKEN            Password used to encrypt/decrypt ai.json.enc

Topics are auto-discovered from apps/mcp/src/knowledge/topics/*.ts
Each file must export a default Topic object.

Examples:
npx tsx ${RELATIVE_PATH} --topic=migrations
npx tsx ${RELATIVE_PATH} --topic=migrations --topic=do-schemas
npx tsx ${RELATIVE_PATH} --discover-models
npx tsx ${RELATIVE_PATH} --dry-run
npx tsx ${RELATIVE_PATH} --force
AI_MODEL="" AI_API_KEY="" AI_API_URL="" npx tsx ${RELATIVE_PATH} --auto-refresh --provider=gemini
`);
  process.exit(exitCode);
}

const unknownFlags = argv.filter(arg =>
  !VALID_FLAGS.has(arg) &&
  !arg.startsWith('--topic=') &&
  !arg.startsWith('--ai-json-enc=') &&
  !arg.startsWith('--provider=') &&
  !arg.startsWith('--fetch-timeout=') &&
  !arg.startsWith('--max-token-override='),
);

if (showHelp) {
  printHelp(0);
}

if (unknownFlags.length > 0) {
  console.error(`Error: unknown flag${unknownFlags.length > 1 ? 's' : ''}: ${unknownFlags.join(', ')}`);
  printHelp(1);
}

/**
 * Load a simple env file without pulling in dotenv as a dependency.
 *
 * @param envPath - Absolute path to the .env file.
 * @returns Parsed key/value pairs from the file.
 */
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

/** Maximum number of automatic retries on HTTP 429 (rate-limit) and 503 (service unavailable) responses. */
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

// ─── round-robin state ───────────────────────────────────────────────────────

/**
 * Monotonically increasing counter for API key round-robin.
 * Incremented by nextApiKey() after each call.
 */
let keyIndex = 0;
const apiKeyOwnerByKey = new Map<string, string>();
const apiKeyUsageSummary = new Map<string, { owner: string; success: number; failure: number }>();
const expiredApiKeys = new Set<string>();

/**
 * Get or initialize usage summary metadata for an API key.
 *
 * @param key - The AI API key to summarize.
 * @returns The usage summary entry for the key.
 */
function getKeySummary(key: string) {
  let summary = apiKeyUsageSummary.get(key);
  if (!summary) {
    summary = { owner: apiKeyOwnerByKey.get(key) ?? 'unknown', success: 0, failure: 0 };
    apiKeyUsageSummary.set(key, summary);
  }
  return summary;
}

/**
 * Return the next API key using strict round-robin rotation across the
 * comma-separated AI_API_KEY list.  Every key is used once before any key is
 * reused, giving the most uniform distribution of requests across rate-limit
 * buckets.
 *
 * @returns The selected API key and its owner.
 */
function nextApiKey(): { key: string; owner: string } {
  const raw = process.env.AI_API_KEY ?? '';
  if (!raw) throw new Error('AI_API_KEY is not set. Add it to your .env file.');
  const allKeys = raw.split(',').map(k => k.trim()).filter(Boolean);
  const keys = allKeys.filter(k => !expiredApiKeys.has(k));
  if (keys.length === 0) {
    throw new Error('No valid API keys available. All configured keys are expired.');
  }
  const key = keys[keyIndex % keys.length];
  const owner = apiKeyOwnerByKey.get(key) ?? 'unknown';
  keyIndex++;
  // Show in log the index of the key being used (1-based for human readability) and the total number of keys.
  if (verbose) {
    console.log(`  [ai] Using API key ${keyIndex % keys.length || keys.length}/${keys.length}`);
  }
  return { key, owner };
}

let AI_API_URL = process.env.AI_API_URL ?? 'https://api.groq.com/openai/v1';

// Cloudflare AI Gateway token — enables all AI calls to route through the gateway.
const AIG_TOKEN = process.env.CLOUDFLARE_AIG_TOKEN ?? undefined;

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
 *
 * Falls back to AI_MODEL or a default model when no discovery results exist.
 *
 * @returns The selected model ID.
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

/** Per-request cap: from --max-token-override flag, MAX_TOKENS_PER_REQUEST env var, or learned from first 413. */
let learnedRequestTokensCap: number | null =
  maxTokenOverride ??
  (process.env.MAX_TOKENS_PER_REQUEST
    ? parseInt(process.env.MAX_TOKENS_PER_REQUEST, 10)
    : null);

/**
 * Try to extract the provider's hard per-request token limit from a 413 body.
 * Groq format: "Limit 12000, Requested 15101"
 *
 * @param errorMsg - The raw error string returned by the API.
 * @returns The token cap or null when no cap can be extracted.
 */
function parseRequestTokensCap(errorMsg: string): number | null {
  const m = errorMsg.match(/Limit\s+(\d[\d,]+)[,\s]/i);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
}

// ─── per-model budget ─────────────────────────────────────────────────────────

/**
 * Wrapper around the shared getModelBudget() implementation, bound to this script's
 * global state (modelMeta, learnedRequestTokensCap, etc.).
 *
 * @param modelId - The ID of the model being used.
 * @returns The budget settings used for prompt/source sizing.
 */
function getModelBudget(modelId: string): ModelBudget {
  return getModelBudgetImpl(modelId, modelMeta, {
    defaultMaxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    maxOutputTokensCap: MAX_OUTPUT_TOKENS_CAP,
    promptOverheadTokens: PROMPT_OVERHEAD_TOKENS,
    charsPerToken: CHARS_PER_TOKEN,
    learnedRequestTokensCap,
  });
}

/**
 * Initialize the model pool by querying the provider's /models endpoint
 * or respecting a pinned AI_MODEL when discovery is disabled.
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

/**
 * Read a source file from the repo root.
 *
 * @param relativePath - File path relative to the repository root.
 * @returns File contents as a string, or an empty string if the file is missing.
 */
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
// ─── output directory ─────────────────────────────────────────────────────────
const MCP_DIR = join(ROOT, 'apps/mcp/src/knowledge/generated');
if (!dryRun) {
  mkdirSync(MCP_DIR, { recursive: true });
}

// ─── topic auto-discovery ─────────────────────────────────────────────────────
/**
 * Dynamically import all *.ts files from apps/mcp/src/knowledge/topics/.
 * Each file must export a default Topic object.
 * Files are sorted alphabetically, but topic execution order follows
 * their file names (add a numeric prefix if order matters).
 * 
 * @returns An array of Topic objects exported by the discovered files.
 */
async function loadTopics(): Promise<Topic[]> {
  if (!existsSync(TOPICS_DIR)) {
    console.warn(`  [warn] topics/ directory not found at ${TOPICS_DIR}`);
    return [];
  }

  const files = readdirSync(TOPICS_DIR)
    .filter(f => f.endsWith('.ts'))
    .sort();

  const topics: Topic[] = [];
  for (const file of files) {
    const filePath = join(TOPICS_DIR, file);
    try {
      const mod = await import(pathToFileURL(filePath).href);
      if (!mod.default || typeof mod.default !== 'object' || !mod.default.name) {
        console.warn(`  [warn] ${file} does not export a valid default Topic object — skipped.`);
        continue;
      }
      topics.push(mod.default as Topic);
    } catch (err) {
      console.error(`  [error] Failed to load topic file ${file}: ${(err as Error).message}`);
    }
  }
  return topics;
}

// ─── AI config from ai.json.enc ───────────────────────────────────────────────
/**
 * Load and apply AI configuration overrides from ai.json.enc.
 *
 * This can populate AI_API_KEY, AI_MODEL, and AI_API_URL from encrypted
 * provider config instead of relying solely on environment variables.
 */
async function loadAiConfigOverride(): Promise<void> {
  const cryptoken = process.env.CRYPTOKEN;
  const configPath = aiJsonEncFlag ? join(ROOT, aiJsonEncFlag) : join(ROOT, 'ai.json.enc');

  if (aiJsonEncFlag) {
    if (!cryptoken) {
      console.error('Error: CRYPTOKEN must be defined when --ai-json-enc is specified.');
      process.exit(1);
    }
    if (!existsSync(configPath)) {
      console.error(`Error: specified ai.json.enc file not found: ${configPath}`);
      process.exit(1);
    }
  } else if (!cryptoken || !existsSync(configPath)) {
    if (exportMaskedAiJson) {
      console.error('Error: --export-masked-ai-json requires ai.json.enc and CRYPTOKEN to be available.');
      process.exit(1);
    }
    return;
  }

  let config;
  try {
    config = await decryptAiConfig(readFileSync(configPath, 'utf8'), cryptoken);
  } catch (err) {
    if (aiJsonEncFlag || exportMaskedAiJson) {
      console.error(`Error: failed to decrypt or parse ${configPath}: ${err}`);
      process.exit(1);
    }
    console.warn(`[config] Failed to decrypt ai.json.enc: ${err}. Falling back to env vars.`);
    return;
  }

  if (exportMaskedAiJson) {
    const maskedConfig = maskAiConfig(config);
    console.log(JSON.stringify(maskedConfig, null, 2));
    process.exit(0);
  }

  decryptedAiKeys.length = 0;
  decryptedOwnerEmails.length = 0;
  for (const provider of Object.values(config.providers)) {
    for (const keyObj of provider.keys) {
      if (keyObj.key) {
        decryptedAiKeys.push(keyObj.key);
      }
      if (keyObj.owner) {
        const ownerPrefix = keyObj.owner.split('|')[0];
        const emails = ownerPrefix.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g);
        if (emails) {
          decryptedOwnerEmails.push(...emails);
        }
      }
      apiKeyOwnerByKey.set(keyObj.key, keyObj.owner ?? 'unknown');
      if (keyObj.type === 'expired') {
        expiredApiKeys.add(keyObj.key);
      }
    }
  }

  // --provider=<key> or AI_PROVIDER env var narrow to one provider
  const providerArg =
    argv.find(a => a.startsWith('--provider='))?.slice(11) ??
    process.env.AI_PROVIDER;

  const candidates = selectModels(config, providerArg ? { providerKey: providerArg } : {})
    .filter(c => c.model.usage === 'chat'); // use only chat-capable models for better output formatting and to future-proof against non-chat models appearing in the config
  if (candidates.length === 0) {
    console.warn(`[config] ai.json.enc: no models found${providerArg ? ` for provider "${providerArg}"` : ''}. Falling back to env vars.`);
    return;
  }

  const best = candidates[0]; // lowest priority number = most preferred

  // When --provider is explicitly requested, always apply the provider's config,
  // overriding any env vars that may have been loaded from .env (e.g. Groq defaults).
  const forceOverride = !!providerArg;

  if (forceOverride || !process.env.AI_API_KEY?.trim()) {
    const allKeys = collectKeys(config, providerArg ? { providerKey: providerArg } : {});
    const validKeys = allKeys.filter(k => !expiredApiKeys.has(k));
    if (validKeys.length === 0) {
      console.error('Error: no valid API keys available in ai.json.enc. All configured keys are expired.');
      process.exit(1);
    }
    process.env.AI_API_KEY = validKeys.join(',');
  }
  if (forceOverride || !process.env.AI_MODEL?.trim()) {
    process.env.AI_MODEL = best.model.id;
  }
  const { endpoint, useGateway } = resolveProviderEndpoint(best.provider, AIG_TOKEN);
  if (forceOverride || !process.env.AI_API_URL?.trim()) {
    AI_API_URL = endpoint;
  }

  if (!discoverModels) {
    const providerCandidates = candidates.filter(c => c.providerKey === best.providerKey);

    if (providerCandidates.length === 0) {
      console.error(`Error: no models found for provider "${best.providerKey}". Check ai.json.enc.`);
      process.exit(1);
    }

    modelPool = providerCandidates.map(c => resolveModelId(c.model.id, c.provider, useGateway));
    modelMeta = providerCandidates.map(c => ({
      id: resolveModelId(c.model.id, c.provider, useGateway),
      object: 'model' as const,
      created: Date.now(),
      context_window: c.model.contextWindow,
      max_completion_tokens: c.model.maxOutputTokens,
      owned_by: c.providerKey,
      active: true,
    }));

    if (verbose) {
      console.log(`  [config] modelPool (in priority order): ${modelPool.join(' → ')}`);
    }

    if (best.model.tpmLimit !== null && learnedRequestTokensCap === null) {
      learnedRequestTokensCap = best.model.tpmLimit;
      if (verbose) {
        console.log(`  [config] tpmLimit cap set to ${best.model.tpmLimit} from ${best.model.id}`);
      }
    }
  }

  console.log(
    `[config] ai.json.enc → provider="${best.providerKey}" model="${best.model.id}" (priority ${best.model.priority}) ` +
    `keys=${collectKeys(config, providerArg ? { providerKey: providerArg } : {}).length}`,
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────
/**
 * Main script entry point.
 *
 * Coordinates topic discovery, optional manifest/bm25-only modes, source-
 * based prompt generation, AI calls, and generated artifact output.
 */
async function main() {
  // Load encrypted AI config first (populates env vars + modelPool before initModels).
  await loadAiConfigOverride();

  // Discover usable models from the API before printing the summary.
  if (!dryRun && !skipAI && !bm25IndexOnly && modelPool.length === 0) {
    await initModels();
  }

  // Auto-discover all topics from apps/mcp/src/knowledge/topics/
  const ALL_TOPICS = await loadTopics();

  // Filter to the named topics if --topic= was provided one or more times.
  const topics = topicFlags.length > 0
    ? ALL_TOPICS.filter(t => topicFlags.includes(t.name))
    : ALL_TOPICS;

  const invalidTopics = topicFlags.filter(name => !ALL_TOPICS.some(t => t.name === name));
  if (invalidTopics.length > 0) {
    console.error(`Error: unknown topic(s) "${invalidTopics.join(', ')}". Available topics:`);
    for (const t of ALL_TOPICS) console.error(`  ${t.name}`);
    process.exit(1);
  }

  if (manifestOnly && bm25IndexOnly) {
    console.error('Error: --manifest-only and --bm25-index-only cannot be used together.');
    process.exit(1);
  }

  console.log(`Fufuni MCP static generator`);
  console.log(`Output dir : ${MCP_DIR}`);
  console.log(`Topics dir : ${TOPICS_DIR}`);
  console.log(`AI endpoint: ${AI_API_URL}`);
  console.log(`Dry run    : ${dryRun}`);
  console.log(`Skip AI    : ${skipAI}`);
  console.log(`Manifest only: ${manifestOnly}`);
  console.log(`BM25 index only: ${bm25IndexOnly}`);
  if (!manifestOnly && !bm25IndexOnly) {
    console.log(`Topics     : ${topics.length} (${topics.map(t => t.name).join(', ')})`);
    console.log(`Auto refresh: ${autoRefresh}`);
  }
  console.log('─'.repeat(60));

  if (bm25IndexOnly) {
    const generatedTopicNames = readdirSync(MCP_DIR)
      .filter((file) => file.endsWith('.md'))
      .map((file) => file.slice(0, -3))
      .sort();

    const generatedTopics = generatedTopicNames.map((name) => {
      const topic = ALL_TOPICS.find((t) => t.name === name);
      return topic ?? {
        name,
        description: name,
        tags: [],
        sources: [],
        systemPrompt: '',
        buildPrompt: () => '',
      };
    });

    console.log(`\nBM25 index-only mode: building index for ${generatedTopics.length} generated topic(s).`);
    const chunks = generateChunks(generatedTopics, (topicName) => {
      const path = join(MCP_DIR, `${topicName}.md`);
      return existsSync(path) ? readFileSync(path, 'utf8') : '';
    });
    const bm25Docs = generateBm25Index(chunks);
    const bm25IndexCode = `/**
 * AUTO-GENERATED by ${RELATIVE_PATH} — do not edit manually.
 */
import type { Bm25Doc } from './bm25.js';

export interface BM25Index {
  docs: Bm25Doc[];
}

export const BM25_INDEX: BM25Index = {
  docs: ${JSON.stringify(bm25Docs, null, 2)},
};
`;
    const bm25IndexPath = join(ROOT, 'apps/mcp/src/search/bm25-index.ts');
    writeGeneratedFile(bm25IndexPath, bm25IndexCode);
    console.log(`  → written BM25 index (${bm25Docs.length} documents)`);

    const chunksCode = `/**
 * AUTO-GENERATED by ${RELATIVE_PATH} — do not edit manually.
 */
export type Chunk = {
  id: string;
  topic: string;
  heading: string;
  heading_path: string[];
  text: string;
  word_count: number;
};

export const CHUNKS: Record<string, Chunk> = ${JSON.stringify(
      Object.fromEntries(chunks.map(c => [c.id, c])),
      null,
      2
    )};
`;
    const chunksPath = join(ROOT, 'apps/mcp/src/search/chunks.ts');
    writeGeneratedFile(chunksPath, chunksCode);
    console.log(`  → written chunks index (${chunks.length} chunks)`);

    console.log('\n' + '─'.repeat(60));
    console.log(`Done. generated=0 skipped=0 errors=0`);
    return;
  }

  let generated = 0;
  let skipped = 0;
  let errors = 0;

  if (!manifestOnly) {
    for (const topic of topics) {
      const outPath = join(MCP_DIR, `${topic.name}.md`);
      console.log(`\n[${topic.name}] ${topic.description}`);

      const topicChecksums = await computeTopicChecksums(topic, readSrc);
      const existing = !dryRun && existsSync(outPath) ? readFileSync(outPath, 'utf8') : undefined;
      const existingHeader = existing ? parseHeaderChecksums(existing) : {};
      const hasFailureMarker = existing?.includes('AI generation failed. Raw source below.') ?? false;

      if (!force && !dryRun && existsSync(outPath)) {
        if (hasFailureMarker) {
          console.log(`  → regenerating (previous AI generation failed)`);
        } else if (autoRefresh) {
          if (
            existingHeader.manualFactsChecksum === topicChecksums.manualFactsChecksum &&
            existingHeader.sourcesChecksum === topicChecksums.sourcesChecksum
          ) {
            console.log(`  → skipped (auto-refresh detected no changes)`);
            skipped++;
            continue;
          }
          console.log(`  → regenerating (auto-refresh detected changes)`);
        } else {
          console.log(`  → skipped (file exists; use --force to overwrite)`);
          skipped++;
          continue;
        }
      }

      /**
       * Build the per-topic prompt payload from source files.
       *
       * @param maxChars - Maximum characters to include from each source file.
       * @returns Combined source text and the assembled user prompt.
       */
      function buildContent(maxChars: number): { combinedSources: string; userPrompt: string } {
        let combined = '';
        for (const srcPath of topic.sources) {
          const originalContent = readSrc(srcPath);
          if (!originalContent) continue;
          const safeContent = getAiSafeContent(srcPath, originalContent);
          const snippet = truncate(safeContent, maxChars);
          combined += `\n\n### Source: ${srcPath}\n\`\`\`\n${snippet}\n\`\`\`\n`;
        }
        const rawPrompt = topic.buildPrompt(combined);
        return { combinedSources: combined, userPrompt: rawPrompt };
      }

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
        aiContent = `# ${topic.description}\n\n> Auto-generated from source (no AI call).\n\n${combinedSources}`;
      } else {
        try {
          const MAX_SIZE_HALVINGS = 3;
          const modelsToTry = modelPool.length > 0 ? [...modelPool] : [nextModel()];
          let succeeded = false;
          let halvings = 0;

          modelLoop: while (halvings <= MAX_SIZE_HALVINGS) {
            for (let attempt = 0; attempt < modelsToTry.length; attempt++) {
              const chosenModel = modelsToTry[attempt];
              const sizeNote = halvings > 0 ? ` [src budget ${charsPerSource} chars]` : '';
              const retryNote = attempt > 0 ? ` (model fallback ${attempt}/${modelsToTry.length - 1})` : '';
              console.log(`  → calling AI [${chosenModel}]${sizeNote}${retryNote}…`);
              let keySummary: { owner: string; success: number; failure: number } | undefined;
              let abortTimer: ReturnType<typeof setTimeout> | undefined;
              try {
                const apiKeyEntry = nextApiKey();
                const apiKey = apiKeyEntry.key;
                const apiKeyOwner = apiKeyEntry.owner;
                keySummary = getKeySummary(apiKey);
                if (showKeyOwner) {
                  console.log(`  → using key owned by [${apiKeyOwner || 'unknown'}]`);
                }

                const abortCtrl = new AbortController();
                abortTimer = setTimeout(() => abortCtrl.abort(), fetchTimeoutMs);

                const { maxOutputTokens } = getModelBudget(chosenModel);
                const result = await callAi(topic.systemPrompt, userPrompt, {
                  apiUrl: AI_API_URL,
                  apiKey,
                  model: chosenModel,
                  maxTokens: maxOutputTokens,
                  abortSignal: abortCtrl.signal,
                  verbose,
                  showKeyOwner,
                  keyOwner: apiKeyOwner,
                  aigToken: AIG_TOKEN,
                });
                clearTimeout(abortTimer);

                aiContent = result.content;
                aiMeta = { model: chosenModel, tokensIn: result.tokensIn, tokensOut: result.tokensOut };
                console.log(`  → received ${result.tokensOut} tokens out (${result.tokensIn} in)`);
                keySummary.success++;
                succeeded = true;
                break modelLoop;
              } catch (innerErr) {
                if (abortTimer) clearTimeout(abortTimer);
                if (keySummary) keySummary.failure++;
                const msg = (innerErr as Error).message;
                const is413 = msg.includes('413') || msg.includes('Request too large') || msg.includes('rate_limit_exceeded');
                if (is413) {
                  if (learnedRequestTokensCap === null) {
                    const cap = parseRequestTokensCap(msg);
                    if (cap) {
                      learnedRequestTokensCap = cap;
                      console.log(`  [info] Learned per-request token cap: ${cap} tokens — future topics will use this limit directly.`);
                    }
                  }
                  if (halvings < MAX_SIZE_HALVINGS) {
                    halvings++;
                    charsPerSource = Math.floor(charsPerSource / 2);
                    console.warn(
                      `  [warn] 413 — prompt too large. Halving source budget to ${charsPerSource} chars/file (halving ${halvings}/${MAX_SIZE_HALVINGS})…`,
                    );
                    ({ combinedSources, userPrompt } = buildContent(charsPerSource));
                    continue modelLoop;
                  }
                  if (attempt < modelsToTry.length - 1) {
                    console.warn(`  [warn] ${chosenModel} still too large after max halvings, trying next model…`);
                    continue;
                  }
                } else if (!noModelFallback && attempt < modelsToTry.length - 1) {
                  console.warn(`  [warn] ${chosenModel} failed (${msg.slice(0, 80)}), trying next model…`);
                  continue;
                } else if (noModelFallback && attempt < modelsToTry.length - 1) {
                  console.warn(`  [warn] ${chosenModel} failed (${msg.slice(0, 80)}). --no-model-fallback active, not switching model.`);
                }
                throw innerErr;
              }
            }
            break;
          }

          if (!succeeded) {
            throw new Error('All models rejected the prompt (too large or all keys exhausted)');
          }
        } catch (err) {
          console.error(`  [error] AI call failed: ${(err as Error).message}`);
          errors++;
          aiContent = `# ${topic.description}\n\n> AI generation failed. Raw source below.\n\n${combinedSources}`;
        }
      }

      // Extract AI-generated mcp-description (if present) then strip it from content.
      const mcpDescMatch = aiContent.match(/^<!--mcp-description:\s*(.+?)-->\n?/);
      const mcpDescription = mcpDescMatch?.[1]?.trim() ?? topic.description;
      if (mcpDescMatch) aiContent = aiContent.slice(mcpDescMatch[0].length);

      const header = buildHeader(mcpDescription, {
        ...aiMeta,
        apiEndpoint: AI_API_URL,
        manualFactsChecksum: topicChecksums.manualFactsChecksum,
        sourcesChecksum: topicChecksums.sourcesChecksum,
        sourceFileHashes: topicChecksums.sourceFileHashes,
      });
      const fileContent = header + aiContent +
        (topic.staticAppend ? '\n\n' + topic.staticAppend : '');

      writeGeneratedFile(outPath, fileContent);
      console.log(`  → written to mcp/${topic.name}.md`);
      generated++;
    }
  }

  // ─── generate manifest ──────────────────────────────────────────────────────
  console.log('\nGenerating manifest...');
  const generatedAt = new Date().toISOString();
  const commit = await (async () => {
    try {
      const commits = await gitlog({
        repo: ROOT,
        number: 1,
        fields: ['abbrevHash'] as const,
        execOptions: { cwd: ROOT, maxBuffer: 1000 * 1024 },
      });
      return commits[0]?.abbrevHash ?? 'unknown';
    } catch {
      return 'unknown';
    }
  })();

  const status = (() => {
    try {
      return execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim();
    } catch {
      return '';
    }
  })();
  const commitRef = status ? `${commit}-dirty` : commit;

  const generatedTopicNames = readdirSync(MCP_DIR)
    .filter((file) => file.endsWith('.md'))
    .map((file) => file.slice(0, -3))
    .sort();

  const generatedTopics = generatedTopicNames.map((name) => {
    const topic = ALL_TOPICS.find((t) => t.name === name);
    return topic ?? {
      name,
      description: name,
      tags: [],
      sources: [],
      systemPrompt: '',
      buildPrompt: () => '',
    };
  });

  if (manifestOnly) {
    console.log(`\nManifest-only mode: building manifest for ${generatedTopics.length} generated topic(s).`);
  }

  const manifestData = buildManifest(generatedTopics, {
    commit: commitRef,
    now: generatedAt,
    getTopicMarkdown: (topicName) => {
      const path = join(MCP_DIR, `${topicName}.md`);
      return existsSync(path) ? readFileSync(path, 'utf8') : '';
    },
  });

  const manifestCode = `/**
 * AUTO-GENERATED by ${RELATIVE_PATH} — do not edit manually.
 * This file is gitignored; it is rebuilt before every deploy.
 */
import type { TopicManifest } from './index.js';

export const MANIFEST_GENERATED_AT = ${JSON.stringify(generatedAt)};
export const MANIFEST_COMMIT = ${JSON.stringify(commitRef)};

export const MANIFEST: TopicManifest = ${JSON.stringify(manifestData, null, 2)};
`;

  const manifestPath = join(ROOT, 'apps/mcp/src/manifest.ts');
  writeGeneratedFile(manifestPath, manifestCode);
  console.log(`  → written to apps/mcp/src/manifest.ts`);

  if (manifestOnly) {
    console.log('\nManifest-only mode complete. Skipping BM25 index and chunk generation.');
    console.log('\n' + '─'.repeat(60));
    console.log(`Done. generated=${generated} skipped=${skipped} errors=${errors}`);
    if (showKeyUsageSummary) {
      console.log('\nKey usage summary:');
      for (const [key, summary] of apiKeyUsageSummary.entries()) {
        const prefix = key.slice(0, 5);
        const suffix = key.slice(-5);
        console.log(`  [key (first 5 chars "${prefix}" … last 5 chars "${suffix}")] owned by [${summary.owner}] succeed ${summary.success} times failed ${summary.failure} times`);
      }
    }
    if (errors > 0) process.exit(1);
    return;
  }

  // ─── generate BM25 index and chunks ──────────────────────────────────────
  console.log('\nGenerating search indexes...');

  // Generate chunks first (needed for BM25 indexing)
  const chunks = generateChunks(generatedTopics, (topicName) => {
    const path = join(MCP_DIR, `${topicName}.md`);
    return existsSync(path) ? readFileSync(path, 'utf8') : '';
  });
  
  // Then generate BM25 index from chunks
  const bm25Docs = generateBm25Index(chunks);
  const bm25IndexCode = `/**
 * AUTO-GENERATED by ${RELATIVE_PATH} — do not edit manually.
 */
import type { Bm25Doc } from './bm25.js';

export interface BM25Index {
  docs: Bm25Doc[];
}

export const BM25_INDEX: BM25Index = {
  docs: ${JSON.stringify(bm25Docs, null, 2)},
};
`;

  const bm25IndexPath = join(ROOT, 'apps/mcp/src/search/bm25-index.ts');
  writeGeneratedFile(bm25IndexPath, bm25IndexCode);
  console.log(`  → written BM25 index (${bm25Docs.length} documents)`);

  // Write chunks
  const chunksCode = `/**
 * AUTO-GENERATED by ${RELATIVE_PATH} — do not edit manually.
 */
export type Chunk = {
  id: string;
  topic: string;
  heading: string;
  heading_path: string[];
  text: string;
  word_count: number;
};

export const CHUNKS: Record<string, Chunk> = ${JSON.stringify(
    Object.fromEntries(chunks.map(c => [c.id, c])),
    null,
    2
  )};
`;

  const chunksPath = join(ROOT, 'apps/mcp/src/search/chunks.ts');
  writeGeneratedFile(chunksPath, chunksCode);
  console.log(`  → written chunks index (${chunks.length} chunks)`);

  console.log('\n' + '─'.repeat(60));
  console.log(`Done. generated=${generated} skipped=${skipped} errors=${errors}`);

  if (showKeyUsageSummary) {
    console.log('\nKey usage summary:');
    for (const [key, summary] of apiKeyUsageSummary.entries()) {
      const prefix = key.slice(0, 5);
      const suffix = key.slice(-5);
      console.log(`  [key (first 5 chars "${prefix}" … last 5 chars "${suffix}")] owned by [${summary.owner}] succeed ${summary.success} times failed ${summary.failure} times`);
    }
  }

  if (errors > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
