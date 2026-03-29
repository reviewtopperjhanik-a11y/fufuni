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

// apps/merchant/src/routes/reviews.ts
// Handles product review CRUD — split into two Hono apps:
//   • reviews      → /v1/products/:productId/reviews  (public GET + customer POST)
//   • reviewsAdmin → /v1/reviews                      (admin GET list + admin PATCH moderate)

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { ApiError, uuid, now, type HonoEnv } from '../types';
import { getDb } from '../db';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { customerAuthMiddleware } from '../middleware/customer-auth';
import { verifyOrderViewToken, hashOrderToken } from '../lib/order-token';

// ─────────────────────────────────────────────────────────────────────────────
// App 1: product-scoped reviews (public + customer)
// Mounted at: /v1/products/:productId/reviews
// ─────────────────────────────────────────────────────────────────────────────

const app = new OpenAPIHono<HonoEnv>();

// ── Public: list approved reviews for a product ────────────────────────────

const listReviewsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Reviews'],
  summary: 'List approved reviews for a product',
  request: {
    params: z.object({ productId: z.string().uuid() }),
    query: z.object({
      limit: z.string().optional().default('20'),
      // cursor = created_at value of the last item from the previous page (ISO string)
      cursor: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Paginated list of approved reviews',
      content: {
        'application/json': {
          schema: z.object({
            items: z.array(
              z.object({
                id: z.string(),
                author_name: z.string(),
                rating: z.number(),
                title: z.string().nullable(),
                body: z.string().nullable(),
                is_verified_purchase: z.number(),
                helpful_count: z.number(),
                created_at: z.string(),
              })
            ),
            pagination: z.object({
              has_more: z.boolean(),
              // Pass this value as ?cursor= on the next call
              next_cursor: z.string().nullable(),
            }),
          }),
        },
      },
    },
  },
});

app.openapi(listReviewsRoute, async (c) => {
  const { productId } = c.req.valid('param');
  const { limit: limitStr, cursor } = c.req.valid('query');
  const db = getDb(c.var.db);
  const limit = Math.min(parseInt(limitStr), 50);

  // Cursor is the created_at of the last seen item.
  // Using created_at < ? keeps stable ordering when new rows are inserted.
  // NOTE: do NOT use id > ? — UUIDs are not chronologically ordered.
  let sql = `SELECT * FROM product_reviews
             WHERE product_id = ? AND status = 'approved'`;
  const params: unknown[] = [productId];

  if (cursor) {
    sql += ' AND created_at < ?';
    params.push(cursor);
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit + 1);

  const rows = await db.query<any>(sql, params);
  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();

  return c.json(
    {
      items: rows.map((r) => ({
        id: r.id,
        author_name: r.author_name,
        rating: r.rating,
        title: r.title ?? null,
        body: r.body ?? null,
        is_verified_purchase: r.is_verified_purchase,
        helpful_count: r.helpful_count,
        created_at: r.created_at,
      })),
      pagination: {
        has_more: hasMore,
        next_cursor: hasMore && rows.length > 0 ? rows[rows.length - 1].created_at : null,
      },
    },
    200
  );
});

// ── Customer: submit a review ──────────────────────────────────────────────

const createReviewRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Reviews'],
  summary: 'Submit a product review (requires customer JWT)',
  security: [{ bearerAuth: ['valid jwt'] }],
  request: {
    params: z.object({ productId: z.string().uuid() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            rating: z.number().int().min(1).max(5),
            title: z.string().max(120).optional(),
            body: z.string().max(2000).optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Review submitted (pending moderation)',
      content: {
        'application/json': {
          schema: z.object({ id: z.string(), status: z.string() }),
        },
      },
    },
    409: {
      description: 'Customer already reviewed this product',
      content: {
        'application/json': {
          schema: z.object({ message: z.string() }),
        },
      },
    },
  },
});

app.openapi(createReviewRoute, async (c) => {
  const { productId } = c.req.valid('param');
  const { rating, title, body } = c.req.valid('json');
  const db = getDb(c.var.db);

  // Inline auth: verify Bearer token manually (avoids Hono sub-app prefix issue with route-level middleware)
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing or invalid Authorization header');
  }
  const jwtToken = authHeader.slice(7);
  const domain = c.env.AUTH0_DOMAIN;
  const audience = c.env.AUTH0_AUDIENCE;
  if (!domain || !audience) throw ApiError.unauthorized('Auth0 not configured');
  let authPayload: any;
  try {
    const { verifyAuth0Jwt } = await import('../lib/auth0');
    authPayload = await verifyAuth0Jwt(jwtToken, domain, audience);
  } catch {
    throw ApiError.unauthorized('Invalid Auth0 JWT');
  }
  const jwtSub = authPayload.sub as string | undefined;
  if (!jwtSub) throw ApiError.unauthorized('Invalid token: missing sub claim');

  // Resolve customer from Auth0 JWT sub claim
  const [customer] = await db.query<{ id: string; email: string; name: string | null }>(
    `SELECT id, email, name FROM customers WHERE auth_provider_id = ? LIMIT 1`,
    [jwtSub]
  );
  if (!customer) throw ApiError.unauthorized('Customer account not found');

  // Prevent duplicate review
  const [existing] = await db.query<{ id: string }>(
    `SELECT id FROM product_reviews WHERE product_id = ? AND customer_id = ?`,
    [productId, customer.id]
  );
  if (existing) throw ApiError.conflict('You have already reviewed this product');

  // Check if this is a verified purchase (order with status 'delivered' containing this product)
  const [order] = await db.query<{ id: string }>(
    `SELECT o.id FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN variants v     ON v.sku = oi.sku
     WHERE v.product_id = ? AND o.customer_id = ? AND o.status = 'delivered'
     LIMIT 1`,
    [productId, customer.id]
  );

  const id = uuid();
  await db.run(
    `INSERT INTO product_reviews
       (id, product_id, customer_id, author_name, author_email, rating, title, body,
        is_verified_purchase, order_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      productId,
      customer.id,
      customer.name ?? customer.email.split('@')[0],
      customer.email,
      rating,
      title ?? null,
      body ?? null,
      order ? 1 : 0,
      order?.id ?? null,
      now(),
      now(),
    ]
  );

  return c.json({ id, status: 'pending' }, 201);
});

// ── Guest: submit a review via order token (no Auth0 required) ─────────────

const createGuestReviewRoute = createRoute({
  method: 'post',
  path: '/guest',
  tags: ['Reviews'],
  summary: 'Submit a product review as a guest via signed order token',
  request: {
    params: z.object({ productId: z.string().uuid() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            rating: z.number().int().min(1).max(5),
            title: z.string().max(120).optional(),
            body: z.string().max(2000).optional(),
            author_name: z.string().max(80).optional(),
            order_id: z.string().uuid(),
            order_token: z.string().min(1),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Review submitted (pending moderation)',
      content: {
        'application/json': {
          schema: z.object({ id: z.string(), status: z.string() }),
        },
      },
    },
    401: {
      description: 'Invalid or expired order token',
      content: { 'application/json': { schema: z.object({ message: z.string() }) } },
    },
    409: {
      description: 'A review from this order already exists for this product',
      content: { 'application/json': { schema: z.object({ message: z.string() }) } },
    },
  },
});

app.openapi(createGuestReviewRoute, async (c) => {
  const { productId } = c.req.valid('param');
  const { rating, title, body, author_name, order_id, order_token } = c.req.valid('json');
  const db = getDb(c.var.db);
  const secret = c.env.ORDER_TOKEN_SECRET;

  if (!secret) throw ApiError.unauthorized('Order token secret not configured');

  // Verify the JWT signature and that it was issued for this exact order
  try {
    await verifyOrderViewToken(order_token, order_id, secret);
  } catch {
    throw ApiError.unauthorized('Invalid or expired order token');
  }

  // Double-check: token hash must match what's stored on the order row
  const tokenHash = await hashOrderToken(order_token);
  const [order] = await db.query<{ id: string; customer_email: string; shipping_name: string | null; status: string }>(
    `SELECT id, customer_email, shipping_name, status FROM orders WHERE id = ? AND viewtoken = ? LIMIT 1`,
    [order_id, tokenHash]
  );
  if (!order) throw ApiError.unauthorized('Invalid or expired order token');

  // Only allow reviews on delivered orders
  if (order.status !== 'delivered') {
    throw ApiError.badRequest('Reviews can only be submitted for delivered orders');
  }

  // Verify the product is actually in this order
  const [inOrder] = await db.query<{ id: string }>(
    `SELECT oi.id FROM order_items oi
     JOIN variants v ON v.sku = oi.sku
     WHERE oi.order_id = ? AND v.product_id = ? LIMIT 1`,
    [order_id, productId]
  );
  if (!inOrder) throw ApiError.badRequest('This product is not part of the order');

  // Prevent duplicate: one review per (order, product) pair
  const [existing] = await db.query<{ id: string }>(
    `SELECT id FROM product_reviews WHERE product_id = ? AND order_id = ?`,
    [productId, order_id]
  );
  if (existing) throw ApiError.conflict('A review for this product from this order already exists');

  const displayName =
    author_name?.trim() ||
    order.shipping_name ||
    order.customer_email.split('@')[0];

  const id = uuid();
  await db.run(
    `INSERT INTO product_reviews
       (id, product_id, customer_id, author_name, author_email, rating, title, body,
        is_verified_purchase, order_id, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [id, productId, displayName, order.customer_email, rating, title ?? null, body ?? null, order_id, now(), now()]
  );

  return c.json({ id, status: 'pending' }, 201);
});

export { app as reviews };

// ─────────────────────────────────────────────────────────────────────────────
// App 2: admin reviews (cross-product list + moderation)
// Mounted at: /v1/reviews
// Full paths: GET /v1/reviews/admin   PATCH /v1/reviews/:reviewId/status
// ─────────────────────────────────────────────────────────────────────────────

const adminApp = new OpenAPIHono<HonoEnv>();

const adminListReviewsRoute = createRoute({
  method: 'get',
  path: '/admin',
  tags: ['Reviews'],
  summary: 'List all reviews across all products (admin)',
  security: [{ bearerAuth: ['admin:store'] }],
  middleware: [authMiddleware, adminOnly] as const,
  request: {
    query: z.object({
      status: z.enum(['pending', 'approved', 'rejected', 'all']).optional().default('pending'),
      limit: z.string().optional().default('50'),
    }),
  },
  responses: {
    200: {
      description: 'All reviews',
      content: {
        'application/json': {
          schema: z.object({ items: z.array(z.any()) }),
        },
      },
    },
  },
});

adminApp.openapi(adminListReviewsRoute, async (c) => {
  const { status, limit: limitStr } = c.req.valid('query');
  const db = getDb(c.var.db);
  const limit = Math.min(parseInt(limitStr), 200);

  // Use parameterized query — never interpolate status directly into SQL
  const useFilter = status !== 'all';
  const rows = await db.query<any>(
    `SELECT pr.*, p.title AS product_title
     FROM product_reviews pr
     JOIN products p ON p.id = pr.product_id
     ${useFilter ? 'WHERE pr.status = ?' : ''}
     ORDER BY pr.created_at DESC
     LIMIT ?`,
    useFilter ? [status, limit] : [limit]
  );

  return c.json({ items: rows }, 200);
});

const moderateReviewRoute = createRoute({
  method: 'patch',
  path: '/:reviewId/status',
  tags: ['Reviews'],
  summary: 'Approve or reject a review (admin)',
  security: [{ bearerAuth: ['admin:store'] }],
  middleware: [authMiddleware, adminOnly] as const,
  request: {
    params: z.object({ reviewId: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            status: z.enum(['approved', 'rejected']),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Review updated',
      content: {
        'application/json': {
          schema: z.object({ ok: z.boolean() }),
        },
      },
    },
  },
});

adminApp.openapi(moderateReviewRoute, async (c) => {
  const { reviewId } = c.req.valid('param');
  const { status } = c.req.valid('json');
  const db = getDb(c.var.db);

  await db.run(`UPDATE product_reviews SET status = ?, updated_at = ? WHERE id = ?`, [
    status,
    now(),
    reviewId,
  ]);

  // Recompute cached rating columns on the parent product
  await db.run(
    `UPDATE products SET
       review_count   = (SELECT COUNT(*) FROM product_reviews WHERE product_id = products.id AND status = 'approved'),
       average_rating = COALESCE((SELECT AVG(rating) FROM product_reviews WHERE product_id = products.id AND status = 'approved'), 0)
     WHERE id = (SELECT product_id FROM product_reviews WHERE id = ?)`,
    [reviewId]
  );

  return c.json({ ok: true }, 200);
});

export { adminApp as reviewsAdmin };
