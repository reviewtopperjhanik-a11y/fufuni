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
 * Serve GET responses from KV when available, store them on cache miss.
 * Response is cached for 1 hour (expirationTtl: 3600 s).
 * Sets `X-KV-Cache: HIT | MISS` on the response for observability.
 * Increments `stats:kv:hits` / `stats:kv:misses` counters for analytics.
 */
export const kvCacheMiddleware = async (c: HonoCtx, next: Next) => {
  if (c.req.method !== 'GET') {
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
    c.executionCtx.waitUntil(
      Promise.all([
        kv.put(cacheKey, JSON.stringify(data), { expirationTtl: 3600 }),
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
      ])
    );
  }
};
