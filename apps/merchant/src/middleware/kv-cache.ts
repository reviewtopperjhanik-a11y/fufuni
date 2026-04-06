/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 *
 * KV Cache middleware for public read endpoints.
 * Caches GET responses in Cloudflare KV to avoid hitting the Durable Object
 * on every request. Much cheaper than DO invocations at scale.
 *
 * NOTE: kvCacheMiddleware stores keys as `cache:<full-url>`, including query
 * params, so paginated/filtered responses are cached independently.
 *
 * kvInvalidateMiddleware purges all matching prefixes on successful mutations
 * (POST/PATCH/DELETE) by iterating KV list() pages — covers paginated keys too.
 */
import { Context, Next } from 'hono';
import type { HonoEnv } from '../types';

type HonoCtx = Context<HonoEnv>;

/**
 * Increment a named counter in KV for cache monitoring metrics.
 * Eventual-consistency is acceptable — race conditions only affect metrics accuracy,
 * not application correctness. Counters persist indefinitely (no TTL).
 */
export async function incrementStat(kv: KVNamespace, key: string): Promise<void> {
  const current = (await kv.get<number>(key, 'json')) ?? 0;
  await kv.put(key, JSON.stringify(current + 1));
}

/**
 * Resolve cache TTL (seconds) based on the request path.
 *
 * - Search results expire quickly (5 min) — many URL permutations, hard to
 *   invalidate precisely.
 * - Reviews expire in 10 min — moderated asynchronously, acceptable slight lag.
 * - Everything else (product list, product detail, categories) expires in 1 h
 *   and is invalidated proactively on admin mutations.
 */
function getCacheTtl(pathname: string, c: HonoCtx): number {
  if (pathname.includes('/search'))  return  parseInt(c.env.KV_CACHE_SEARCH_TTL_SECONDS || '300') ; // 5 min
  if (pathname.includes('/reviews')) return  parseInt(c.env.KV_CACHE_REVIEWS_TTL_SECONDS || '600'); // 10 min
  return parseInt(c.env.KV_CACHE_DEFAULT_TTL_SECONDS || '3600');                                    // 1 h
}

/**
 * Returns true when the request should bypass the KV cache.
 *
 * Bypass rules:
 * - Non-GET methods — mutations must always hit the DO.
 * - Admin tokens (`sk_...`, Auth0 JWTs) — admin reads may include unpublished
 *   data or per-key access levels; never serve them cached public content.
 *
 * Allowed (cached):
 * - Requests with no Authorization header (truly public endpoints).
 * - Requests with `Bearer pk_...` (storefront public key, shared by all
 *   visitors; the catalog response is identical for every user).
 */
function shouldBypass(c: HonoCtx): boolean {
  if (c.req.method !== 'GET') return true;
  const auth = c.req.header('Authorization');
  if (!auth) return false; // no auth — always cacheable
  // Allow public-key tokens only
  return !auth.startsWith('Bearer pk_');
}

/**
 * Serve GET responses from KV when available, store them on cache miss.
 * TTL scales by endpoint type (see getCacheTtl).
 * Sets `X-KV-Cache: HIT | MISS` on the response for observability.
 * Increments `stats:kv:hits` / `stats:kv:misses` counters for analytics.
 *
 * NOTE: incrementStat uses a non-atomic KV read-modify-write, so counters are
 * approximate under concurrent load — acceptable for diagnostic metrics.
 */
export const kvCacheMiddleware = async (c: HonoCtx, next: Next) => {
  if (shouldBypass(c)) {
    return await next();
  }

  const cacheKey = `cache:${c.req.url}`;
  const kv = c.env.KV_CACHE;

  const cached = await kv.get<unknown>(cacheKey, 'json');
  if (cached !== null) {
    c.header('X-KV-Cache', 'HIT');
    c.executionCtx.waitUntil(incrementStat(kv, 'stats:kv:hits'));
    return c.json(cached);
  }

  await next();

  if (c.res.status === 200) {
    const data = await c.res.clone().json();
    const ttl = getCacheTtl(new URL(c.req.url).pathname, c);
    c.executionCtx.waitUntil(
      Promise.all([
        kv.put(cacheKey, JSON.stringify(data), { expirationTtl: ttl }),
        incrementStat(kv, 'stats:kv:misses'),
      ])
    );
    c.header('X-KV-Cache', 'MISS');
  }
};

/**
 * Delete all KV cache entries whose key begins with the given prefix.
 * Pages through kv.list() until list_complete is true.
 */
async function purgeByPrefix(kv: KVNamespace, prefix: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const result = await kv.list({ prefix, ...(cursor ? { cursor } : {}) });
    await Promise.all(result.keys.map((k) => kv.delete(k.name)));
    cursor = result.list_complete ? undefined : (result as any).cursor;
  } while (cursor);
}

/**
 * On successful mutations (POST/PATCH/DELETE), invalidate all KV cache entries
 * for the products and categories namespaces — including paginated variants.
 */
export const kvInvalidateMiddleware = async (c: HonoCtx, next: Next) => {
  await next();

  if (
    ['POST', 'PATCH', 'DELETE'].includes(c.req.method) &&
    c.res.status >= 200 &&
    c.res.status < 300
  ) {
    const kv = c.env.KV_CACHE;
    const origin = new URL(c.req.url).origin;

    c.executionCtx.waitUntil(
      Promise.all([
        purgeByPrefix(kv, `cache:${origin}/v1/products`),
        purgeByPrefix(kv, `cache:${origin}/v1/categories`),
        purgeByPrefix(kv, `cache:${origin}/ucp/v1/products`),
        purgeByPrefix(kv, `cache:${origin}/ucp/v1/categories`),
        purgeByPrefix(kv, `cache:${origin}/.well-known/ucp`),
      ])
    );
  }
};
