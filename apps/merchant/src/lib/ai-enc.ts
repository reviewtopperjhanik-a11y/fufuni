// Copyright (c) 2024-2026 Ronan LE MEILLAT
// License: AGPL-3.0-or-later
//
// Universal AI configuration helper — decrypts ai.json.enc in memory.
// Works in Node.js ≥ 18 AND Cloudflare Workers via the Web Crypto API.
//
// Encryption format (must match exactly):
//   openssl enc -aes-256-cbc -a -pbkdf2 -iter 100000 -salt \
//     -in ai.json -out ai.json.enc -pass pass:"${CRYPTOKEN}"

// ─── Types ────────────────────────────────────────────────────────────────────

/** Wire protocol used for API calls to this provider. */
export type AiProtocol = 'openai' | 'anthropic' | 'gemini';

export type AiKeyTier = 'expired' | 'free' | 'paid' | 'premium' | 'unlimited';

export interface AiKey {
  /** The actual API key value. */
  key: string;
  /** Optional owner/manager of this key (e.g. "ronan", "ci-service"). */
  owner?: string;
  /** Service tier. Useful for quota/rate-limit decisions. */
  type?: AiKeyTier;
}

export interface AiModel {
  /** Provider-specific model identifier, e.g. "llama-3.3-70b-versatile". */
  id: string;
  /** Maximum context window in tokens. */
  contextWindow: number;
  /** Maximum tokens the model can generate in one response. */
  maxOutputTokens: number;
  /**
   * Tokens-per-minute hard cap (e.g. Groq free-tier per-request limit).
   * null = no known limit.
   */
  tpmLimit: number | null;
  /**
   * Selection priority. 1 = most preferred; higher numbers are used as fallback.
   * selectModels() returns results sorted ascending by this value.
   */
  priority: number;
  /** Arbitrary labels for filtering, e.g. ["fast", "code", "cheap"]. */
  tags?: string[];
}

export interface AiProvider {
  /** Wire protocol for API requests. */
  protocol: AiProtocol;
  /** Base API endpoint, e.g. "https://api.groq.com/openai/v1". */
  endpoint: string;
  /** All valid API keys for this provider (round-robin via pickKey()). */
  keys: AiKey[];
  /** Available models with their constraints and priority. */
  models: AiModel[];
}

export interface AiConfig {
  /** Schema version — increment when the shape changes. */
  version: number;
  /** Keyed by a human-readable provider name, e.g. "groq", "anthropic". */
  providers: Record<string, AiProvider>;
}

// ─── Core decrypt ─────────────────────────────────────────────────────────────

/**
 * Decrypt and parse an AI config file encrypted with:
 *   openssl enc -aes-256-cbc -a -pbkdf2 -iter 100000 -salt \
 *     -in ai.json -out ai.json.enc -pass pass:"${CRYPTOKEN}"
 *
 * Uses only the Web Crypto API — no Node.js-specific modules.
 *
 * @param base64Ciphertext  Full text content of ai.json.enc (base64 OpenSSL output)
 * @param password          Value of the CRYPTOKEN environment variable
 */
export async function decryptAiConfig(
  base64Ciphertext: string,
  password: string,
): Promise<AiConfig> {
  // 1. base64 decode → raw bytes
  const raw = Uint8Array.from(atob(base64Ciphertext.trim()), c => c.charCodeAt(0));

  // 2. Verify OpenSSL "Salted__" magic header (bytes 0–7)
  if (new TextDecoder().decode(raw.slice(0, 8)) !== 'Salted__') {
    throw new Error('ai.json.enc: invalid format — expected OpenSSL "Salted__" header. ' +
      'Make sure the file was encrypted with the -a flag.');
  }

  const salt = raw.slice(8, 16);       // bytes 8–15
  const ciphertext = raw.slice(16);    // bytes 16–end

  // 3. PBKDF2-SHA256 → 48 bytes (32 key + 16 IV), matching -pbkdf2 -iter 100000
  const pwBytes = new TextEncoder().encode(password);
  const baseKey = await crypto.subtle.importKey('raw', pwBytes, 'PBKDF2', false, ['deriveBits']);
  const derived = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 },
      baseKey,
      384, // 48 bytes × 8 bits
    ),
  );

  // 4. AES-256-CBC decrypt
  const aesKey = await crypto.subtle.importKey(
    'raw', derived.slice(0, 32), 'AES-CBC', false, ['decrypt'],
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: derived.slice(32, 48) },
    aesKey,
    ciphertext,
  );

  return JSON.parse(new TextDecoder().decode(plaintext)) as AiConfig;
}

// ─── Selection helpers ────────────────────────────────────────────────────────

export interface ModelCandidate {
  providerKey: string;
  provider: AiProvider;
  model: AiModel;
}

/**
 * Return all models across providers (or filtered), sorted by priority ascending.
 * **IMPORTANT:** priority is a rank where 1 = highest priority (best), and higher numbers = fallback.
 *
 * Results are guaranteed sorted ascending by priority — callers can depend on:
 * - candidates[0] = best available model
 * - candidates[1..] = fallbacks in order
 *
 * @param config      Decrypted AiConfig
 * @param opts.protocol     Filter by wire protocol (e.g. "openai", "anthropic")
 * @param opts.providerKey  Filter by provider key (e.g. "groq", "anthropic")
 * @param opts.tag          Filter by model tag (e.g. "fast", "code", "cheap")
 * @returns Sorted list of model candidates. Always returns ascending by priority (1 = best).
 */
export function selectModels(
  config: AiConfig,
  opts: {
    protocol?: AiProtocol;
    providerKey?: string;
    tag?: string;
  } = {},
): ModelCandidate[] {
  const out: ModelCandidate[] = [];
  for (const [key, provider] of Object.entries(config.providers)) {
    if (opts.providerKey && key !== opts.providerKey) continue;
    if (opts.protocol && provider.protocol !== opts.protocol) continue;
    for (const model of provider.models) {
      if (opts.tag && !model.tags?.includes(opts.tag)) continue;
      out.push({ providerKey: key, provider, model });
    }
  }
  // Sort ascending by priority: 1 = best, highest number = worst fallback
  return out.sort((a, b) => a.model.priority - b.model.priority);
}

/**
 * Pick one API key object at random (uniform load-balancing across the key pool).
 * Returns the full AiKey object so callers can access metadata (owner, type).
 */
export function pickKey(provider: AiProvider): AiKey {
  if (provider.keys.length === 0) {
    throw new Error('No API keys configured for this provider');
  }
  return provider.keys[Math.floor(Math.random() * provider.keys.length)];
}

/**
 * Collect every key value from every provider matching the given filters,
 * deduplicated. Useful for building the comma-separated AI_API_KEY pool.
 */
export function collectKeys(
  config: AiConfig,
  opts: Parameters<typeof selectModels>[1] = {},
): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const { provider } of selectModels(config, opts)) {
    for (const keyObj of provider.keys) {
      if (!seen.has(keyObj.key)) { seen.add(keyObj.key); keys.push(keyObj.key); }
    }
  }
  return keys;
}
