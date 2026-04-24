// Copyright (c) 2024-2026 Ronan LE MEILLAT
// License: AGPL-3.0-or-later
//
// KV cache helpers for the Fufuni MCP Worker.
// Uses Cloudflare KV (KV_CACHE binding) to cache tool responses.
//
// Key format: `v{VERSION}:{MANIFEST_COMMIT}:{tool}:{fnv32a(params_json)}`
// Including MANIFEST_COMMIT ensures redeployments automatically invalidate
// all cached entries without requiring explicit eviction.

import { MANIFEST_COMMIT } from "../manifest.js";

const CACHE_VERSION = 1;

/**
 * FNV-1a 32-bit hash — fast, non-cryptographic, collision-resistant enough
 * for MCP query patterns. Produces an 8-char hex string.
 */
function fnv32a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Build a compact, commit-namespaced cache key.
 * Object keys are sorted for stable serialization regardless of insertion order.
 */
export function makeCacheKey(
  tool: string,
  params: Record<string, unknown>,
): string {
  const paramStr = JSON.stringify(params, Object.keys(params).sort());
  return `v${CACHE_VERSION}:${MANIFEST_COMMIT}:${tool}:${fnv32a(paramStr)}`;
}

/**
 * Retrieve a cached value from KV.
 * Returns null on miss, KV unavailability, or any error (non-fatal).
 */
export async function kvGet(
  kv: KVNamespace | undefined,
  key: string,
): Promise<string | null> {
  if (!kv) return null;
  try {
    return await kv.get(key);
  } catch {
    return null;
  }
}

/**
 * Store a value in KV with a TTL in seconds.
 * Errors are silently swallowed — a cache write failure must not break the tool.
 */
export async function kvSet(
  kv: KVNamespace | undefined,
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(key, value, { expirationTtl: ttlSeconds });
  } catch {
    // Non-fatal: caller already has the computed result.
  }
}

/**
 * Cache-aside wrapper.
 * On hit: deserializes and returns the cached JSON.
 * On miss: runs `fn`, stores the result, and returns it.
 */
export async function withKvCache<T>(
  kv: KVNamespace | undefined,
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const cached = await kvGet(kv, key);
  if (cached !== null) {
    return JSON.parse(cached) as T;
  }
  const result = await fn();
  await kvSet(kv, key, JSON.stringify(result), ttlSeconds);
  return result;
}
