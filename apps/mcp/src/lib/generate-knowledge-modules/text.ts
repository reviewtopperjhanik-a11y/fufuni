// Copyright (c) 2024-2026 Ronan LE MEILLAT
// License: AGPL-3.0-or-later

import type { GeneratedChunk, Bm25Doc } from './types.js';

const DEFAULT_MAX_SOURCE_CHARS = 14_000;
const CHARS_PER_TOKEN = 4;

const STOP_WORDS_SET = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'have', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that',
  'the', 'to', 'was', 'were', 'will', 'with', 'about', 'also', 'any',
  'been', 'but', 'can', 'could', 'do', 'does', 'doing', 'down', 'each',
]);

/**
 * Truncate a text block while preserving whole lines for readability.
 *
 * This helper is used to reduce source context size before sending it to AI APIs.
 * If truncation occurs, a visible marker is appended.
 *
 * @param text - The text to truncate.
 * @param maxChars - Maximum allowed characters.
 * @returns The possibly truncated string.
 */
export function truncate(text: string, maxChars = DEFAULT_MAX_SOURCE_CHARS): string {
  if (text.length <= maxChars) return text;
  const cut = text.lastIndexOf('\n', maxChars);
  return text.slice(0, cut > 0 ? cut : maxChars) + '\n…[truncated for token budget]';
}

/**
 * Compute a rough token estimate from a text string.
 *
 * This is a heuristic used to approximate prompt size without a tokenizer.
 *
 * @param text - The text to estimate.
 * @returns The approximate token count.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Parse a retry-after delay from an API error response.
 *
 * This helper supports both human-readable messages and the Retry-After header.
 *
 * @param errorBody - The body text returned by the API.
 * @param retryAfterHeader - Optional Retry-After header value.
 * @param attempt - Current retry attempt number.
 * @returns Milliseconds to wait before retrying.
 */
export function parseRetryAfterMs(
  errorBody: string,
  retryAfterHeader: string | null,
  attempt: number,
): number {
  const match = errorBody.match(/try again in ([\d.]+)s/i);
  if (match) return Math.ceil(parseFloat(match[1]) * 1_000) + 500;
  if (retryAfterHeader) return (parseInt(retryAfterHeader, 10) + 1) * 1_000;
  return Math.min(5_000 * Math.pow(2, attempt), 60_000);
}

/**
 * Convert raw text into searchable normalized terms.
 *
 * This tokenizer lowercases the text, removes punctuation, and filters stop words.
 *
 * @param text - The text to tokenize.
 * @returns A list of normalized tokens.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_\-]+/g)
    .filter((token) => token.length > 1 && !STOP_WORDS_SET.has(token));
}

/**
 * Build a lightweight BM25-style index from generated chunks.
 *
 * This function is used by the knowledge generation pipeline to create
 * a token index for semantic search and retrieval.
 *
 * @param chunks - Generated chunks containing text content.
 * @returns BM25 documents containing chunk ids and token lists.
 */
export function generateBm25Index(chunks: GeneratedChunk[]): Bm25Doc[] {
  return chunks.map((chunk) => ({
    id: chunk.id,
    terms: tokenize(chunk.text),
  }));
}
