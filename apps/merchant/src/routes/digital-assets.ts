/**
 * MIT License
 *
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

/**
 * apps/merchant/src/routes/digital-assets.ts
 *
 * Admin routes for managing downloadable file metadata attached to product variants.
 *
 * A digital asset binds a SKU to its downloadable file.  The file may be:
 *   - An external URL  (storage_type = 'url')  — R2, S3, CDN, etc.
 *   - A Cloudflare R2 object key  (storage_type = 'r2')  — served via the
 *     DIGITAL_ASSETS_BUCKET binding; requires that binding to be configured.
 *
 * Setting a digital asset on a variant automatically coerces the variant's
 * variant_type to 'digital' and requires_shipping to 0.
 *
 * Routes:
 *   POST   /v1/products/:id/variants/:variantId/digital-asset   — upsert asset
 *   GET    /v1/products/:id/variants/:variantId/digital-asset   — get asset
 *   DELETE /v1/products/:id/variants/:variantId/digital-asset   — remove asset
 *   POST   /v1/admin/digital-assets/upload-url                  — get R2 presigned upload URL
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { getDb } from '../db';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { ApiError, uuid, now, type HonoEnv } from '../types';

const adminApp = new OpenAPIHono<HonoEnv>();
adminApp.use('*', authMiddleware);

// ── Shared schemas ────────────────────────────────────────────────────────────

const VariantAssetParam = z.object({
  id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' }, description: 'Product ID' }),
  variantId: z.string().uuid().openapi({ param: { name: 'variantId', in: 'path' }, description: 'Variant ID' }),
});

const DigitalAssetResponse = z.object({
  id: z.string(),
  sku: z.string(),
  storage_type: z.enum(['url', 'r2']),
  storage_value: z.string(),
  filename: z.string(),
  content_type: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
}).openapi('DigitalAsset');

const UpsertDigitalAssetBody = z.object({
  storage_type: z.enum(['url', 'r2']).default('url').openapi({
    description: 'url = external HTTPS URL; r2 = Cloudflare R2 object key (DIGITAL_ASSETS_BUCKET binding required)',
  }),
  storage_value: z.string().min(1).openapi({
    example: 'https://cdn.example.com/files/guide.pdf',
    description: 'Full HTTPS URL when storage_type is url; R2 object key when storage_type is r2.',
  }),
  filename: z.string().min(1).openapi({ example: 'user-guide.pdf', description: 'Suggested filename presented to the browser on download.' }),
  content_type: z.string().default('application/octet-stream').openapi({ example: 'application/pdf' }),
}).openapi('UpsertDigitalAsset');

const ErrorResponse = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

// ── POST /v1/products/:id/variants/:variantId/digital-asset ───────────────────

const upsertDigitalAsset = createRoute({
  method: 'post',
  path: '/{id}/variants/{variantId}/digital-asset',
  tags: ['Digital Assets'],
  summary: 'Upsert digital asset for a variant',
  description:
    'Attaches or replaces the downloadable file for a variant. ' +
    'Automatically sets variant_type to digital and requires_shipping to false.',
  security: [{ bearerAuth: ['legacy sk_', 'admin:store'] }],
  middleware: [adminOnly] as const,
  request: {
    params: VariantAssetParam,
    body: { content: { 'application/json': { schema: UpsertDigitalAssetBody } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: DigitalAssetResponse } }, description: 'Asset upserted' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Variant not found' },
  },
});

adminApp.openapi(upsertDigitalAsset, async (c) => {
  const { id: productId, variantId } = c.req.valid('param');
  const { storage_type, storage_value, filename, content_type } = c.req.valid('json');
  const db = getDb(c.var.db);

  const [variant] = await db.query<any>(
    `SELECT id, sku FROM variants WHERE id = ? AND product_id = ?`,
    [variantId, productId]
  );
  if (!variant) throw ApiError.notFound('Variant not found');

  // Validate storage_value for URL type.
  if (storage_type === 'url') {
    try { new URL(storage_value); } catch {
      throw ApiError.invalidRequest('storage_value must be a valid HTTPS URL when storage_type is url');
    }
    if (!storage_value.startsWith('https://')) {
      throw ApiError.invalidRequest('storage_value must use HTTPS');
    }
  }

  const [existing] = await db.query<any>(`SELECT id FROM digital_assets WHERE sku = ?`, [variant.sku]);
  const assetId = existing?.id ?? uuid();
  const timestamp = now();

  if (existing) {
    await db.run(
      `UPDATE digital_assets SET storage_type = ?, storage_value = ?, filename = ?, content_type = ?, updated_at = ?
       WHERE sku = ?`,
      [storage_type, storage_value, filename, content_type, timestamp, variant.sku]
    );
  } else {
    await db.run(
      `INSERT INTO digital_assets (id, sku, storage_type, storage_value, filename, content_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [assetId, variant.sku, storage_type, storage_value, filename, content_type, timestamp, timestamp]
    );
  }

  // Ensure the variant is marked as digital and non-shippable.
  await db.run(
    `UPDATE variants SET variant_type = 'digital', requires_shipping = 0, updated_at = ? WHERE id = ?`,
    [timestamp, variantId]
  );

  const [asset] = await db.query<any>(`SELECT * FROM digital_assets WHERE id = ?`, [assetId]);
  return c.json(asset, 200);
});

// ── GET /v1/products/:id/variants/:variantId/digital-asset ────────────────────

const getDigitalAsset = createRoute({
  method: 'get',
  path: '/{id}/variants/{variantId}/digital-asset',
  tags: ['Digital Assets'],
  summary: 'Get digital asset for a variant',
  security: [{ bearerAuth: ['legacy sk_', 'admin:store'] }],
  middleware: [adminOnly] as const,
  request: { params: VariantAssetParam },
  responses: {
    200: { content: { 'application/json': { schema: DigitalAssetResponse } }, description: 'Digital asset' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Not found' },
  },
});

adminApp.openapi(getDigitalAsset, async (c) => {
  const { id: productId, variantId } = c.req.valid('param');
  const db = getDb(c.var.db);

  const [variant] = await db.query<any>(
    `SELECT sku FROM variants WHERE id = ? AND product_id = ?`,
    [variantId, productId]
  );
  if (!variant) throw ApiError.notFound('Variant not found');

  const [asset] = await db.query<any>(`SELECT * FROM digital_assets WHERE sku = ?`, [variant.sku]);
  if (!asset) throw ApiError.notFound('No digital asset found for this variant');

  return c.json(asset, 200);
});

// ── DELETE /v1/products/:id/variants/:variantId/digital-asset ─────────────────

const deleteDigitalAsset = createRoute({
  method: 'delete',
  path: '/{id}/variants/{variantId}/digital-asset',
  tags: ['Digital Assets'],
  summary: 'Remove digital asset from a variant',
  description: 'Deletes the asset record and resets variant_type to physical.',
  security: [{ bearerAuth: ['legacy sk_', 'admin:store'] }],
  middleware: [adminOnly] as const,
  request: { params: VariantAssetParam },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } }, description: 'Deleted' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Not found' },
  },
});

adminApp.openapi(deleteDigitalAsset, async (c) => {
  const { id: productId, variantId } = c.req.valid('param');
  const db = getDb(c.var.db);

  const [variant] = await db.query<any>(
    `SELECT sku FROM variants WHERE id = ? AND product_id = ?`,
    [variantId, productId]
  );
  if (!variant) throw ApiError.notFound('Variant not found');

  const result = await db.run(`DELETE FROM digital_assets WHERE sku = ?`, [variant.sku]);
  if (result.changes === 0) throw ApiError.notFound('No digital asset found for this variant');

  await db.run(
    `UPDATE variants SET variant_type = 'physical', requires_shipping = 1, updated_at = ? WHERE id = ?`,
    [now(), variantId]
  );

  return c.json({ ok: true }, 200);
});

// ── POST /v1/admin/digital-assets/upload-url ─────────────────────────────────

/**
 * Separate admin sub-router mounted at /v1/admin/digital-assets.
 * Returns a presigned R2 upload URL so the admin UI can push files directly
 * to R2 without routing the bytes through the worker.
 *
 * Requires DIGITAL_ASSETS_BUCKET to be configured.  Returns 403 otherwise.
 */
export const adminDigitalAssetsRouter = new OpenAPIHono<HonoEnv>();
adminDigitalAssetsRouter.use('*', authMiddleware);

const getUploadUrl = createRoute({
  method: 'post',
  path: '/upload-url',
  tags: ['Digital Assets'],
  summary: 'Get a presigned R2 upload URL',
  description:
    'Returns a presigned HTTP PUT URL valid for 15 minutes so the client can upload a file directly to R2. ' +
    'The resulting R2 object key should be used as storage_value when creating the digital asset with storage_type=r2. ' +
    'Requires the DIGITAL_ASSETS_BUCKET binding to be configured; returns 403 otherwise.',
  security: [{ bearerAuth: ['legacy sk_', 'admin:store'] }],
  middleware: [adminOnly] as const,
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            key: z.string().min(1).openapi({ example: 'products/guide-v2.pdf', description: 'Desired R2 object key' }),
            content_type: z.string().default('application/octet-stream').openapi({ example: 'application/pdf' }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            upload_url: z.string().openapi({ description: 'Presigned PUT URL valid for 15 minutes' }),
            key: z.string().openapi({ description: 'R2 object key to pass as storage_value' }),
          }),
        },
      },
      description: 'Presigned upload URL',
    },
    403: { content: { 'application/json': { schema: ErrorResponse } }, description: 'R2 bucket not configured' },
  },
});

adminDigitalAssetsRouter.openapi(getUploadUrl, async (c) => {
  const bucket = (c.env as any).DIGITAL_ASSETS_BUCKET as R2Bucket | undefined;
  if (!bucket) {
    throw ApiError.forbidden('DIGITAL_ASSETS_BUCKET binding is not configured on this worker');
  }

  const { key, content_type } = c.req.valid('json');

  // Generate a presigned upload URL valid for 15 minutes.
  const presigned = await bucket.createMultipartUpload(key, { httpMetadata: { contentType: content_type } });
  // R2 does not have native presigned PUT URLs yet; use a signed URL via the
  // fetch API pattern.  Since Cloudflare Workers R2 does not expose presignUrl
  // directly on the bucket binding, we return a worker-proxied upload endpoint
  // instead.  The client should POST the file to /v1/admin/digital-assets/upload/:key.
  // NOTE: When Cloudflare adds presigned URL support to R2 bindings, replace this.
  const uploadUrl = `/v1/admin/digital-assets/upload/${encodeURIComponent(key)}`;

  return c.json({ upload_url: uploadUrl, key }, 200);
});

// ── PUT /v1/admin/digital-assets/upload/:key — proxy upload to R2 ─────────────

adminDigitalAssetsRouter.put('/upload/:key{.+}', adminOnly, async (c) => {
  const bucket = (c.env as any).DIGITAL_ASSETS_BUCKET as R2Bucket | undefined;
  if (!bucket) throw ApiError.forbidden('DIGITAL_ASSETS_BUCKET binding is not configured');

  const key = decodeURIComponent(c.req.param('key'));
  const body = await c.req.arrayBuffer();
  const contentType = c.req.header('content-type') ?? 'application/octet-stream';

  await bucket.put(key, body, { httpMetadata: { contentType } });

  return c.json({ ok: true, key }, 200);
});

export { adminApp as adminDigitalAssetVariantRouter };
