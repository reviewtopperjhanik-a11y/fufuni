// Copyright (c) 2024-2026 Ronan LE MEILLAT
// License: AGPL-3.0-or-later

import { shuffleArray } from './helpers.js';
import { selectModels } from '../ai-enc.js';
import type { ApiKeyWithOwner } from './types.js';
import type { AiConfig, AiProtocol } from '../ai-enc.js';

/**
 * Build a unique pool of API keys from AI provider configuration.
 *
 * This helper removes duplicate keys and preserves the first owner seen.
 *
 * @param config - AI configuration object containing provider keys.
 * @param opts - Optional provider selection options.
 * @returns A shuffled list of API keys with owner metadata.
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
 * Create a round-robin API key provider.
 *
 * Each call returns the next key in the pool, wrapping around when needed.
 *
 * @param pool - Array of API keys with owner metadata.
 * @returns A function that returns a key entry on each invocation.
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
