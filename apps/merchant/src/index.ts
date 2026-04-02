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

import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { swaggerUI } from '@hono/swagger-ui';
import { adminSetup } from './routes/setup';
import { adminCatalog } from './routes/catalog';
import { adminInventory } from './routes/inventory';
import { adminCheckout } from './routes/checkout';
import { adminOrders, publicOrders } from './routes/orders';
import { adminCustomers } from './routes/customers';
import { webhooks } from './routes/webhooks';
import { adminWebhooksRoutes } from './routes/webhooks-outbound';
import { publicImages } from './routes/images';
import { adminDiscounts } from './routes/discounts';
import { oauth } from './routes/oauth';
import { ucp } from './routes/ucp';
import { adminAuth0 } from './routes/auth0';
import { adminMe } from './routes/me';
import { adminUserPreferencesRouter } from './routes/user-preferences';
import { adminSavedCartsRouter } from './routes/saved-carts';
import { publicCategories, adminCategories } from './routes/categories';
import { adminAnalytics } from './routes/analytics';
import { reviews, adminReviews } from './routes/reviews';
import { adminRegions } from './routes/regions';
import { adminOrderEmailSettings } from './routes/order-email-settings';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { kvCacheMiddleware, kvInvalidateMiddleware } from './middleware/kv-cache';
import { adminAi } from './routes/ai';
import { adminTaxRates } from './routes/tax-rates';
import { ApiError, type Env, type DOStub } from './types';
import { MerchantDO } from './do';
import { adminMails } from './routes/mails';

export { MerchantDO };

type Variables = {
  db: DOStub;
};

const app = new OpenAPIHono<{ Bindings: Env; Variables: Variables }>();

app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
});

app.use('*', cors());

app.use('*', async (c, next) => {
  const id = c.env.MERCHANT.idFromName('default');
  const stub = c.env.MERCHANT.get(id);
  c.set('db', stub as unknown as DOStub);
  await next();
});

// KV cache & invalidation: must be registered on the parent app with app.use()
// BEFORE app.route() so they execute first in Hono's middleware chain.
//
// kvCacheMiddleware caches:
//   • Unauthenticated GETs (public categories, reviews)
//   • GETs with a public key (Bearer pk_...) — same response for all storefront
//     visitors; products and product pages are the highest-traffic endpoints.
// Admin tokens (sk_ / JWT) always bypass the cache.
//
// kvInvalidateMiddleware purges by prefix on successful mutations, covering
// both the list and all paginated/filtered/detail variants of each namespace.
app.use('/v1/categories', kvCacheMiddleware);
app.use('/v1/categories/*', kvCacheMiddleware);
app.use('/v1/products', kvCacheMiddleware);
app.use('/v1/products/*', kvCacheMiddleware);
app.use('/openapi.json', kvCacheMiddleware);
app.use('/openapi/*', kvCacheMiddleware);
app.use('/v1/categories', kvInvalidateMiddleware);
app.use('/v1/categories/*', kvInvalidateMiddleware);
app.use('/v1/products', kvInvalidateMiddleware);
app.use('/v1/products/*', kvInvalidateMiddleware);

// Mount public routes BEFORE authentication middleware
app.route('/v1/orders', publicOrders);
app.route('/v1/categories', publicCategories);

app.use('/v1/*', rateLimitMiddleware());

app.onError((err, c) => {
  console.error(err);

  if (err instanceof ApiError) {
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details && { details: err.details }),
        },
      },
      err.statusCode as any
    );
  }

  // Extract detailed error message for database and other errors
  const errorMessage = err instanceof Error ? err.message : String(err);
  const message = `Internal server error${errorMessage ? ': ' + errorMessage : ''}`;

  return c.json({ error: { code: 'internal', message } }, 500);
});

app.get('/', (c) => c.json({ name: 'merchant', version: '0.1.0', ok: true }));

app.route('/v1/setup', adminSetup);
app.route('/v1/ai', adminAi);
// Mount reviews BEFORE catalog — catalog has app.use('*', authMiddleware) which
// would otherwise intercept /v1/products/:productId/reviews/guest (a public route)
app.route('/v1/products/:productId/reviews', reviews);
app.route('/v1/products', adminCatalog);
app.route('/v1/inventory', adminInventory);
app.route('/v1/carts', adminCheckout);
app.route('/v1/orders', adminOrders);
app.route('/v1/categories', adminCategories);
app.route('/v1/analytics', adminAnalytics);
app.route('/v1/reviews', adminReviews);
app.route('/v1/customers', adminCustomers);
app.route('/v1/webhooks', webhooks);
app.route('/v1/webhooks', adminWebhooksRoutes);
app.route('/v1/images', publicImages);
app.route('/v1/discounts', adminDiscounts);
app.route('/v1/regions', adminRegions);
app.route('/v1/tax-rates', adminTaxRates);
app.route('/v1/mails', adminMails);
app.route('/v1/admin/order-email-settings', adminOrderEmailSettings);
app.route('/v1/me', adminMe);
app.route('/v1', adminUserPreferencesRouter);
app.route('/v1', adminSavedCartsRouter);
app.route('/oauth', oauth);
app.route('', oauth);
app.route('', ucp);
app.route('/v1/__auth0', adminAuth0);

app.doc31('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'Fufuni API',
    version: '1.0.0',
    description: 'The open-source commerce backend for Cloudflare + Stripe + Auth0',
  },
  servers: [{ url: '/' }],
});

app.get('/docs', swaggerUI({ url: '/openapi.json' }));

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const id = env.MERCHANT.idFromName('default');
    const stub = env.MERCHANT.get(id);
    const cleaned = await (stub as unknown as { cleanupExpiredCarts: () => Promise<number> }).cleanupExpiredCarts();
    console.log(`Cron: cleaned ${cleaned} expired carts`);
  },
};
