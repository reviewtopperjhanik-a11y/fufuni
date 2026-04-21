// Copyright (c) 2024-2026 Ronan LE MEILLAT
// License: AGPL-3.0-or-later

import type { Topic } from '../../knowledge/base.js';
import { selectModels } from './ai-enc.js';
import type { AiConfig, AiProtocol } from './ai-enc.js';

export type HeaderMeta = {
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  manualFactsChecksum?: string;
  sourcesChecksum?: string;
  sourceFileHashes?: Record<string, string>;
  apiEndpoint?: string;
};

export type GeneratedChunk = {
  id: string;
  topic: string;
  heading: string;
  heading_path: string[];
  text: string;
  word_count: number;
};

export type Bm25Doc = {
  id: string;
  terms: string[];
};

export type TopicManifest = {
  generated_at: string;
  commit: string;
  manifest_version: '1.0.0';
  topics: Array<{
    slug: string;
    title: string;
    description: string;
    tags: string[];
    updated_at: string;
    word_count: number;
    sources_checksum: string;
  }>;
};

const DEFAULT_MAX_SOURCE_CHARS = 14_000;
const CHARS_PER_TOKEN = 4;

/**
 * Truncate a text block to a maximum number of characters.
 * Keeps the text intact when it fits within the limit,
 * otherwise truncates at the last newline before the limit and appends a marker.
 *
 * @param text - The input string to truncate.
 * @param maxChars - The maximum number of characters to preserve.
 * @returns A safe shortened text string.
 */
export function truncate(text: string, maxChars = DEFAULT_MAX_SOURCE_CHARS): string {
  if (text.length <= maxChars) return text;
  const cut = text.lastIndexOf('\n', maxChars);
  return text.slice(0, cut > 0 ? cut : maxChars) + '\n…[truncated for token budget]';
}

/**
 * Estimate the number of tokens for a given text using a simple character heuristic.
 * This is used to approximate prompt size without calling an external tokenizer.
 *
 * @param text - The string whose token count should be estimated.
 * @returns The estimated token count.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Parse a retry delay from an AI API error response.
 * Supports both human-readable retry messages and Retry-After headers.
 *
 * @param errorBody - The body text of the API error response.
 * @param retryAfterHeader - The value of the Retry-After header if present.
 * @param attempt - The current retry attempt number for exponential backoff.
 * @returns The number of milliseconds to wait before retrying.
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

const STOP_WORDS_SET = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'have', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that',
  'the', 'to', 'was', 'were', 'will', 'with', 'about', 'also', 'any',
  'been', 'but', 'can', 'could', 'do', 'does', 'doing', 'down', 'each',
]);

/**
 * Convert text into a list of searchable terms.
 * Lowercases the input and removes punctuation, numbers, and stop words.
 *
 * @param text - The raw text to tokenize.
 * @returns An array of normalized terms.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_\-]+/g)
    .filter((token) => token.length > 1 && !STOP_WORDS_SET.has(token));
}

/**
 * Build a lightweight BM25-style index from generated chunks.
 * This index stores searchable tokens for each chunk by id.
 *
 * @param chunks - The generated text chunks to index.
 * @returns An array of BM25 documents containing chunk ids and terms.
 */
export function generateBm25Index(chunks: GeneratedChunk[]): Bm25Doc[] {
  return chunks.map((chunk) => ({
    id: chunk.id,
    terms: tokenize(chunk.text),
  }));
}

/**
 * Generate an embedding vector for a text string using Google Gemini endpoints.
 * The function truncates very long input, retries alternate endpoints,
 * and returns null when embedding generation is unavailable or fails.
 *
 * @param text - The text to convert into an embedding.
 * @param options - Configuration for the embedding request.
 * @param options.fetch - Optional fetch implementation for testing or environments.
 * @param options.apiKeys - API keys used to authorize the request and rotate on retryable failures.
 * @param options.maxRetries - Maximum number of key-rotation retries on recoverable errors (default: 3).
 * @param options.model - Optional model identifier to request.
 * @param options.vectorDimension - Expected dimension of the embedding vector (default: 768).
 * @returns A numeric embedding vector or null when the operation is skipped.
 */
export async function generateEmbedding(
  text: string,
  options: {
    fetch?: typeof fetch;
    apiKeys: ApiKeyWithOwner[];
    maxRetries?: number;
    model?: string;
    vectorDimension?: number;
  },
): Promise<number[] | null> {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const apiKeys = options.apiKeys ?? [];
  const shuffledKeys = shuffleArray(apiKeys.slice());
  const maxRetries = options.maxRetries ?? Math.max(shuffledKeys.length - 1, 0);

  if (shuffledKeys.length === 0) {
    console.warn('  [warn] API keys not set, skipping embeddings generation');
    return null;
  }

  const model = options.model ?? 'gemini-embedding-001';
  const truncated = text.split(/\s+/).slice(0, 500).join(' ');
  const baseUrl = 'https://generativelanguage.googleapis.com';
  const candidates = [
    `/v1beta/models/${model}:embedContent`,
  ];

  // Retryable HTTP status codes: quota/rate-limit/server errors
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
          taskType: 'RETRIEVAL_QUERY',
        };

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
          console.warn(`  [warn] Embedding API error key owner: ${currentOwner} (${path}): ${response.status} — ${textBody.slice(0, 200)}`);
          if (attempt < maxRetries) {
            keyIndex = (keyIndex + 1) % apiKeys.length;
            currentKey = apiKeys[keyIndex].key;
            currentOwner = apiKeys[keyIndex].owner;
            console.warn(`  [warn] Rotating to key owner: ${currentOwner}`);
            attempt++;
            continue;
          }
          break; // No more keys to try
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
          console.warn('  [warn] Invalid embedding response format, skipping embeddings');
          return null;
        }

        return embedding as number[];
      } catch (err) {
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
  return null;
}

/**
 * Normalize a numeric vector to unit length.
 * This is useful when comparing embeddings with cosine similarity.
 *
 * @param vec - The vector to normalize.
 * @returns A new unit-length vector.
 */
export function normalizeVector(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return vec.map((v) => v / (norm || 1));
}

/**
 * Convert a Float32Array to a base64 string.
 * This is useful for serializing binary vector data in text-based modules.
 *
 * @param data - The Float32Array buffer to encode.
 * @returns The base64-encoded representation of the buffer.
 */
export function float32ArrayToBase64(data: Float32Array): string {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  if (typeof (globalThis as any).btoa === 'function') {
    return (globalThis as any).btoa(binary);
  }

  const nodeBuffer = (globalThis as any).Buffer;
  if (typeof nodeBuffer === 'function') {
    return nodeBuffer.from(binary, 'binary').toString('base64');
  }

  throw new Error('Unable to encode base64 in this environment.');
}

/**
 * Build a TypeScript module string containing encoded vectors and metadata.
 * The generated module exports the vector dimension, count, base64 payload, and chunk ids.
 *
 * @param embeddings - The list of embedding vectors.
 * @param chunkIds - Parallel array of chunk ids matching the embeddings.
 * @param vectorDim - Expected dimension of each embedding vector.
 * @returns A string containing the generated TypeScript module.
 */
export function buildVectorsModule(
  embeddings: number[][],
  chunkIds: string[],
  vectorDim: number,
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

export type ApiKeyWithOwner = {
  key: string;
  owner: string;
};

/**
 * Shuffle an array in-place using the Fisher-Yates algorithm.
 *
 * @param items - The array to shuffle.
 * @returns The same array, shuffled.
 */
function shuffleArray<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * Build a pool of unique API keys from AI model configurations.
 * This removes duplicate keys and preserves the first owner for each key.
 * The result is then shuffled to spread traffic across keys randomly.
 *
 * @param config - AI configuration containing provider models and keys.
 * @param opts - Optional selection options for provider and protocol.
 * @returns A list of unique API keys paired with their owner values.
 */
export function buildApiKeyPool(
  config: AiConfig,
  opts: { providerKey?: string; protocol?: AiProtocol } = {},
): ApiKeyWithOwner[] {
  const keys = new Map<string, string>();
  for (const candidate of selectModels(config, opts)) {
    for (const keyObj of candidate.provider.keys) {
      if (!keys.has(keyObj.key)) {
        keys.set(keyObj.key, keyObj.owner ?? 'unknown');
      }
    }
  }
  return shuffleArray(
    Array.from(keys.entries()).map(([key, owner]) => ({ key, owner })),
  );
}

/**
 * Create a simple round-robin API key selector.
 * Each call returns the next key in the list and wraps around when it reaches the end.
 *
 * @param pool - Array of API keys with owner metadata.
 * @returns A function that returns the next API key entry on each invocation.
 */
export function createRoundRobinKeyProvider(pool: ApiKeyWithOwner[]) {
  let keyIndex = 0;
  return (): ApiKeyWithOwner => {
    if (pool.length === 0) {
      throw new Error('No API keys available for round-robin selection');
    }
    const entry = pool[keyIndex % pool.length];
    keyIndex += 1;
    return entry;
  };
}

/**
 * Compute a SHA-256 hash of a string using the Web Crypto API.
 * This helper is used to generate stable checksums for topic sources and facts.
 *
 * @param value - The string to hash.
 * @returns A hex-encoded SHA-256 digest.
 */
export async function hashString(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const globalCrypto = (globalThis as any).crypto;
  const subtle = globalCrypto?.subtle;

  if (!subtle || typeof subtle.digest !== 'function') {
    throw new Error('No Web Crypto API available to compute SHA-256 hash.');
  }

  const digest = await subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute checksum metadata for a topic from its sources and manual facts.
 * Returns a fingerprint for manual facts and source content as well as per-file hashes.
 *
 * @param topic - The topic metadata object.
 * @param readSource - A function to read the source content by relative path.
 * @returns Checksums and per-source file hashes for the topic.
 */
export async function computeTopicChecksums(
  topic: Topic,
  readSource: (relativePath: string) => string | Promise<string>,
): Promise<{
  manualFactsChecksum: string;
  sourcesChecksum: string;
  sourceFileHashes: Record<string, string>;
}> {
  const manualFactsText = (topic.manualFacts ?? []).join('\n');
  const sourceFileHashes: Record<string, string> = {};
  const sourceBlocks: string[] = [];

  for (const srcPath of topic.sources) {
    const content = await Promise.resolve(readSource(srcPath));
    const hash = await hashString(`${srcPath}\n${content}`);
    sourceFileHashes[srcPath] = hash;
    sourceBlocks.push(`${srcPath}\n${content}`);
  }

  return {
    manualFactsChecksum: await hashString(manualFactsText),
    sourcesChecksum: await hashString(sourceBlocks.join('\n---\n')),
    sourceFileHashes,
  };
}

/**
 * Parse checksums embedded in topic markdown headers.
 * It extracts the manual facts and source checksums when present.
 *
 * @param content - The markdown text to inspect.
 * @returns An object containing extracted checksum values.
 */
export function parseHeaderChecksums(content: string): {
  manualFactsChecksum?: string;
  sourcesChecksum?: string;
} {
  const manualFactsMatch = content.match(/manual_facts_checksum:\s*([0-9a-f]{64})/);
  const sourcesMatch = content.match(/sources_checksum:\s*([0-9a-f]{64})/);
  return {
    manualFactsChecksum: manualFactsMatch?.[1],
    sourcesChecksum: sourcesMatch?.[1],
  };
}

/**
 * Build the markdown header used for generated topic files.
 * The header includes metadata such as model, token counts, checksums, and source hashes.
 *
 * @param description - A short description of the generated content.
 * @param meta - Optional metadata values to include in the header.
 * @returns A markdown comment block containing generated metadata.
 */
export function buildHeader(description: string, meta?: HeaderMeta): string {
  const headerLines = [
    '<!--',
    '  AUTO-GENERATED by apps/mcp/knowledge/generate.ts',
    '  Do not edit manually. Run the script to regenerate.',
    '  To add or modify topics, edit files in apps/mcp/knowledge/topics/',
    `  description:  ${description}`,
  ];

  if (meta?.model) headerLines.push(`  model:        ${meta.model}`);
  if (meta?.tokensIn !== undefined) headerLines.push(`  tokens_in:    ${meta.tokensIn}`);
  if (meta?.tokensOut !== undefined) headerLines.push(`  tokens_out:   ${meta.tokensOut}`);
  if (meta?.apiEndpoint) headerLines.push(`  api_endpoint: ${meta.apiEndpoint}`);
  if (meta?.manualFactsChecksum) headerLines.push(`  manual_facts_checksum: ${meta.manualFactsChecksum}`);
  if (meta?.sourcesChecksum) headerLines.push(`  sources_checksum: ${meta.sourcesChecksum}`);
  if (meta?.sourceFileHashes) {
    headerLines.push('  source_file_hashes:');
    for (const [path, hash] of Object.entries(meta.sourceFileHashes)) {
      headerLines.push(`    ${path}: ${hash}`);
    }
  }

  headerLines.push('-->\n');
  return headerLines.join('\n');
}

/**
 * Convert topic markdown into generated chunks for indexing and search.
 * Each topic is represented as a single chunk containing its text and metadata.
 *
 * @param topics - The topic definitions to process.
 * @param loadTopicMarkdown - Function that returns markdown content for a topic by name.
 * @returns A list of generated chunks ready for search indexing.
 */
export function generateChunks(
  topics: Topic[],
  loadTopicMarkdown: (topicName: string) => string,
): GeneratedChunk[] {
  const chunks: GeneratedChunk[] = [];

  for (const topic of topics) {
    const mdContent = loadTopicMarkdown(topic.name);
    const text = mdContent.replace(/<!--[\s\S]*?-->/, '');
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    chunks.push({
      id: `${topic.name}#0`,
      topic: topic.name,
      heading: `## ${topic.description}`,
      heading_path: [topic.description],
      text,
      word_count: wordCount,
    });
  }

  return chunks;
}

/**
 * Build the generated topics manifest containing metadata for each topic.
 * The manifest is used to track generated content, checksums, and update timestamps.
 *
 * @param generatedTopics - The list of topics that were generated.
 * @param options - Options for manifest creation.
 * @param options.commit - Commit hash or version identifier.
 * @param options.now - Optional timestamp to use for the manifest.
 * @param options.getTopicMarkdown - Function to retrieve raw markdown by topic name.
 * @returns A manifest object describing generated topics.
 */
export function buildManifest(
  generatedTopics: Topic[],
  options: {
    commit: string;
    now?: string;
    getTopicMarkdown: (topicName: string) => string;
  },
): TopicManifest {
  const generatedAt = options.now ?? new Date().toISOString();

  const topics = generatedTopics.map((topic) => {
    const mdContent = options.getTopicMarkdown(topic.name);
    const words = mdContent.replace(/<!--[\s\S]*?-->/, '').split(/\s+/).filter(Boolean).length;
    const checksums = parseHeaderChecksums(mdContent);
    const titleMatch = mdContent.match(/^#{1,2}\s+(.+)$/m);
    const title = titleMatch?.[1]?.trim() ?? topic.name;

    return {
      slug: topic.name,
      title,
      description: topic.description,
      tags: topic.tags || [],
      updated_at: generatedAt,
      word_count: words,
      sources_checksum: checksums.sourcesChecksum || '',
    };
  });

  return {
    generated_at: generatedAt,
    commit: options.commit,
    manifest_version: '1.0.0',
    topics,
  };
}

export type CallAiOptions = {
  apiUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  fetch?: typeof fetch;
  abortSignal?: AbortSignal;
  verbose?: boolean;
  showKeyOwner?: boolean;
  keyOwner?: string;
};

/**
 * Detect whether the provided API URL belongs to Anthropic.
 *
 * @param apiUrl - The AI API endpoint URL.
 * @returns True when the URL appears to be Anthropic.
 */
export function isAnthropicApi(apiUrl: string): boolean {
  return apiUrl.includes('anthropic.com');
}

/**
 * Detect whether the provided API URL belongs to Google Gemini.
 * Excludes endpoints that also include openai references.
 *
 * @param apiUrl - The AI API endpoint URL.
 * @returns True when the URL appears to be a Gemini endpoint.
 */
export function isGeminiApi(apiUrl: string): boolean {
  return (
    (apiUrl.includes('generativelanguage.googleapis.com') || apiUrl.includes('gemini.googleapis.com')) &&
    !apiUrl.includes('openai')
  );
}

/**
 * Call an AI model API to generate text based on system and user prompts.
 * Supports Anthropic, Gemini, and OpenAI-compatible endpoints.
 *
 * @param systemPrompt - The system-level prompt controlling the AI behavior.
 * @param userPrompt - The user prompt to send to the AI model.
 * @param opts - Request configuration, including endpoint, API key, and token limits.
 * @returns The model output text and token usage information.
 */
export async function callAi(
  systemPrompt: string,
  userPrompt: string,
  opts: CallAiOptions,
): Promise<{ content: string; tokensIn: number; tokensOut: number }> {
  const fetchFn = opts.fetch ?? globalThis.fetch;
  const isAnthropic = isAnthropicApi(opts.apiUrl);
  const isGemini = isGeminiApi(opts.apiUrl);

  if (opts.verbose) {
    console.log(`  [ai] model=${opts.model} endpoint=${opts.apiUrl}`);
    console.log(`  [ai] input tokens ≈ ${estimateTokens(systemPrompt + userPrompt)}`);
  }

  const response = await fetchFn(
    isAnthropic
      ? `${opts.apiUrl}/messages`
      : isGemini
        ? `${opts.apiUrl}/models/${opts.model}:generateContent?key=${opts.apiKey}`
        : `${opts.apiUrl}/chat/completions`,
    {
      method: 'POST',
      headers: (() => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (isAnthropic) {
          headers['x-api-key'] = opts.apiKey;
          headers['anthropic-version'] = '2023-06-01';
        }
        if (!isAnthropic && !isGemini) {
          headers['Authorization'] = `Bearer ${opts.apiKey}`;
        }
        return headers;
      })(),
      body: JSON.stringify(
        isAnthropic
          ? {
              model: opts.model,
              max_tokens: opts.maxTokens,
              system: systemPrompt,
              messages: [{ role: 'user', content: userPrompt }],
            }
          : isGemini
            ? {
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                generationConfig: { maxOutputTokens: opts.maxTokens },
              }
            : {
                model: opts.model,
                max_tokens: opts.maxTokens,
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt },
                ],
              },
      ),
      signal: opts.abortSignal,
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    const label = isAnthropic ? 'Anthropic' : isGemini ? 'Gemini' : 'OpenAI/Groq';
    throw new Error(`AI API error (${label}) ${response.status}: ${errorText}`);
  }

  if (isAnthropic) {
    const data = await response.json() as any;
    return {
      content: data.content?.[0]?.text ?? '',
      tokensIn: data.usage?.input_tokens ?? estimateTokens(systemPrompt + userPrompt),
      tokensOut: data.usage?.output_tokens ?? 0,
    };
  }

  if (isGemini) {
    const data = await response.json() as any;
    return {
      content: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
      tokensIn: data.usageMetadata?.promptTokenCount ?? estimateTokens(systemPrompt + userPrompt),
      tokensOut: data.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }

  const data = await response.json() as {
    choices: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const content = data.choices?.[0]?.message?.content ?? '';
  const tokensIn = data.usage?.prompt_tokens ?? estimateTokens(systemPrompt + userPrompt);
  const tokensOut = data.usage?.completion_tokens ?? estimateTokens(content);
  return { content, tokensIn, tokensOut };
}
