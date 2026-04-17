/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 *
 * base.ts — Shared types, constants and helpers for the Fufuni MCP knowledge-base generator.
 * Imported by individual topic files and by generate.ts.
 */

// ── Topic type ────────────────────────────────────────────────────────────────

/**
 * Each topic produces one Markdown file in mcp/.
 *
 * Fields:
 *   name         File stem (mcp/<name>.md)
 *   description  One-line description shown in logs
 *   sources      Relative paths (from repo root) of source files to include verbatim in the prompt
 *   systemPrompt Role / format instructions for the AI
 *   buildPrompt  Function that receives the collected source text and returns the
 *                full user prompt sent to the AI.
 *   manualFacts  Curated facts that the AI must incorporate into the document.
 *                Injected into the user prompt under a "## Verified facts" heading.
 *   staticAppend Verbatim Markdown appended AFTER the AI-generated section.
 *   maxSourceChars Override the per-file character budget for source truncation.
 */
export type Topic = {
  name: string;
  description: string;
  sources: string[];
  systemPrompt: string;
  buildPrompt: (sources: string) => string;
  manualFacts?: string[];
  staticAppend?: string;
  maxSourceChars?: number;
};

// ── Shared system prompt fragment reused across topics ──────────────────────

export const BASE_SYSTEM = `You are a senior TypeScript developer documenting the Fufuni e‑commerce framework.
Fufuni runs on Cloudflare Workers + Durable Objects (SQLite) for the backend (Hono + Zod‑OpenAPI),
and React 19 + Vite + HeroUI v3 for the frontend.

WRITING RULES:
- Write in ENGLISH, using structured Markdown with typed code blocks (typescript, sql, bash, etc.)
- Every section must contain AT LEAST one complete and functional code example
- Examples must reflect the REAL conventions of the codebase (imports, naming, structure)
- Use only ## and ### headings — never # (reserved for the whole file)
- Target audience: junior developers contributing to the framework
- Target length: 800 to 1500 words per topic
- When "## Verified facts" are provided, they have PRIORITY over the source code — treat them as absolute truth
- NEVER start with a generic introductory sentence — jump straight into the topic
- NEVER add a final note such as "I hope this documentation is helpful"

REQUIRED FIRST LINE: Before any Markdown heading, output exactly one HTML comment:
<!--mcp-description: <one sentence ≤ 200 chars answering "when should an AI call this tool?">-->
Example: <!--mcp-description: Call this when adding a Hono route, middleware, or sub-router to the Fufuni backend.-->`;

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Append the manualFacts block to a user prompt when facts are provided.
 * Keeps individual buildPrompt functions clean — they don't need to know about facts.
 */
export function appendFacts(prompt: string, facts?: string[]): string {
  if (!facts || facts.length === 0) return prompt;
  const block = facts.map(f => `- ${f}`).join('\n');
  return `${prompt}\n\n## Verified facts (treat as authoritative)\n${block}`;
}
