// Copyright (c) 2024-2026 Ronan LE MEILLAT
// License: AGPL-3.0-or-later

import type { ApiKeyWithOwner, EmbeddingResult } from './types.js';
import { shuffleArray, float32ArrayToBase64 } from './helpers.js';

/**
 * Generate an embedding vector for a text string using Gemini endpoints.
 *
 * This helper rotates API keys on retryable failures and returns both the
 * embedding vector and per-key success/failure statistics.
 *
 * @param text - Text to embed.
 * @param options - Embedding request configuration.
 * @returns Embedding result or null if no keys are available.
 */
export async function generateEmbedding(
  text: string,
  options: {
    fetch?: typeof fetch;
    apiKeys: ApiKeyWithOwner[];
    maxRetries?: number;
    model?: string;
    vectorDimension?: number;
    taskType?: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT';
    /**
     * Cloudflare AI Gateway base URL (without the /compat suffix).
     * E.g. "https://gateway.ai.cloudflare.com/v1/{accountId}/{gatewayId}"
     * When set together with aigToken, embeddings are routed through the gateway
     * using the native Gemini embedContent path.
     */
    gatewayBaseUrl?: string;
    /** Cloudflare AI Gateway bearer token. Required when gatewayBaseUrl is set. */
    aigToken?: string;
  },
): Promise<EmbeddingResult | null> {
  // Route through Cloudflare AI Gateway native path when gateway config is present
  if (options.gatewayBaseUrl && options.aigToken) {
    return generateEmbeddingViaGateway(text, options as Parameters<typeof generateEmbeddingViaGateway>[1]);
  }

  const fetchFn = options.fetch ?? globalThis.fetch;
  const apiKeys = options.apiKeys ?? [];
  const shuffledKeys = shuffleArray(apiKeys.slice());
  const maxRetries = options.maxRetries ?? Math.max(shuffledKeys.length - 1, 0);
  const statsMap = new Map<string, { key: string; owner: string; nbTry: number; nbSuccess: number; nbFail: number }>();

  for (const keyEntry of shuffledKeys) {
    statsMap.set(keyEntry.key, {
      key: keyEntry.key,
      owner: keyEntry.owner,
      nbTry: 0,
      nbSuccess: 0,
      nbFail: 0,
    });
  }

  if (shuffledKeys.length === 0) {
    console.warn('  [warn] API keys not set, skipping embeddings generation');
    return null;
  }

  const model = options.model ?? 'gemini-embedding-001';
  const taskType = options.taskType ?? 'RETRIEVAL_DOCUMENT';
  const truncated = text.split(/\s+/).slice(0, 500).join(' ');
  const baseUrl = 'https://generativelanguage.googleapis.com';
  const candidates = [`/v1beta/models/${model}:embedContent`];
  const RETRYABLE_STATUSES = new Set([403, 429, 500, 502, 503, 504]);

  let keyIndex = 0;
  let currentKey = shuffledKeys[keyIndex].key;
  let currentOwner = shuffledKeys[keyIndex].owner;

  for (const path of candidates) {
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        const url = `${baseUrl}${path}?key=${currentKey}`;
        const body = {
          model,
          content: { parts: [{ text: truncated }] },
          output_dimensionality: options.vectorDimension ?? 768,
          taskType,
        };

        const requestStat = statsMap.get(currentKey);
        if (requestStat) requestStat.nbTry += 1;
        const response = await fetchFn(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (response.status === 404) {
          break; // Try next candidate path
        }

        if (RETRYABLE_STATUSES.has(response.status)) {
          const textBody = await response.text();
          const failureStat = statsMap.get(currentKey);
          if (failureStat) failureStat.nbFail += 1;
          console.warn(`  [warn] Embedding API error key owner: ${currentOwner} (${path}): ${response.status} — ${textBody.slice(0, 200)}`);
          if (attempt < maxRetries) {
            keyIndex = (keyIndex + 1) % apiKeys.length;
            currentKey = apiKeys[keyIndex].key;
            currentOwner = apiKeys[keyIndex].owner;
            console.warn(`  [warn] Rotating to key owner: ${currentOwner}`);
            attempt++;
            continue;
          }
          break;
        }

        if (!response.ok) {
          const textBody = await response.text();
          console.warn(`  [warn] Embedding API error key owner: ${currentOwner} (${path}): ${response.status} — ${textBody.slice(0, 200)}`);
          break;
        }

        const data = await response.json() as any;
        const embedding =
          data.embedding?.values ||
          data.embeddings?.[0]?.embedding ||
          data.data?.[0]?.embedding ||
          data[0]?.embedding;

        if (!Array.isArray(embedding)) {
          const failureStat = statsMap.get(currentKey);
          if (failureStat) failureStat.nbFail += 1;
          console.warn('  [warn] Invalid embedding response format, skipping embeddings');
          return {
            connection: null,
            vector: [],
            stats: Array.from(statsMap.values()),
          };
        }

        const successStat = statsMap.get(currentKey);
        if (successStat) successStat.nbSuccess += 1;
        return {
          connection: 'direct',
          vector: embedding as number[],
          stats: Array.from(statsMap.values()),
        };
      } catch (err) {
        const failureStat = statsMap.get(currentKey);
        if (failureStat) failureStat.nbFail += 1;
        console.warn(`  [warn] Embedding generation failed on candidate ${path}: ${(err as Error).message}`);
        if (attempt < maxRetries) {
          keyIndex = (keyIndex + 1) % apiKeys.length;
          currentKey = apiKeys[keyIndex].key;
          currentOwner = apiKeys[keyIndex].owner;
          console.warn(`  [warn] Rotating to key owner: ${currentOwner}`);
          attempt++;
          continue;
        }
        break;
      }
    }
  }

  console.warn('  [warn] No Gemini embedding endpoint succeeded, skipping embeddings');
  return { vector: [], stats: Array.from(statsMap.values()), connection: null };
}

/**
 * Generate an embedding using the Cloudflare AI Gateway native Gemini path.
 *
 * This function calls the native Gemini embedContent endpoint through the gateway,
 * which supports taskType and output_dimensionality parameters (not available
 * through the OpenAI-compatible compat path).
 *
 * URL pattern: {gatewayBaseUrl}/google-ai-studio/v1beta/models/{model}:embedContent
 *
 * @internal Called by generateEmbedding() when gateway config is present.
 */
async function generateEmbeddingViaGateway(
  text: string,
  options: {
    fetch?: typeof fetch;
    apiKeys: ApiKeyWithOwner[];
    maxRetries?: number;
    model?: string;
    vectorDimension?: number;
    taskType?: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT';
    gatewayBaseUrl: string;
    aigToken: string;
  },
): Promise<EmbeddingResult | null> {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const apiKeys = options.apiKeys ?? [];
  const shuffledKeys = shuffleArray(apiKeys.slice());
  const maxRetries = options.maxRetries ?? Math.max(shuffledKeys.length - 1, 0);
  const statsMap = new Map<string, { key: string; owner: string; nbTry: number; nbSuccess: number; nbFail: number }>();

  for (const keyEntry of shuffledKeys) {
    statsMap.set(keyEntry.key, { key: keyEntry.key, owner: keyEntry.owner, nbTry: 0, nbSuccess: 0, nbFail: 0 });
  }

  if (shuffledKeys.length === 0) {
    console.warn('  [warn] API keys not set, skipping embeddings generation');
    return null;
  }

  // Strip any gateway prefix from model ID — native Gemini path uses the raw model name
  const rawModel = (options.model ?? 'gemini-embedding-001').replace(/^[^/]+\//, '');
  const taskType = options.taskType ?? 'RETRIEVAL_DOCUMENT';
  const truncated = text.split(/\s+/).slice(0, 500).join(' ');
  const baseUrl = options.gatewayBaseUrl.replace(/\/$/, '');
  const url = `${baseUrl}/google-ai-studio/v1beta/models/${rawModel}:embedContent`;
  const RETRYABLE_STATUSES = new Set([403, 429, 500, 502, 503, 504]);

  let keyIndex = 0;
  let currentKey = shuffledKeys[keyIndex].key;
  let currentOwner = shuffledKeys[keyIndex].owner;

  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const body = {
        model: rawModel,
        content: { parts: [{ text: truncated }] },
        output_dimensionality: options.vectorDimension ?? 1536,
        taskType,
      };

      const requestStat = statsMap.get(currentKey);
      if (requestStat) requestStat.nbTry += 1;

      const response = await fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-aig-authorization': `Bearer ${options.aigToken}`,
          'x-goog-api-key': currentKey,
        },
        body: JSON.stringify(body),
      });

      if (RETRYABLE_STATUSES.has(response.status)) {
        const textBody = await response.text();
        const failureStat = statsMap.get(currentKey);
        if (failureStat) failureStat.nbFail += 1;
        console.warn(`  [warn] Gateway embedding error key owner: ${currentOwner}: ${response.status} — ${textBody.slice(0, 200)}`);
        if (attempt < maxRetries) {
          keyIndex = (keyIndex + 1) % apiKeys.length;
          currentKey = apiKeys[keyIndex].key;
          currentOwner = apiKeys[keyIndex].owner;
          console.warn(`  [warn] Rotating to key owner: ${currentOwner}`);
          attempt++;
          continue;
        }
        break;
      }

      if (!response.ok) {
        const textBody = await response.text();
        console.warn(`  [warn] Gateway embedding error key owner: ${currentOwner}: ${response.status} — ${textBody.slice(0, 200)}`);
        break;
      }

      // Native Gemini response: { embedding: { values: number[] }, usageMetadata: {...} }
      const data = await response.json() as { embedding?: { values: number[] } };
      const embedding = data.embedding?.values;

      if (!Array.isArray(embedding)) {
        const failureStat = statsMap.get(currentKey);
        if (failureStat) failureStat.nbFail += 1;
        console.warn('  [warn] Invalid gateway embedding response format, skipping embeddings');
        return { vector: [], stats: Array.from(statsMap.values()), connection: null };
      }

      const successStat = statsMap.get(currentKey);
      if (successStat) successStat.nbSuccess += 1;
      return { vector: embedding, stats: Array.from(statsMap.values()), connection: 'gateway' };
    } catch (err) {
      const failureStat = statsMap.get(currentKey);
      if (failureStat) failureStat.nbFail += 1;
      console.warn(`  [warn] Gateway embedding failed: ${(err as Error).message}`);
      if (attempt < maxRetries) {
        keyIndex = (keyIndex + 1) % apiKeys.length;
        currentKey = apiKeys[keyIndex].key;
        currentOwner = apiKeys[keyIndex].owner;
        console.warn(`  [warn] Rotating to key owner: ${currentOwner}`);
        attempt++;
        continue;
      }
      break;
    }
  }

  console.warn('  [warn] Cloudflare AI Gateway embedding failed, skipping');
  return { vector: [], stats: Array.from(statsMap.values()), connection: null };
}

/**
 * Summarize embedding API usage statistics across multiple batches.
 *
 * Accumulates tries, successes and failures for each API key.
 *
 * @param statsList - Array of embedding stats arrays.
 * @returns Aggregated stats per API key.
 */
export function summarizeEmbeddingStats(
  statsList: EmbeddingResult['stats'][],
): EmbeddingResult['stats'] {
  const summary = new Map<string, EmbeddingResult['stats'][number]>();

  for (const stats of statsList) {
    for (const entry of stats) {
      const existing = summary.get(entry.key);
      if (existing) {
        existing.nbTry += entry.nbTry;
        existing.nbSuccess += entry.nbSuccess;
        existing.nbFail += entry.nbFail;
      } else {
        summary.set(entry.key, { ...entry });
      }
    }
  }

  return Array.from(summary.values());
}

/**
 * Normalize a numeric vector to unit length for cosine similarity.
 *
 * This is used by the search pipeline to compare embeddings reliably.
 *
 * @param vec - Input numeric vector.
 * @returns A new normalized vector.
 */
export function normalizeVector(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return vec.map((v) => v / (norm || 1));
}

/**
 * Build a TypeScript module containing encoded vectors and metadata.
 *
 * The generated string is written to a file and imported by the Worker.
 *
 * @param embeddings - List of embedding vectors.
 * @param chunkIds - Parallel array of chunk ids.
 * @param vectorDim - Expected dimension of each vector.
 * @param vectorModel - Model identifier used to generate these embeddings.
 * @returns TypeScript source code as a string.
 */
export function buildVectorsModule(
  embeddings: number[][],
  chunkIds: string[],
  vectorDim: number,
  vectorModel = 'gemini-embedding-001',
): string {
  const totalVectors = embeddings.length;
  const buffer = new ArrayBuffer(Float32Array.BYTES_PER_ELEMENT * vectorDim * totalVectors);
  const floatView = new Float32Array(buffer);
  let offset = 0;

  for (const embedding of embeddings) {
    if (embedding.length !== vectorDim) {
      throw new Error(`Embedding length mismatch: expected ${vectorDim}, got ${embedding.length}`);
    }
    for (const value of embedding) {
      floatView[offset++] = value;
    }
  }

  const vectorsB64 = float32ArrayToBase64(floatView);

  return `/**
 * AUTO-GENERATED by apps/mcp/scripts/gen-knowledge.ts — do not edit manually.
 */
export const VECTOR_MODEL = ${JSON.stringify(vectorModel)};
export const VECTOR_DIM = ${vectorDim};
export const VECTOR_COUNT = ${totalVectors};

/**
 * Base64-encoded Float32 buffer, concatenated in chunk order.
 * Layout: [chunk0_v0, chunk0_v1, …, chunk0_v${vectorDim - 1}, chunk1_v0, …]
 */
export const VECTORS_B64 = ${JSON.stringify(vectorsB64)};

/** Parallel array: chunk IDs in the same order as VECTORS_B64. */
export const CHUNK_IDS: readonly string[] = ${JSON.stringify(chunkIds)};
`;
}
