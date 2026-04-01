/**
 * MIT License
 *
 * Copyright (c) 2025 ygwyg
 * Copyright (c) 2026 Ronan Le Meillat - SCTG Development
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { ApiError, uuid, type HonoEnv } from '../types';
import { ImageUploadResponse, ErrorResponse, OkResponse } from '../schemas';
import { incrementStat } from '../middleware/kv-cache';

// caches.default is a Cloudflare Workers extension not present in the standard
// CacheStorage typings bundled with worker-configuration.d.ts.
// It is available at runtime on deployed Workers but not in wrangler dev.
const cfCaches = caches as CacheStorage & { default: Cache };

const ImageKeyParam = z.object({
  key: z.string().openapi({ param: { name: 'key', in: 'path' }, example: 'abc123.jpg' }),
});

const publicApp = new OpenAPIHono<HonoEnv>();

const uploadImage = createRoute({
  method: 'post',
  path: '/',
  tags: ['Images'],
  summary: 'Upload an image',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [authMiddleware, adminOnly] as const,
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: z.any().openapi({ type: 'string', format: 'binary' }),
          }),
        },
      },
    },
  },
  responses: {
    200: { content: { 'application/json': { schema: ImageUploadResponse } }, description: 'Image uploaded' },
    400: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Invalid file' },
  },
});

publicApp.openapi(uploadImage, async (c) => {
  if (!c.env.IMAGES) {
    throw ApiError.invalidRequest('R2 bucket not configured');
  }

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;

  if (!file) throw ApiError.invalidRequest('file is required');

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.type)) {
    throw ApiError.invalidRequest('File must be jpeg, png, webp, or gif');
  }

  if (file.size > 5 * 1024 * 1024) {
    throw ApiError.invalidRequest('File must be under 5MB');
  }

  const ext = file.type.split('/')[1];
  const key = `${uuid()}.${ext}`;

  await c.env.IMAGES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  const baseUrl = c.env.IMAGES_URL || `${new URL(c.req.url).origin}/v1/images`;
  const url = `${baseUrl}/${key}`;

  return c.json({ url, key }, 200);
});

const getImage = createRoute({
  method: 'get',
  path: '/{key}',
  tags: ['Images'],
  summary: 'Get an image',
  request: { params: ImageKeyParam },
  responses: {
    200: { description: 'Image binary' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Image not found' },
  },
});

publicApp.openapi(getImage, async (c) => {
  const { key } = c.req.valid('param');

  if (!c.env.IMAGES) {
    throw ApiError.invalidRequest('R2 bucket not configured');
  }

  // 1. Check Cloudflare Edge cache first (only effective on deployed Workers,
  //    not in wrangler dev — caches.default is unavailable locally)
  const cache = cfCaches.default;
  const cacheKey = new Request(new URL(c.req.url).toString(), c.req.raw);

  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    // Track CDN hit for analytics
    c.executionCtx.waitUntil(incrementStat(c.env.KV_CACHE, 'stats:cdn:hits'));
    return cachedResponse;
  }

  // 2. Fallback: fetch from R2
  const object = await c.env.IMAGES.get(key);
  if (!object) {
    throw ApiError.notFound('Image not found');
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  if (object.httpEtag) {
    headers.set('ETag', object.httpEtag);
  }

  const response = new Response(object.body, { headers });

  // 3. Populate CDN cache and track miss asynchronously (non-blocking)
  c.executionCtx.waitUntil(
    Promise.all([
      cache.put(cacheKey, response.clone()),
      incrementStat(c.env.KV_CACHE, 'stats:cdn:misses'),
    ])
  );

  return response;
});

const deleteImage = createRoute({
  method: 'delete',
  path: '/{key}',
  tags: ['Images'],
  summary: 'Delete an image',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [authMiddleware, adminOnly] as const,
  request: { params: ImageKeyParam },
  responses: {
    200: { content: { 'application/json': { schema: OkResponse } }, description: 'Image deleted' },
    400: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Invalid request' },
  },
});

publicApp.openapi(deleteImage, async (c) => {
  const { key } = c.req.valid('param');

  if (!c.env.IMAGES) {
    throw ApiError.invalidRequest('R2 bucket not configured');
  }

  if (!key) {
    throw ApiError.invalidRequest('Image key is required');
  }

  await c.env.IMAGES.delete(key);

  // Also purge the CDN edge cache entry for this image
  const cache = cfCaches.default;
  const imageUrl = `${new URL(c.req.url).origin}/v1/images/${key}`;
  c.executionCtx.waitUntil(cache.delete(new Request(imageUrl)));

  return c.json({ ok: true as const }, 200);
});

// ─── CDN cache purge routes ───────────────────────────────────────────────────
// Registered BEFORE the /{key}/cache route so that the literal segment "cache"
// is not captured as a {key} param value.

const purgeAllImagesCache = createRoute({
  method: 'delete',
  path: '/cache/all',
  tags: ['Images'],
  summary: 'Purge all images from CDN edge cache',
  description:
    'Iterates all R2 image keys and removes every CDN cache entry. Does not delete images from storage.',
  security: [{ bearerAuth: ['legacy sk_', 'admin:store'] }],
  middleware: [authMiddleware, adminOnly] as const,
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ ok: z.literal(true), purged: z.number().int() }),
        },
      },
      description: 'All CDN cache entries purged',
    },
  },
});

publicApp.openapi(purgeAllImagesCache, async (c) => {
  if (!c.env.IMAGES) {
    throw ApiError.invalidRequest('R2 bucket not configured');
  }

  const cache = cfCaches.default;
  const origin = new URL(c.req.url).origin;
  let purged = 0;
  let cursor: string | undefined;

  do {
    const listed = await c.env.IMAGES.list(cursor ? { cursor } : {});
    await Promise.all(
      listed.objects.map((obj) => {
        purged++;
        return cache.delete(new Request(`${origin}/v1/images/${obj.key}`));
      })
    );
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  return c.json({ ok: true as const, purged }, 200);
});

const purgeImageCache = createRoute({
  method: 'delete',
  path: '/{key}/cache',
  tags: ['Images'],
  summary: 'Purge a single image from CDN edge cache',
  description:
    'Removes the CDN edge cache entry for one image without deleting it from R2 storage.',
  security: [{ bearerAuth: ['legacy sk_', 'admin:store'] }],
  middleware: [authMiddleware, adminOnly] as const,
  request: { params: ImageKeyParam },
  responses: {
    200: { content: { 'application/json': { schema: OkResponse } }, description: 'CDN cache entry purged' },
    400: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Invalid request' },
  },
});

publicApp.openapi(purgeImageCache, async (c) => {
  const { key } = c.req.valid('param');

  const cache = cfCaches.default;
  const imageUrl = `${new URL(c.req.url).origin}/v1/images/${key}`;
  await cache.delete(new Request(imageUrl));

  return c.json({ ok: true as const }, 200);
});

export { publicApp as publicImages };
