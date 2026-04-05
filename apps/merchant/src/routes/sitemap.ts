/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 *
 * Dynamic XML sitemap — no authentication required.
 * Lists active products and categories with lastmod dates.
 * Cached 1 hour at Cloudflare edge (Cache-Control: public, max-age=3600).
 */
import { Hono } from 'hono';
import type { HonoEnv } from '../types';
import { getDb } from '../db';

export const sitemapRouter = new Hono<HonoEnv>();

sitemapRouter.get('/sitemap.xml', async (c) => {
  const db = getDb(c.var.db);
  const baseUrl = (c.env as { STORE_URL?: string }).STORE_URL
    ?? new URL(c.req.url).origin;

  const products = await db.query<{ id: string; updated_at: string }>(
    `SELECT id, updated_at FROM products WHERE active = 1 ORDER BY updated_at DESC LIMIT 50000`,
    []
  );
  const categories = await db.query<{ handle: string; updated_at: string }>(
    `SELECT handle, updated_at FROM categories WHERE active = 1 LIMIT 10000`,
    []
  );

  const toDate = (ts: string) =>
    ts?.split('T')[0] ?? new Date().toISOString().split('T')[0];

  const staticUrls = ['', '/products', '/about'].map(path => `
  <url>
    <loc>${baseUrl}${path}</loc>
    <changefreq>weekly</changefreq>
    <priority>${path === '' ? '1.0' : '0.8'}</priority>
  </url>`).join('');

  const productUrls = products.map(p => `
  <url>
    <loc>${baseUrl}/product/${p.id}</loc>
    <lastmod>${toDate(p.updated_at)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');

  const categoryUrls = categories.map(cat => `
  <url>
    <loc>${baseUrl}/products?category=${encodeURIComponent(cat.handle)}</loc>
    <lastmod>${toDate(cat.updated_at)}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.6</priority>
  </url>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls}${productUrls}${categoryUrls}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
});
