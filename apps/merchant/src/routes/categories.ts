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

// apps/merchant/src/routes/categories.ts
// Full CRUD for product categories.
// Public routes: GET /v1/categories, GET /v1/categories/:handle/products
// Admin routes:  POST, PATCH, DELETE + manage product assignments

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { ApiError, uuid, now, type HonoEnv } from '../types';
import { getDb } from '../db';
import { authMiddleware, adminOnly } from '../middleware/auth';
import {
  CategoryResponse,
  CategoryListResponse,
  CategoryProductsResponse,
  CreateCategoryBody,
  UpdateCategoryBody,
  AssignProductsToCategoryBody,
  CategoryIdParam,
  CategoryHandleParam,
  PaginationResponse,
  ErrorResponse,
  ProductResponse,
} from '../schemas';

// ──────────────────────────────────────────────────────────────────────────────
// PUBLIC ROUTER (no auth required)
// ──────────────────────────────────────────────────────────────────────────────

const publicApp = new OpenAPIHono<HonoEnv>();

// ── Public: list active categories (flat or tree structure) ────────────────────

const listCategoriesRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Categories'],
  summary: 'List all active categories',
  description: 'Returns flat list of active categories, ready for building tree structure client-side',
  responses: {
    200: { 
      content: { 'application/json': { schema: CategoryListResponse } },
      description: 'List of active categories',
    },
    500: { 
      content: { 'application/json': { schema: ErrorResponse } },
      description: 'Server error',
    },
  },
});

publicApp.openapi(listCategoriesRoute, async (c) => {
  const db = getDb(c.var.db);
  try {
    const rows = await db.query<any>(
      `SELECT id, handle, name, parent_id, position, image_url, status, created_at, updated_at
       FROM categories WHERE status = 'active'
       ORDER BY position ASC, name ASC`
    );
    return c.json({ items: rows }, 200);
  } catch (error) {
    throw ApiError.internalServerError(error instanceof Error ? error.message : 'Failed to fetch categories');
  }
});

// ── Public: get single category by handle ────────────────────────────────────

const getCategoryByHandleRoute = createRoute({
  method: 'get',
  path: '/:handle',
  tags: ['Categories'],
  summary: 'Get a category by handle',
  request: {
    params: CategoryHandleParam,
  },
  responses: {
    200: { 
      content: { 'application/json': { schema: CategoryResponse } },
      description: 'Category details',
    },
    404: { 
      content: { 'application/json': { schema: ErrorResponse } },
      description: 'Category not found',
    },
  },
});

publicApp.openapi(getCategoryByHandleRoute, async (c) => {
  const { handle } = c.req.valid('param');
  const db = getDb(c.var.db);
  try {
    const [category] = await db.query<any>(
      `SELECT * FROM categories WHERE handle = ? AND status = 'active'`,
      [handle]
    );
    if (!category) throw ApiError.notFound(`Category with handle "${handle}" not found`);
    return c.json(category, 200);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.internalServerError(error instanceof Error ? error.message : 'Failed to fetch category');
  }
});

// ── Public: get products in a category by handle ─────────────────────────────

const getCategoryProductsRoute = createRoute({
  method: 'get',
  path: '/:handle/products',
  tags: ['Categories'],
  summary: 'List products in a category by handle',
  request: {
    params: CategoryHandleParam,
    query: z.object({ 
      limit: z.string().optional().openapi({ param: { name: 'limit', in: 'query' }, example: '20' }),
      cursor: z.string().optional().openapi({ param: { name: 'cursor', in: 'query' } }),
    }),
  },
  responses: {
    200: { 
      content: { 'application/json': { schema: CategoryProductsResponse } },
      description: 'Products in category',
    },
    404: { 
      content: { 'application/json': { schema: ErrorResponse } },
      description: 'Category not found',
    },
  },
});

publicApp.openapi(getCategoryProductsRoute, async (c) => {
  const { handle } = c.req.valid('param');
  const { limit: l, cursor } = c.req.valid('query');
  const db = getDb(c.var.db);

  try {
    const limit = Math.min(parseInt(l ?? '20'), 100);

    const [category] = await db.query<{ id: string }>(
      `SELECT id FROM categories WHERE handle = ? AND status = 'active'`,
      [handle]
    );
    if (!category) throw ApiError.notFound(`Category "${handle}" not found`);

    let sql = `
      SELECT p.id, p.title, p.handle, p.status, p.image_url, p.vendor, p.tags
      FROM products p
      JOIN product_categories pc ON pc.product_id = p.id
      WHERE pc.category_id = ? AND p.status = 'active'
    `;
    const params: unknown[] = [category.id];

    if (cursor) {
      sql += ' AND p.id > ?';
      params.push(cursor);
    }
    sql += ' ORDER BY pc.position ASC, p.created_at DESC LIMIT ?';
    params.push(limit + 1);

    const items = await db.query<any>(sql, params);
    const hasMore = items.length > limit;
    if (hasMore) items.pop();

    return c.json(
      {
        items,
        pagination: { has_more: hasMore, next_cursor: hasMore ? items.at(-1)?.id : null },
      },
      200
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.internalServerError(error instanceof Error ? error.message : 'Failed to fetch category products');
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// ADMIN ROUTER (auth + adminOnly required)
// ──────────────────────────────────────────────────────────────────────────────

const adminApp = new OpenAPIHono<HonoEnv>();
adminApp.use('*', authMiddleware);

// ── Admin: create category ──────────────────────────────────────────────────

const createCategoryRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Categories'],
  summary: 'Create a category (admin)',
  security: [{ bearerAuth: ['admin:store'] }],
  middleware: [adminOnly] as const,
  request: {
    body: {
      content: { 'application/json': { schema: CreateCategoryBody } },
    },
  },
  responses: {
    201: { 
      content: { 'application/json': { schema: CategoryResponse } },
      description: 'Category created',
    },
    400: { 
      content: { 'application/json': { schema: ErrorResponse } },
      description: 'Invalid input',
    },
    409: { 
      content: { 'application/json': { schema: ErrorResponse } },
      description: 'Handle already exists',
    },
  },
});

adminApp.openapi(createCategoryRoute, async (c) => {
  const body = c.req.valid('json');
  const db = getDb(c.var.db);

  try {
    const [existing] = await db.query<{ id: string }>(
      `SELECT id FROM categories WHERE handle = ?`,
      [body.handle]
    );
    if (existing) {
      throw ApiError.conflict(`Handle "${body.handle}" already exists`);
    }

    if (body.parent_id) {
      const [parent] = await db.query<{ id: string }>(
        `SELECT id FROM categories WHERE id = ?`,
        [body.parent_id]
      );
      if (!parent) {
        throw ApiError.badRequest('Parent category does not exist');
      }
    }

    const id = uuid();
    await db.run(
      `INSERT INTO categories (id, handle, name, description, parent_id, image_url, position, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        body.handle,
        body.name,
        body.description ?? null,
        body.parent_id ?? null,
        body.image_url ?? null,
        body.position ?? 0,
        'active',
        now(),
        now(),
      ]
    );

    const [row] = await db.query<any>(
      `SELECT * FROM categories WHERE id = ?`,
      [id]
    );
    return c.json(row, 201);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.internalServerError(error instanceof Error ? error.message : 'Failed to create category');
  }
});

// ── Admin: update category ──────────────────────────────────────────────────

const updateCategoryRoute = createRoute({
  method: 'patch',
  path: '/:id',
  tags: ['Categories'],
  summary: 'Update a category (admin)',
  security: [{ bearerAuth: ['admin:store'] }],
  middleware: [adminOnly] as const,
  request: {
    params: CategoryIdParam,
    body: {
      content: { 'application/json': { schema: UpdateCategoryBody } },
    },
  },
  responses: {
    200: { 
      content: { 'application/json': { schema: CategoryResponse } },
      description: 'Category updated',
    },
    400: { 
      content: { 'application/json': { schema: ErrorResponse } },
      description: 'Invalid input',
    },
    404: { 
      content: { 'application/json': { schema: ErrorResponse } },
      description: 'Category not found',
    },
    409: { 
      content: { 'application/json': { schema: ErrorResponse } },
      description: 'Handle already exists',
    },
  },
});

adminApp.openapi(updateCategoryRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = getDb(c.var.db);

  try {
    const [category] = await db.query<{ id: string }>(
      `SELECT id FROM categories WHERE id = ?`,
      [id]
    );
    if (!category) throw ApiError.notFound('Category not found');

    if (body.handle) {
      const [existing] = await db.query<{ id: string }>(
        `SELECT id FROM categories WHERE handle = ? AND id != ?`,
        [body.handle, id]
      );
      if (existing) {
        throw ApiError.conflict(`Handle "${body.handle}" already exists`);
      }
    }

    if (body.parent_id) {
      const [parent] = await db.query<{ id: string }>(
        `SELECT id FROM categories WHERE id = ?`,
        [body.parent_id]
      );
      if (!parent) {
        throw ApiError.badRequest('Parent category does not exist');
      }
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.handle) {
      updates.push('handle = ?');
      values.push(body.handle);
    }
    if (body.name) {
      updates.push('name = ?');
      values.push(body.name);
    }
    if (body.description !== undefined) {
      updates.push('description = ?');
      values.push(body.description);
    }
    if (body.parent_id !== undefined) {
      updates.push('parent_id = ?');
      values.push(body.parent_id);
    }
    if (body.image_url !== undefined) {
      updates.push('image_url = ?');
      values.push(body.image_url);
    }
    if (body.position !== undefined) {
      updates.push('position = ?');
      values.push(body.position);
    }
    if (body.status) {
      updates.push('status = ?');
      values.push(body.status);
    }

    updates.push('updated_at = ?');
    values.push(now());
    values.push(id);

    if (updates.length > 1) {
      const sql = `UPDATE categories SET ${updates.join(', ')} WHERE id = ?`;
      await db.run(sql, values);
    }

    const [row] = await db.query<any>(
      `SELECT * FROM categories WHERE id = ?`,
      [id]
    );
    return c.json(row, 200);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.internalServerError(error instanceof Error ? error.message : 'Failed to update category');
  }
});

// ── Admin: delete category ──────────────────────────────────────────────────

const deleteCategoryRoute = createRoute({
  method: 'delete',
  path: '/:id',
  tags: ['Categories'],
  summary: 'Delete a category (admin)',
  security: [{ bearerAuth: ['admin:store'] }],
  middleware: [adminOnly] as const,
  request: {
    params: CategoryIdParam,
  },
  responses: {
    200: { 
      content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } },
      description: 'Category deleted',
    },
    404: { 
      content: { 'application/json': { schema: ErrorResponse } },
      description: 'Category not found',
    },
  },
});

adminApp.openapi(deleteCategoryRoute, async (c) => {
  const { id } = c.req.valid('param');
  const db = getDb(c.var.db);

  try {
    const [category] = await db.query<{ id: string }>(
      `SELECT id FROM categories WHERE id = ?`,
      [id]
    );
    if (!category) throw ApiError.notFound('Category not found');

    await db.run('DELETE FROM categories WHERE id = ?', [id]);
    return c.json({ ok: true }, 200);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.internalServerError(error instanceof Error ? error.message : 'Failed to delete category');
  }
});

// ── Admin: assign products to a category ────────────────────────────────────

const assignProductsRoute = createRoute({
  method: 'post',
  path: '/:id/products',
  tags: ['Categories'],
  summary: 'Assign products to a category (admin)',
  security: [{ bearerAuth: ['admin:store'] }],
  middleware: [adminOnly] as const,
  request: {
    params: CategoryIdParam,
    body: {
      content: { 'application/json': { schema: AssignProductsToCategoryBody } },
    },
  },
  responses: {
    200: { 
      content: { 'application/json': { schema: z.object({ ok: z.boolean(), assigned: z.number() }) } },
      description: 'Products assigned',
    },
    404: { 
      content: { 'application/json': { schema: ErrorResponse } },
      description: 'Category not found',
    },
  },
});

adminApp.openapi(assignProductsRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { product_ids } = c.req.valid('json');
  const db = getDb(c.var.db);

  try {
    const [category] = await db.query<{ id: string }>(
      `SELECT id FROM categories WHERE id = ?`,
      [id]
    );
    if (!category) throw ApiError.notFound('Category not found');

    let assigned = 0;
    for (const productId of product_ids) {
      try {
        await db.run(
          `INSERT OR IGNORE INTO product_categories (product_id, category_id, position)
           VALUES (?, ?, 0)`,
          [productId, id]
        );
        assigned++;
      } catch {
        // Product may not exist or already assigned, continue
      }
    }

    return c.json({ ok: true, assigned }, 200);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.internalServerError(error instanceof Error ? error.message : 'Failed to assign products');
  }
});

// ── Admin: remove product from category ─────────────────────────────────────

const removeProductFromCategoryRoute = createRoute({
  method: 'delete',
  path: '/:id/products/:productId',
  tags: ['Categories'],
  summary: 'Remove a product from a category (admin)',
  security: [{ bearerAuth: ['admin:store'] }],
  middleware: [adminOnly] as const,
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }),
      productId: z.string().uuid().openapi({ param: { name: 'productId', in: 'path' } }),
    }),
  },
  responses: {
    200: { 
      content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } },
      description: 'Product removed from category',
    },
  },
});

adminApp.openapi(removeProductFromCategoryRoute, async (c) => {
  const { id, productId } = c.req.valid('param');
  const db = getDb(c.var.db);

  try {
    await db.run(
      `DELETE FROM product_categories WHERE category_id = ? AND product_id = ?`,
      [id, productId]
    );
    return c.json({ ok: true }, 200);
  } catch (error) {
    throw ApiError.internalServerError(error instanceof Error ? error.message : 'Failed to remove product');
  }
});

export { publicApp as publicCategories, adminApp as adminCategories };
