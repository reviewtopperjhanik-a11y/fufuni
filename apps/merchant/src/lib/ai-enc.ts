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

/** Discriminates chat/completion models from embedding models. */
export type AiModelUsage = 'chat' | 'embedding';

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
  /**
   * Model usage category.
   * - "chat"      : text completion / generation (POST /chat/completions)
   * - "embedding" : vector embedding (POST /embeddings)
   * Defaults to "chat" when omitted for backward compatibility.
   */
  usage?: AiModelUsage;
  /**
   * For embedding models only: native output vector dimension.
   * Used as the default value for the "dimensions" / "output_dimensionality" parameter.
   */
  defaultDimensions?: number;
}

export interface AiProvider {
  /** Wire protocol for API requests. */
  protocol: AiProtocol;
  /** Base API endpoint, e.g. "https://api.groq.com/openai/v1". Used as fallback. */
  endpoint: string;
  /**
   * Optional: Cloudflare AI Gateway compatible endpoint.
   * When set and CLOUDFLARE_AIG_TOKEN is available, this endpoint is used instead
   * of `endpoint`. Must end with the compat path, e.g.:
   * "https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/compat"
   */
  gatewayEndpoint?: string;
  /**
   * Optional: prefix to prepend to model IDs when routing through the gateway.
   * E.g. "google-ai-studio" for Gemini, "groq" for Groq, "anthropic" for Anthropic.
   * Required when gatewayEndpoint is set.
   */
  gatewayModelPrefix?: string;
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
    usage?: AiModelUsage;
  } = {},
): ModelCandidate[] {
  const out: ModelCandidate[] = [];
  for (const [key, provider] of Object.entries(config.providers)) {
    if (opts.providerKey && key !== opts.providerKey) continue;
    if (opts.protocol && provider.protocol !== opts.protocol) continue;
    for (const model of provider.models) {
      if (opts.tag && !model.tags?.includes(opts.tag)) continue;
      if (opts.usage && model.usage !== opts.usage) continue;
      out.push({ providerKey: key, provider, model });
    }
  }
  // Sort ascending by priority: 1 = best, highest number = worst fallback
  return out.sort((a, b) => a.model.priority - b.model.priority);
}

/**
 * Resolve the effective API endpoint for a provider.
 *
 * When a gateway endpoint and token are both available, the gateway is preferred.
 * Falls back to the direct provider endpoint when the gateway is not configured.
 *
 * @param provider  The AiProvider configuration object.
 * @param aigToken  The CLOUDFLARE_AIG_TOKEN value, or undefined if not set.
 */
export function resolveProviderEndpoint(
  provider: AiProvider,
  aigToken: string | undefined,
): { endpoint: string; useGateway: boolean } {
  if (aigToken && provider.gatewayEndpoint) {
    return { endpoint: provider.gatewayEndpoint, useGateway: true };
  }
  return { endpoint: provider.endpoint, useGateway: false };
}

/**
 * Build the model ID string to send in the request body.
 *
 * When routing through the Cloudflare AI Gateway, models must be prefixed with
 * the provider's gateway slug (e.g. "groq/llama-3.3-70b-versatile").
 * When calling the provider directly, the model ID is used as-is.
 *
 * @param modelId    Raw model ID from ai.json (e.g. "llama-3.3-70b-versatile").
 * @param provider   The AiProvider configuration object.
 * @param useGateway Whether the request is going through the gateway.
 */
export function resolveModelId(
  modelId: string,
  provider: AiProvider,
  useGateway: boolean,
): string {
  if (useGateway && provider.gatewayModelPrefix) {
    // Avoid double-prefixing if the model ID already contains a slash
    if (modelId.includes('/')) return modelId;
    return `${provider.gatewayModelPrefix}/${modelId}`;
  }
  return modelId;
}

/**
 * Select the best embedding models from the config, sorted by priority.
 *
 * Filters for models with usage === 'embedding'. Falls back to models tagged
 * "embedding" when no model has the usage field set (backward compat).
 *
 * @param config      Decrypted AiConfig.
 * @param providerKey Optional provider filter, e.g. "gemini".
 */
export function selectEmbeddingModels(
  config: AiConfig,
  providerKey?: string,
): ModelCandidate[] {
  const byUsage = selectModels(config, { providerKey, usage: 'embedding' });
  if (byUsage.length > 0) return byUsage;
  // Backward compat: fall back to models tagged "embedding"
  return selectModels(config, { providerKey, tag: 'embedding' });
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

// ─── Model specifications and budgets ──────────────────────────────────────

export type ModelSpec = {
  context_window: number;
  max_completion_tokens: number;
};

/**
 * Static specs for well-known models that won't appear in API discovery
 * endpoints (e.g. Anthropic Claude, OpenAI, Gemini).
 * Used as a fallback when model metadata is unavailable (pinned model
 * or non-Groq endpoint without /models support).
 */
export const KNOWN_MODEL_SPECS: Record<string, ModelSpec> = {
  // ── Anthropic Claude ────────────────────────────────────────────────────────
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
  // https://developers.openai.com/api/docs/models/all
  'gpt-4o': { context_window: 128_000, max_completion_tokens: 16_384 },
  'gpt-4o-mini': { context_window: 128_000, max_completion_tokens: 16_384 },
  'gpt-4-turbo': { context_window: 128_000, max_completion_tokens: 4_096 },
  'gpt-5.4': { context_window: 1_000_000, max_completion_tokens: 128_000 },
  // ── Google Gemini ────────────────────────────────────────────────────────────
  // https://ai.google.dev/gemini-api/docs/gemini-3
  'gemini-1.5-pro': { context_window: 1_000_000, max_completion_tokens: 8_192 },
  'gemini-1.5-flash': { context_window: 1_000_000, max_completion_tokens: 8_192 },
  'gemini-2.0-flash': { context_window: 1_048_576, max_completion_tokens: 8_192 },
  'gemini-3-flash-preview': { context_window: 1_048_576, max_completion_tokens: 65_536 },
  'gemini-3.1-pro-preview': { context_window: 1_048_576, max_completion_tokens: 65_536 },
};

export interface ModelBudget {
  /** Maximum tokens the model may generate in one response. */
  maxOutputTokens: number;
  /**
   * Total character budget for ALL source files combined.
   * Derived from: (context_window - maxOutputTokens - promptOverheadTokens) × charsPerToken.
   * Callers divide this by the number of source files to get the per-file limit.
   */
  maxSourceCharsTotal: number;
}

/**
 * Compute optimal generation limits for a given model ID.
 *
 * Uses provided metadata, falls back to KNOWN_MODEL_SPECS, then to default constants.
 * The returned budget maximises source file inclusion while leaving enough room
 * for the model's expected output and prompt overhead.
 *
 * @param modelId Model identifier (e.g. "claude-opus-4-6", "gpt-4o")
 * @param modelMeta Optional live metadata from API discovery (takes priority)
 * @param opts Options for budget calculation:
 *   - defaultMaxOutputTokens: fallback max generation tokens (default 6000)
 *   - maxOutputTokensCap: hard ceiling on generation tokens (default 8000)
 *   - promptOverheadTokens: reserved tokens for system prompt and overhead (default 2000)
 *   - charsPerToken: tokenization ratio (default 4)
 *   - learnedRequestTokensCap: per-request rate limit, if known (optional)
 */
export function getModelBudget(
  modelId: string,
  modelMeta?: Array<{ id: string; context_window: number; max_completion_tokens?: number }>,
  opts: {
    defaultMaxOutputTokens?: number;
    maxOutputTokensCap?: number;
    promptOverheadTokens?: number;
    charsPerToken?: number;
    learnedRequestTokensCap?: number | null;
  } = {},
): ModelBudget {
  const defaultMaxOut = opts.defaultMaxOutputTokens ?? 6_000;
  const maxOutCap = opts.maxOutputTokensCap ?? 8_000;
  const promptOverhead = opts.promptOverheadTokens ?? 2_000;
  const charsPerToken = opts.charsPerToken ?? 4;
  const learnedCap = opts.learnedRequestTokensCap ?? null;

  // Priority: live metadata > static table > defaults.
  const poolEntry = modelMeta?.find(m => m.id === modelId);
  const knownSpec = KNOWN_MODEL_SPECS[modelId];
  const spec = poolEntry ?? (knownSpec
    ? { context_window: knownSpec.context_window, max_completion_tokens: knownSpec.max_completion_tokens }
    : null);

  if (!spec) {
    return {
      maxOutputTokens: defaultMaxOut,
      // Assume up to 4 source files at a conservative per-file limit.
      maxSourceCharsTotal: (opts.defaultMaxOutputTokens ?? 14_000) * 4,
    };
  }

  const maxOutputTokens = Math.min(
    spec.max_completion_tokens ?? defaultMaxOut,
    maxOutCap,
  );

  // Start with the model's full context window.
  let inputBudgetTokens = Math.max(
    1_000,
    spec.context_window - maxOutputTokens - promptOverhead,
  );

  // Apply the per-request cap when known (e.g. Groq free tier: TPM = per-request limit).
  if (learnedCap !== null) {
    const cappedInput = Math.max(
      1_000,
      learnedCap - maxOutputTokens - promptOverhead,
    );
    inputBudgetTokens = Math.min(inputBudgetTokens, cappedInput);
  }

  return {
    maxOutputTokens,
    maxSourceCharsTotal: inputBudgetTokens * charsPerToken,
  };
}

// ─── Model selection and filtering ─────────────────────────────────────────

export interface ModelWithProvider {
  /** Provider key under which this model appears. */
  providerKey: string;
  provider: AiProvider;
  model: AiModel;
}

/**
 * Find all implementations of a specific model across providers.
 * Useful when a model (e.g., "gpt-4o") is available from multiple providers,
 * and you need to decide which to use based on priority or other criteria.
 *
 * @param config Decrypted AiConfig
 * @param modelId Model identifier to search for (e.g., "gpt-4o")
 * @returns List of ModelWithProvider for all matching implementations, sorted by priority ascending.
 */
export function findModelById(config: AiConfig, modelId: string): ModelWithProvider[] {
  const matches: ModelWithProvider[] = [];
  for (const [providerKey, provider] of Object.entries(config.providers)) {
    for (const model of provider.models) {
      if (model.id === modelId) {
        matches.push({ providerKey, provider, model });
      }
    }
  }
  // Sort by priority ascending: 1 = best fallback, higher = worse fallback
  return matches.sort((a, b) => a.model.priority - b.model.priority);
}

/**
 * Find a model within a specific provider by ID.
 *
 * @param config Decrypted AiConfig
 * @param providerKey Provider identifier (e.g., "groq", "anthropic")
 * @param modelId Model identifier (e.g., "gpt-4o")
 * @returns ModelWithProvider if found, null otherwise.
 */
export function findModelByIdInProvider(
  config: AiConfig,
  providerKey: string,
  modelId: string,
): ModelWithProvider | null {
  const provider = config.providers[providerKey];
  if (!provider) return null;
  const model = provider.models.find(m => m.id === modelId);
  return model ? { providerKey, provider, model } : null;
}
