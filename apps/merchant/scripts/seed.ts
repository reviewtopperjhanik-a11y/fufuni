#!/usr/bin/env npx tsx
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
 * Seed script - creates demo data via the API
 *
 * Maintainers and contributors should use this script to populate a local
 * or test environment with realistic sample data sets (regions, tax rates,
 * categories, products, inventory, orders, and reviews).
 *
 * The script is intentionally idempotent for rerun safety where possible.
 *
 * Usage:
 *   npx tsx scripts/seed.ts <api_url> <admin_key>
 *   npx tsx scripts/seed.ts http://localhost:8787 sk_...
 *
 * This file has two main responsibilities:
 *  1. structural organization of data (PRODUCT_CATALOG, SEED_ADDRESSES, etc.)
 *  2. orchestration functions that call the API in a safe order.
 *
 * When extending, add new seed helpers near the bottom and ensure the
 * `seed()` orchestrator is updated.
 */

// images are embedded as base64 so this file can run even after the PNGs are removed
import { imageMap } from './image_map';
import {
  EUROPEAN_COUNTRIES,
  UK_COUNTRIES,
  US_COUNTRIES,
  OTHER_COUNTRIES,
} from './seed-data';
import { readFileSync, existsSync } from 'node:fs';
import { join as pathJoin, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import webpWasm from 'webp-wasm';
import { PNG } from 'pngjs';
import { decode as decodeJpeg } from 'jpeg-js';

// Derive __dirname for ESM context (tsx/Node ESM do not expose __dirname natively)
const __dirname = dirname(fileURLToPath(import.meta.url));

const API_URL = process.argv[2] || 'http://localhost:8787';
const API_KEY = process.argv[3];

if (!API_KEY) {
  console.log(`
🌱 Seed Script - Create demo data

Usage:
  npx tsx scripts/seed.ts <api_url> <admin_key>

Example:
  npx tsx scripts/seed.ts http://localhost:8787 sk_abc123...

First, start the API and create a store:
  npm run dev
  # Then in browser or curl, the first request will prompt you to set up
`);
  process.exit(1);
}

/**
 * Primary low-level API helper.
 *
 * @param path Relative endpoint path, e.g. '/v1/products'.
 * @param body Optional JSON payload for POST requests (GET if omitted).
 * @returns Parsed JSON body of the response.
 * @throws if the request fails or returns non-2xx status.
 */
async function api(path: string, body?: any) {
  const res = await fetch(`${API_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`${path}: ${err.error?.message || res.statusText}`);
  }

  return res.json();
}

/**
 * Retry wrapper around `api` for transient failures like rate limiting.
 *
 * @param path API path.
 * @param body Optional request body for POST requests.
 * @param maxRetries Maximum number of retry attempts (defaults to 5).
 * @returns Response JSON as is from `api`.
 * @throws last failure after retry exhaustion.
 */
async function apiWithRetry(path: string, body?: any, maxRetries = 5): Promise<any> {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      return await api(path, body);
    } catch (error: any) {
      const message = error.message;

      // Check if it's a rate limit error
      if (message.includes('Rate limit exceeded')) {
        // Extract wait time from message or use exponential backoff
        const match = message.match(/Try again in (\d+) seconds/);
        const waitTime = match ? parseInt(match[1]) * 1000 : Math.pow(2, attempt) * 1000;

        attempt++;
        console.log(`   ⏳ Rate limited. Waiting ${waitTime}ms before retry (attempt ${attempt}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      // For other errors, throw immediately
      throw error;
    }
  }

  throw new Error(`Max retries exceeded for ${path}`);
}

/**
 * Convert currency amounts from EUR cents to target currency cents.
 *
 * This uses integer cents and rounds to avoid floating-point pricing errors
 * in currency price conversions during seeding.
 *
 * @param cents Price in EUR cents.
 * @param rate Exchange rate multiplier to target currency.
 * @returns Rounded price in target currency cents.
 */
function convertCents(cents: number, rate: number): number {
  return Math.round(cents * rate);
}

const EUR_TO_USD = 1.14;
const EUR_TO_GBP = 0.86;

/**
 * Nearest-neighbour resize of raw RGBA pixel data.
 *
 * This is a performance-oriented downscale helper used to generate thumbnails
 * for seeded product images without external image libraries, besides WebP.
 *
 * @param src Source RGBA pixel buffer.
 * @param srcW Source width in pixels.
 * @param srcH Source height in pixels.
 * @param dstW Destination width in pixels.
 * @param dstH Destination height in pixels.
 * @returns Resized RGBA buffer.
 */
function nnsResize(
  src: Uint8ClampedArray,
  srcW: number, srcH: number,
  dstW: number, dstH: number,
): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(dstW * dstH * 4);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(Math.floor(x * xRatio), srcW - 1);
      const sy = Math.min(Math.floor(y * yRatio), srcH - 1);
      const si = (sy * srcW + sx) * 4;
      const di = (y * dstW + x) * 4;
      dst[di] = src[si]; dst[di + 1] = src[si + 1]; dst[di + 2] = src[si + 2]; dst[di + 3] = src[si + 3];
    }
  }
  return dst;
}

/**
 * Decode a PNG/JPEG image source and re-encode as a WebP data URI.
 *
 * This helper supports images in either filesystem path (./img) or base64 data
 * embedded in `seed-data` so the script remains self-contained.
 *
 * @param src Filename in ./img/ OR a data:image/...;base64,... string from imageMap.
 * @param maxSide Pixel limit: scales proportionally when any dimension exceeds this.
 * @param quality WebP quality 0-100.
 * @returns Data URI string or null when source is missing/unreadable.
 */
async function toWebpDataUri(
  src: string | null,
  maxSide: number,
  quality = 80,
): Promise<string | null> {
  if (!src) return null;

  let rawBuffer: Buffer;
  let ext: string;

  if (src.startsWith('data:')) {
    const comma = src.indexOf(',');
    const header = src.slice(0, comma);
    rawBuffer = Buffer.from(src.slice(comma + 1), 'base64');
    ext = header.includes('png') ? 'png' : 'jpg';
  } else {
    const imgPath = pathJoin(__dirname, 'img', src);
    if (!existsSync(imgPath)) return null;
    rawBuffer = readFileSync(imgPath);
    ext = src.split('.').pop()?.toLowerCase() ?? 'png';
  }

  let rgba: Uint8ClampedArray;
  let width: number;
  let height: number;

  if (ext === 'png') {
    const png = PNG.sync.read(rawBuffer);
    width = png.width;
    height = png.height;
    rgba = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.byteLength);
  } else {
    const decoded = decodeJpeg(rawBuffer, { useTArray: true });
    width = decoded.width;
    height = decoded.height;
    rgba = new Uint8ClampedArray(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength);
  }

  if (width > maxSide || height > maxSide) {
    const scale = maxSide / Math.max(width, height);
    const newW = Math.round(width * scale);
    const newH = Math.round(height * scale);
    rgba = nnsResize(rgba, width, height, newW, newH);
    width = newW;
    height = newH;
  }

  const webpBuf = await webpWasm.encode({ data: rgba, width, height } as any, { quality });
  return `data:image/webp;base64,${Buffer.from(webpBuf).toString('base64')}`;
}

/**
 * Helper for PATCH requests to the admin API.
 *
 * @param path API path.
 * @param body JSON patch body.
 * @returns Parsed JSON response.
 */
async function apiPatch(path: string, body: any): Promise<any> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`PATCH ${path}: ${(err as any).error?.message || res.statusText}`);
  }
  return res.json();
}

/**
 * Seed tax rates used by product prices.
 *
 * This function is usually safe to run repeatedly against the same database.
 * It creates both a standard rate and a reduced food rate used for certain SKUs.
 */
async function seedTaxes() {
  console.log('💰 Creating VAT rates...');
  const vatNames = JSON.stringify({
    'en-US': 'VAT',
    'fr-FR': 'TVA',
    'es-ES': 'IVA',
    'ar-SA': 'ضريبة القيمة المضافة',
    'zh-CN': '增值税',
    'he-IL': 'מע"מ',
  });

  const tax20 = await api('/v1/tax-rates', {
    display_name: vatNames,
    tax_code: 'txcd_99999999',
    rate_percentage: 20.0,
  });

  const tax5 = await api('/v1/tax-rates', {
    display_name: vatNames,
    tax_code: 'txcd_20010000', // Reduced VAT for food in France
    rate_percentage: 5.5,
  });

  return { tax20, tax5 };
}

/**
 * Seed product categories and nested subcategories.
 *
 * Returns a map of category keys to category IDs, used by product-category
 * assignments in seedProducts().
 */
async function seedCategories() {
  console.log('📁 Creating categories...');

  // Create parent category "merchandising"
  const parentCategory = await api('/v1/categories', {
    handle: 'merchandising',
    name: JSON.stringify({
      'en-US': 'Merchandising',
      'fr-FR': 'Merchandising',
      'es-ES': 'Merchandising',
      'zh-CN': '商品',
      'ar-SA': 'السلع',
      'he-IL': 'סחורה',
    }),
    description: JSON.stringify({
      'en-US': 'SCTG Merchandising products',
      'fr-FR': 'Produits de marchandisage SCTG',
      'es-ES': 'Productos de mercancía SCTG',
      'zh-CN': 'SCTG商品产品',
      'ar-SA': 'منتجات البضائع SCTG',
      'he-IL': 'מוצרי סחורה של SCTG',
    }),
  });

  // Create child categories
  const classicTeesCategory = await api('/v1/categories', {
    handle: 'classic-tees',
    name: JSON.stringify({
      'en-US': 'Classic Tees',
      'fr-FR': 'T-Shirts Classiques',
      'es-ES': 'Camisetas Clásicas',
      'zh-CN': '经典T恤',
      'ar-SA': 'تي شيرتات كلاسيكية',
      'he-IL': 'טי שירטים קלאסיים',
    }),
    description: JSON.stringify({
      'en-US': 'SCTG classic tees',
      'fr-FR': 'T-shirts classiques SCTG',
      'es-ES': 'Camisetas clásicas SCTG',
      'zh-CN': 'SCTG经典T恤',
      'ar-SA': 'تي شيرتات SCTG الكلاسيكية',
      'he-IL': 'טי שירטים קלאסיים של SCTG',
    }),
    parent_id: parentCategory.id,
  });

  const capsCategory = await api('/v1/categories', {
    handle: 'caps',
    name: JSON.stringify({
      'en-US': 'Caps',
      'fr-FR': 'Casquettes',
      'es-ES': 'Gorras',
      'zh-CN': '帽子',
      'ar-SA': 'قبعات',
      'he-IL': 'כובעים',
    }),
    description: JSON.stringify({
      'en-US': 'SCTG caps',
      'fr-FR': 'Casquettes SCTG',
      'es-ES': 'Gorras SCTG',
      'zh-CN': 'SCTG帽子',
      'ar-SA': 'قبعات SCTG',
      'he-IL': 'כובעים של SCTG',
    }),
    parent_id: parentCategory.id,
  });

  const hoodiesCategory = await api('/v1/categories', {
    handle: 'hoodies',
    name: JSON.stringify({
      'en-US': 'Hoodies',
      'fr-FR': 'Sweats à Capuche',
      'es-ES': 'Sudaderas con Capucha',
      'zh-CN': '连帽衫',
      'ar-SA': 'هوديز',
      'he-IL': 'סווטשירטים',
    }),
    description: JSON.stringify({
      'en-US': 'SCTG Hoodies',
      'fr-FR': 'Sweats à Capuche SCTG',
      'es-ES': 'Sudaderas con Capucha SCTG',
      'zh-CN': 'SCTG连帽衫',
      'ar-SA': 'هوديز SCTG',
      'he-IL': 'סווטשירטים של SCTG',
    }),
    parent_id: parentCategory.id,
  });

  const stickersCategory = await api('/v1/categories', {
    handle: 'stickers',
    name: JSON.stringify({
      'en-US': 'Stickers',
      'fr-FR': 'Autocollants',
      'es-ES': 'Pegatinas',
      'zh-CN': '贴纸',
      'ar-SA': 'ملصقات',
      'he-IL': 'מדבקות',
    }),
    description: JSON.stringify({
      'en-US': 'SCTG stickers',
      'fr-FR': 'Autocollants SCTG',
      'es-ES': 'Pegatinas SCTG',
      'zh-CN': 'SCTG贴纸',
      'ar-SA': 'ملصقات SCTG',
      'he-IL': 'מדבקות של SCTG',
    }),
    parent_id: parentCategory.id,
  });

  const bagsCarryCategory = await api('/v1/categories', {
    handle: 'bags-carry',
    name: JSON.stringify({
      'en-US': 'Bags & Carry',
      'fr-FR': 'Sacs et transport',
      'es-ES': 'Bolsas y transporte',
      'ar-SA': 'الحقائب والحمل',
      'zh-CN': '箱包与携带',
      'he-IL': 'תיקים ונשיאה',
    }),
    description: JSON.stringify({
      'en-US': 'Products designed for carrying, storage and everyday transport.',
      'fr-FR': 'Produits conçus pour le transport, le rangement et l’usage nomade au quotidien.',
      'es-ES': 'Productos diseñados para transportar, guardar y llevar a diario.',
      'ar-SA': 'منتجات مخصصة للحمل والتخزين والتنقل اليومي.',
      'zh-CN': '用于携带、收纳和日常运输的产品。',
      'he-IL': 'מוצרים המיועדים לנשיאה, אחסון והובלה יומיומית.',
    }),
    parent_id: parentCategory.id,
  });

  const drinkwareCategory = await api('/v1/categories', {
    handle: 'drinkware',
    name: JSON.stringify({
      'en-US': 'Drinkware',
      'fr-FR': 'Boissons et contenants',
      'es-ES': 'Bebida y recipientes',
      'ar-SA': 'أدوات الشرب',
      'zh-CN': '饮具',
      'he-IL': 'כלי שתייה',
    }),
    description: JSON.stringify({
      'en-US': 'Reusable beverage containers and drink-related products for daily use or gifting.',
      'fr-FR': 'Contenants réutilisables pour boissons et produits liés à la consommation au quotidien ou en cadeau.',
      'es-ES': 'Recipientes reutilizables para bebidas y productos relacionados para uso diario o regalo.',
      'ar-SA': 'حاويات قابلة لإعادة الاستخدام للمشروبات ومنتجات مرتبطة بها للاستخدام اليومي أو الهدايا.',
      'zh-CN': '适合日常使用或赠礼的可重复使用饮品容器及相关产品。',
      'he-IL': 'מכלי שתייה רב-פעמיים ומוצרים קשורים לשימוש יומיומי או כמתנה.',
    }),
    parent_id: parentCategory.id,
  });

  const accessoriesTechCategory = await api('/v1/categories', {
    handle: 'accessories-tech',
    name: JSON.stringify({
      'en-US': 'Accessories & Tech',
      'fr-FR': 'Accessoires et tech',
      'es-ES': 'Accesorios y tecnología',
      'ar-SA': 'الإكسسوارات والتقنية',
      'zh-CN': '配件与科技',
      'he-IL': 'אביזרים וטכנולוגיה',
    }),
    description: JSON.stringify({
      'en-US': 'Small promotional items, desk accessories and tech-oriented everyday products.',
      'fr-FR': 'Petits objets promotionnels, accessoires de bureau et produits tech du quotidien.',
      'es-ES': 'Pequeños artículos promocionales, accesorios de escritorio y productos tecnológicos de uso diario.',
      'ar-SA': 'منتجات ترويجية صغيرة وإكسسوارات مكتبية ومنتجات تقنية للاستخدام اليومي.',
      'zh-CN': '小型促销品、桌面配件及日常科技类产品。',
      'he-IL': 'פריטי קידום קטנים, אביזרי שולחן ומוצרים טכנולוגיים לשימוש יומיומי.',
    }),
    parent_id: parentCategory.id,
  });

  const homeLivingCategory = await api('/v1/categories', {
    handle: 'home-living',
    name: JSON.stringify({
      'en-US': 'Home & Living',
      'fr-FR': 'Maison et lifestyle',
      'es-ES': 'Hogar y estilo de vida',
      'ar-SA': 'المنزل ونمط الحياة',
      'zh-CN': '家居与生活方式',
      'he-IL': 'בית ולייף סטייל',
    }),
    description: JSON.stringify({
      'en-US': 'Comfort, decor and practical products intended for home, lounge or personal spaces.',
      'fr-FR': 'Produits de confort, de décoration et d’usage pratique pour la maison, les espaces lounge ou personnels.',
      'es-ES': 'Productos de confort, decoración y uso práctico para el hogar, zonas lounge o espacios personales.',
      'ar-SA': 'منتجات للراحة والديكور والاستخدام العملي مخصصة للمنزل أو لمساحات الاستراحة أو المساحات الشخصية.',
      'zh-CN': '适用于家居、休闲区或个人空间的舒适、装饰和实用产品。',
      'he-IL': 'מוצרי נוחות, עיצוב ושימוש פרקטי לבית, לאזורי ישיבה או למרחבים אישיים.',
    }),
    parent_id: parentCategory.id,
  });

  const eventsSignageCategory = await api('/v1/categories', {
    handle: 'events-signage',
    name: JSON.stringify({
      'en-US': 'Events & Signage',
      'fr-FR': 'Événementiel et signalétique',
      'es-ES': 'Eventos y señalética',
      'ar-SA': 'الفعاليات واللافتات',
      'zh-CN': '活动与展示标识',
      'he-IL': 'אירועים ושילוט',
    }),
    description: JSON.stringify({
      'en-US': 'Products intended for visibility, branding, trade shows, displays and promotional environments.',
      'fr-FR': 'Produits destinés à la visibilité, au branding, aux salons, à l’affichage et aux environnements promotionnels.',
      'es-ES': 'Productos destinados a visibilidad, branding, ferias, exhibición y entornos promocionales.',
      'ar-SA': 'منتجات مخصصة للظهور البصري والعلامة التجارية والمعارض والعرض والبيئات الترويجية.',
      'zh-CN': '用于提升可见性、品牌展示、展会、陈列和促销环境的产品。',
      'he-IL': 'מוצרים המיועדים לנראות, מיתוג, תערוכות, תצוגה וסביבות קידום מכירות.',
    }),
    parent_id: parentCategory.id,
  });

  const sportsOutdoorCategory = await api('/v1/categories', {
    handle: 'sports-outdoor',
    name: JSON.stringify({
      'en-US': 'Sports & Outdoor',
      'fr-FR': 'Sport et plein air',
      'es-ES': 'Deporte y aire libre',
      'ar-SA': 'الرياضة والهواء الطلق',
      'zh-CN': '运动与户外',
      'he-IL': 'ספורט וחוץ',
    }),
    description: JSON.stringify({
      'en-US': 'Products made for sport practice, outdoor activities, clubs and active lifestyles.',
      'fr-FR': 'Produits destinés à la pratique sportive, aux activités extérieures, aux clubs et aux usages actifs.',
      'es-ES': 'Productos destinados al deporte, las actividades al aire libre, los clubes y los estilos de vida activos.',
      'ar-SA': 'منتجات مخصصة لممارسة الرياضة والأنشطة الخارجية والأندية وأنماط الحياة النشطة.',
      'zh-CN': '适用于运动、户外活动、俱乐部和积极生活方式的产品。',
      'he-IL': 'מוצרים המיועדים לספורט, לפעילויות חוץ, למועדונים ולאורח חיים פעיל.',
    }),
    parent_id: parentCategory.id,
  });

  return {
    merchandising: parentCategory.id,
    classicTees: classicTeesCategory.id,
    caps: capsCategory.id,
    hoodies: hoodiesCategory.id,
    stickers: stickersCategory.id,
    bagsCarry: bagsCarryCategory.id,
    drinkware: drinkwareCategory.id,
    accessoriesTech: accessoriesTechCategory.id,
    homeLiving: homeLivingCategory.id,
    eventsSignage: eventsSignageCategory.id,
    sportsOutdoor: sportsOutdoorCategory.id,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified product catalog
// Every product — legacy apparel or additional catalog — lives here.
// To add a product: push a new entry; variants drive inventory & pricing.
//
// Each item in product catalog must include:
// - key: short lookup key used by SEED_REVIEWS and seeds
// - handle: API product handle
// - categories: array of category handles
// - variants: variant rows with sku/price_cents/stock
//
// Contributors: keeping this list in English + i18n maps encourages
// consistent localization across all languages.
// ─────────────────────────────────────────────────────────────────────────────

const PRODUCT_CATALOG = [
  // ── SCTG Branded Apparel ───────────────────────────────────────────────────
  {
    key: 'tee', file: 'tee-black.png', handle: 'classic-tee', vendor: 'SCTG',
    categories: ['classic-tees'],
    title:       { 'en-US': 'Classic Tee',          'fr-FR': 'T-Shirt Classique',       'es-ES': 'Camiseta Clásica',         'zh-CN': '经典T恤',       'ar-SA': 'تي شيرت كلاسيكي',   'he-IL': 'טי שירט קלאסי' },
    description: { 'en-US': '<p>Premium cotton t-shirt. Soft, breathable, and built to last, with our logo…</p>', 'fr-FR': '<p>T-shirt en coton premium. Doux, respirant et conçu pour durer, avec notre logo…</p>', 'es-ES': '<p>Camiseta de algodón premium. Suave, transpirable y duradera, con nuestro logo…</p>', 'zh-CN': '<p>优质棉质T恤。柔软、透气、经久耐用，印有我们的标志…</p>', 'ar-SA': '<p>تي شيرت قطني فاخر. ناعم، قابل للتنفس، ومصمم ليدوم طويلاً، مع شعارنا…</p>', 'he-IL': '<p>חולצת טי כותנה פרימיום. רכה, נושמת ובנויה להחזיק מעמד, עם הלוגו שלנו…</p>' },
    variants: [
      { sku: 'TEE-BLK-S', title: 'Black / S', price_cents: 2999, weight_g: 180, stock: 50, imageFile: 'tee-black.png' },
      { sku: 'TEE-BLK-M', title: 'Black / M', price_cents: 2999, weight_g: 200, stock: 75, imageFile: 'tee-black.png' },
      { sku: 'TEE-BLK-L', title: 'Black / L', price_cents: 2999, weight_g: 220, stock: 60, imageFile: 'tee-black.png' },
      { sku: 'TEE-WHT-S', title: 'White / S', price_cents: 2999, weight_g: 180, stock: 40, imageFile: 'tee-white.png' },
      { sku: 'TEE-WHT-M', title: 'White / M', price_cents: 2999, weight_g: 200, stock: 55, imageFile: 'tee-white.png' },
      { sku: 'TEE-WHT-L', title: 'White / L', price_cents: 2999, weight_g: 220, stock: 45, imageFile: 'tee-white.png' },
    ],
  },
  {
    key: 'hoodie', file: 'hoodie-black.png', handle: 'hoodie', vendor: 'SCTG',
    categories: ['hoodies'],
    title:       { 'en-US': 'Hoodie',             'fr-FR': 'Sweat à capuche',          'es-ES': 'Sudadera con capucha',     'zh-CN': '连帽衫',       'ar-SA': 'هودي',               'he-IL': 'סווטשירט עם כובע' },
    description: { 'en-US': '<p>Cozy pullover hoodie with large logo. Perfect for coding sessions…</p>', 'fr-FR': '<p>Sweat à capuche confortable avec grand logo. Parfait pour les sessions de codage…</p>', 'es-ES': '<p>Sudadera con capucha cómoda y gran logo. Perfecta para sesiones de programación…</p>', 'zh-CN': '<p>舒适的连帽衫，带有大标志。非常适合编码会话…</p>', 'ar-SA': '<p>سويت بالكلاو مريح مع شعار كبير. مثالية لجلسات البرمجة…</p>', 'he-IL': '<p>חולצת קפואה נוחה עם לוגו גדול. מושלמת לישיבות תכנות…</p>' },
    variants: [
      { sku: 'HOOD-BLK-M', title: 'Black / M', price_cents: 5999, weight_g: 520, stock: 30, imageFile: 'hoodie-black.png' },
      { sku: 'HOOD-BLK-L', title: 'Black / L', price_cents: 5999, weight_g: 560, stock: 25, imageFile: 'hoodie-black.png' },
      { sku: 'HOOD-GRY-M', title: 'Gray / M',  price_cents: 5999, weight_g: 520, stock: 20, imageFile: 'hoodie-white.png' },
      { sku: 'HOOD-GRY-L', title: 'Gray / L',  price_cents: 5999, weight_g: 560, stock: 15, imageFile: 'hoodie-white.png' },
    ],
  },
  {
    key: 'cap', file: 'cap-black.png', handle: 'cap', vendor: 'SCTG',
    categories: ['caps'],
    title:       { 'en-US': 'Cap',                'fr-FR': 'Casquette',                'es-ES': 'Gorra',                    'zh-CN': '棒球帽',       'ar-SA': 'قبعة',               'he-IL': 'כובע' },
    description: { 'en-US': '<p><strong>Embroidered</strong> baseball cap with logo. One size fits all heads…</p>', 'fr-FR': '<p>Casquette de baseball brodée avec logo. Une taille convient à toutes les têtes…</p>', 'es-ES': '<p>Gorra de béisbol bordada con logo. Talla única para todas las cabezas…</p>', 'zh-CN': '<p>刺绣棒球帽，带有标志。适合所有头型…</p>', 'ar-SA': '<p>قبعة بيسبول مخيطة بشعار. مقاس واحد يناسب جميع الرؤوس…</p>', 'he-IL': '<p>כובע בייסבול רקום עם לוגו. גודל אחד מתאים לכל הראש…</p>' },
    variants: [
      { sku: 'CAP-BLK', title: 'Black', price_cents: 2499, weight_g: 120, stock: 100, imageFile: 'cap-black.png' },
      { sku: 'CAP-NVY', title: 'Navy',  price_cents: 2499, weight_g: 120, stock: 80,  imageFile: 'cap-navy.png'  },
    ],
  },
  {
    key: 'sticker', file: 'stickers.png', handle: 'sticker-pack', vendor: 'SCTG',
    categories: ['stickers'],
    title:       { 'en-US': 'Sticker Pack',       'fr-FR': "Pack d'autocollants",      'es-ES': 'Paquete de pegatinas',     'zh-CN': '贴纸包',       'ar-SA': 'مجموعة ملصقات',      'he-IL': 'חבילת מדבקות' },
    description: { 'en-US': '<p>Set of 5 die-cut vinyl stickers. Beautiful, waterproof and durable…</p>', 'fr-FR': '<p>Ensemble de 5 autocollants en vinyle découpés. Beaux, imperméables et durables…</p>', 'es-ES': '<p>Set de 5 pegatinas de vinilo recortadas. Hermosas, impermeables y duraderas…</p>', 'zh-CN': '<p>5件套模切乙烯基贴纸。美观、防水且耐用…</p>', 'ar-SA': '<p>مجموعة من 5 ملصقات فينيل مقطوعة. جميلة، مقاومة للماء ومتينة…</p>', 'he-IL': '<p>סט של 5 מדבקות ויניל חתוכות. יפות, עמידות למים ועמידות…</p>' },
    variants: [
      { sku: 'STICKER-5PK', title: '5 Pack', price_cents: 999, weight_g: 30, stock: 200 },
    ],
  },

  // ── Bags & Carry ───────────────────────────────────────────────────────────
  {
    key: 'backpack', file: 'backpack.png', handle: 'backpack', vendor: 'Fufuni',
    categories: ['bags-carry'],
    title:       { 'en-US': 'Backpack',           'fr-FR': 'Sac à dos',                'es-ES': 'Mochila',                  'zh-CN': '双肩背包',     'ar-SA': 'حقيبة ظهر',          'he-IL': 'תיק גב' },
    description: { 'en-US': 'Packaged backpack with front compartment and full-color logo print, suitable for everyday carry.', 'fr-FR': "Sac à dos emballé avec compartiment avant et marquage logo en couleur, adapté à un usage quotidien.", 'es-ES': 'Mochila empaquetada con compartimento frontal e impresión del logotipo a color, adecuada para uso diario.', 'ar-SA': 'حقيبة ظهر معبأة مع جيب أمامي وطباعة شعار بالألوان الكاملة، مناسبة للاستخدام اليومي.', 'zh-CN': '带前袋和彩色标志印刷的包装双肩背包，适合日常使用。', 'he-IL': 'תיק גב ארוז עם תא קדמי והדפסת לוגו צבעונית, מתאים לשימוש יומיומי。' },
    variants: [{ sku: 'BACKPACK', title: 'Standard', price_cents: 2990, weight_g: 700, stock: 40 }],
  },
  {
    key: 'duffle-bag', file: 'large-bag.png', handle: 'duffle-bag', vendor: 'Fufuni',
    categories: ['bags-carry'],
    title:       { 'en-US': 'Duffle Bag',         'fr-FR': 'Grand sac de voyage',      'es-ES': 'Bolsa de viaje grande',    'zh-CN': '大号旅行袋',   'ar-SA': 'حقيبة سفر كبيرة',    'he-IL': 'תיק נסיעות גדול' },
    description: { 'en-US': 'Packaged duffle bag with shoulder strap, zip pockets and side logo placement.', 'fr-FR': 'Grand sac de voyage emballé avec bandoulière, poches zippées et logo sur le côté.', 'es-ES': 'Bolsa de viaje grande empaquetada con correa de hombro, bolsillos con cremallera y logotipo lateral.', 'ar-SA': 'حقيبة سفر كبيرة معبأة مع حزام كتف وجيوب بسحاب وشعار جانبي.', 'zh-CN': '带肩带、拉链口袋和侧面标志位置的包装旅行袋。', 'he-IL': 'תיק נסיעות גדול ארוז עם רצועת כתף, כיסי רוכסן ומיקום לוגו בצד。' },
    variants: [{ sku: 'LARGE_BAG', title: 'Standard', price_cents: 3990, weight_g: 900, stock: 35 }],
  },
  {
    key: 'tote-bag', file: 'tote-bag.png', handle: 'tote-bag', vendor: 'Fufuni',
    categories: ['bags-carry'],
    title:       { 'en-US': 'Tote Bag',           'fr-FR': 'Tote bag',                 'es-ES': 'Bolsa tote',               'zh-CN': '帆布手提袋',   'ar-SA': 'حقيبة قماش',         'he-IL': 'תיק טוט' },
    description: { 'en-US': 'Packaged fabric tote bag with long handles and large centered logo print.', 'fr-FR': 'Tote bag en tissu emballé avec longues anses et grand logo centré.', 'es-ES': 'Bolsa tote de tela empaquetada con asas largas y gran logotipo centrado.', 'ar-SA': 'حقيبة قماش معبأة بمقابض طويلة وشعار كبير في المنتصف.', 'zh-CN': '带长提手和中央大幅标志印刷的包装布质手提袋。', 'he-IL': 'תיק טוט מבד ארוז עם ידיות ארוכות ולוגו גדול במרכז。' },
    variants: [{ sku: 'TOTE_BAG', title: 'Standard', price_cents: 1290, weight_g: 140, stock: 50 }],
  },
  {
    key: 'golf-bag', file: 'golf-bag.png', handle: 'golf-bag', vendor: 'Fufuni',
    categories: ['bags-carry', 'sports-outdoor'],
    title:       { 'en-US': 'Golf Bag',           'fr-FR': 'Sac de golf',              'es-ES': 'Bolsa de golf',            'zh-CN': '高尔夫球包',   'ar-SA': 'حقيبة غولف',         'he-IL': 'תיק גולף' },
    description: { 'en-US': 'Packaged golf bag with club compartments and logo panel, intended for full-course transport.', 'fr-FR': 'Sac de golf emballé avec compartiments pour clubs et panneau logo, destiné au transport sur parcours.', 'es-ES': 'Bolsa de golf empaquetada con compartimentos para palos y panel con logotipo, destinada al transporte en el campo.', 'ar-SA': 'حقيبة غولف معبأة مع أقسام للمضارب ولوحة شعار، مخصصة للنقل في الملعب.', 'zh-CN': '带球杆分仓和标志面板的包装高尔夫球包，适合全场携带。', 'he-IL': 'תיק גולף ארוז עם תאים למקלות ופאנל לוגו, מיועד לנשיאה במגרש。' },
    variants: [{ sku: 'GOLF_BAG', title: 'Standard', price_cents: 14900, weight_g: 3500, stock: 10 }],
  },

  // ── Drinkware ──────────────────────────────────────────────────────────────
  {
    key: 'aluminium-bottle', file: 'bottle-aluminium.png', handle: 'aluminium-bottle', vendor: 'Fufuni',
    categories: ['drinkware', 'sports-outdoor'],
    title:       { 'en-US': 'Aluminium Bottle',   'fr-FR': 'Gourde aluminium',         'es-ES': 'Botella de aluminio',      'zh-CN': '铝制水壶',     'ar-SA': 'قارورة ألمنيوم',      'he-IL': 'בקבוק אלומיניום' },
    description: { 'en-US': 'Packaged aluminium bottle with screw cap or sports top and front logo print.', 'fr-FR': 'Gourde aluminium emballée avec bouchon vissé ou sport et logo imprimé en face avant.', 'es-ES': 'Botella de aluminio empaquetada con tapón de rosca o deportivo y logotipo impreso en la parte frontal.', 'ar-SA': 'قارورة ألمنيوم معبأة بغطاء لولبي أو رياضي مع شعار مطبوع في الواجهة الأمامية.', 'zh-CN': '带螺旋盖或运动盖并正面印有标志的包装铝制水壶。', 'he-IL': 'בקבוק אלומיניום ארוז עם פקק הברגה או ספורט ולוגו מודפס בחזית。' },
    variants: [{ sku: 'BOTTLE_ALUMINIUM', title: 'Standard', price_cents: 1990, weight_g: 320, stock: 60 }],
  },
  {
    key: 'ceramic-mug', file: 'mug.png', handle: 'ceramic-mug', vendor: 'Fufuni',
    categories: ['drinkware', 'home-living'],
    title:       { 'en-US': 'Ceramic Mug',        'fr-FR': 'Mug en céramique',         'es-ES': 'Taza de cerámica',         'zh-CN': '陶瓷马克杯',   'ar-SA': 'كوب سيراميك',        'he-IL': 'ספל קרמי' },
    description: { 'en-US': 'Packaged ceramic mug with printed front logo, suitable for office or home beverage use.', 'fr-FR': "Mug en céramique emballé avec logo imprimé en face avant, adapté à un usage bureau ou maison.", 'es-ES': 'Taza de cerámica empaquetada con logotipo impreso en la parte frontal, adecuada para oficina o hogar.', 'ar-SA': 'كوب سيراميك معبأ مع شعار مطبوع في الواجهة الأمامية، مناسب للمكتب أو المنزل.', 'zh-CN': '带正面标志印刷的包装陶瓷马克杯，适合办公室或家用。', 'he-IL': 'ספל קרמי ארוז עם לוגו מודפס בחזית, מתאים למשרד או לבית。' },
    variants: [{ sku: 'MUG', title: 'Standard', price_cents: 1290, weight_g: 380, stock: 60 }],
  },

  // ── Accessories & Tech ─────────────────────────────────────────────────────
  {
    key: 'iphone-case', file: 'iphone-case.png', handle: 'iphone-17-case', vendor: 'Fufuni',
    categories: ['accessories-tech'],
    title:       { 'en-US': 'iPhone 17 Case',     'fr-FR': 'Coque iPhone 17',          'es-ES': 'Funda para iPhone 17',     'zh-CN': 'iPhone 17 手机壳', 'ar-SA': 'غطاء iPhone 17',  'he-IL': 'כיסוי iPhone 17' },
    description: { 'en-US': 'Packaged protective case for iPhone 17 with centered logo print and slim everyday profile.', 'fr-FR': 'Coque de protection emballée pour iPhone 17 avec logo centré et profil fin pour un usage quotidien.', 'es-ES': 'Funda protectora empaquetada para iPhone 17 con logotipo centrado y perfil fino para uso diario.', 'ar-SA': 'غطاء حماية معبأ لهاتف iPhone 17 مع شعار في الوسط وتصميم نحيف للاستخدام اليومي.', 'zh-CN': '适用于 iPhone 17 的包装保护壳，中央带标志印刷，日常使用轻薄。', 'he-IL': 'כיסוי מגן ארוז ל‑iPhone 17 עם לוגו ממורכז ופרופיל דק לשימוש יומיומי。' },
    variants: [{ sku: 'IPHONE_CASE', title: 'Standard', price_cents: 2490, weight_g: 55, stock: 80 }],
  },
  {
    key: 'acrylic-keychain', file: 'key-holder.png', handle: 'acrylic-keychain', vendor: 'Fufuni',
    categories: ['accessories-tech'],
    title:       { 'en-US': 'Acrylic Keychain',   'fr-FR': 'Porte-clés acrylique',     'es-ES': 'Llavero acrílico',         'zh-CN': '亚克力钥匙扣', 'ar-SA': 'سلسلة مفاتيح أكريليك', 'he-IL': 'מחזיק מפתחות אקרילי' },
    description: { 'en-US': 'Packaged acrylic keychain with metal ring and full-color insert featuring the product logo.', 'fr-FR': 'Porte-clés acrylique emballé avec anneau métallique et insert couleur au logo du produit.', 'es-ES': 'Llavero acrílico empaquetado con anilla metálica e inserto a color con el logotipo del producto.', 'ar-SA': 'سلسلة مفاتيح أكريليك معبأة مع حلقة معدنية وإدخال ملون يحمل شعار المنتج.', 'zh-CN': '带金属环和彩色内芯标志图案的包装亚克力钥匙扣。', 'he-IL': 'מחזיק מפתחות אקרילי ארוז עם טבעת מתכת והדפסה צבעונית של הלוגו。' },
    variants: [{ sku: 'KEY_HOLDER', title: 'Standard', price_cents: 690, weight_g: 35, stock: 120 }],
  },
  {
    key: 'lux-pen', file: 'lux-pen.png', handle: 'luxury-metal-pen', vendor: 'Fufuni',
    categories: ['accessories-tech'],
    title:       { 'en-US': 'Luxury Metal Pen',   'fr-FR': 'Stylo métal premium',      'es-ES': 'Bolígrafo metálico premium', 'zh-CN': '高端金属笔', 'ar-SA': 'قلم معدني فاخر',      'he-IL': 'עט מתכת יוקרתי' },
    description: { 'en-US': 'Packaged premium metal pen with glossy finish and discreet logo branding.', 'fr-FR': 'Stylo métal premium emballé avec finition brillante et marquage logo discret.', 'es-ES': 'Bolígrafo metálico premium empaquetado con acabado brillante y marcado de logotipo discreto.', 'ar-SA': 'قلم معدني فاخر معبأ بلمسة لامعة وعلامة شعار أنيقة.', 'zh-CN': '带亮面处理和低调标志的包装高端金属笔。', 'he-IL': 'עט מתכת יוקרתי ארוז עם גימור מבריק ומיתוג לוגו עדין。' },
    variants: [{ sku: 'LUX_PEN', title: 'Standard', price_cents: 1490, weight_g: 80, stock: 100 }],
  },
  {
    key: 'mouse-pad', file: 'mouse-pad.png', handle: 'mouse-pad', vendor: 'Fufuni',
    categories: ['accessories-tech'],
    title:       { 'en-US': 'Mouse Pad',          'fr-FR': 'Tapis de souris',          'es-ES': 'Alfombrilla de ratón',     'zh-CN': '鼠标垫',       'ar-SA': 'لوحة فأرة',          'he-IL': 'משטח עכבר' },
    description: { 'en-US': 'Packaged mouse pad with smooth top surface and centered full-color logo print.', 'fr-FR': 'Tapis de souris emballé avec surface supérieure lisse et logo couleur centré.', 'es-ES': 'Alfombrilla de ratón empaquetada con superficie lisa y logotipo a color centrado.', 'ar-SA': 'لوحة فأرة معبأة بسطح علوي أملس وشعار ملون في المنتصف.', 'zh-CN': '带顺滑表面和中央彩色标志印刷的包装鼠标垫。', 'he-IL': 'משטח עכבר ארוז עם משטח עליון חלק ולוגו צבעוני במרכז。' },
    variants: [{ sku: 'MOUSE_PAD', title: 'Standard', price_cents: 1290, weight_g: 140, stock: 75 }],
  },
  {
    key: 'pen-4-colors', file: 'pen-4-colors.png', handle: 'pen-4-colors', vendor: 'Fufuni',
    categories: ['accessories-tech'],
    title:       { 'en-US': '4-Color Pen',        'fr-FR': 'Stylo 4 couleurs',         'es-ES': 'Bolígrafo de 4 colores',   'zh-CN': '四色圆珠笔',   'ar-SA': 'قلم بأربعة ألوان',    'he-IL': 'עט 4 צבעים' },
    description: { 'en-US': 'Packaged multi-ink pen with four writing colors and compact logo print area.', 'fr-FR': 'Stylo multi-encre emballé avec quatre couleurs d\'écriture et zone de logo compacte.', 'es-ES': 'Bolígrafo multitinta empaquetado con cuatro colores de escritura y zona compacta para logotipo.', 'ar-SA': 'قلم متعدد الأحبار معبأ بأربعة ألوان كتابة ومساحة مدمجة للشعار.', 'zh-CN': '带四种书写颜色和紧凑标志印刷区的包装多色圆珠笔。', 'he-IL': 'עט רב-דיו ארוז עם ארבעה צבעי כתיבה ואזור לוגו קומפקטי。' },
    variants: [{ sku: 'PEN_4_COLORS', title: 'Standard', price_cents: 490, weight_g: 35, stock: 150 }],
  },
  {
    key: 'badge-pins', file: 'pins.png', handle: 'badge-pins-set', vendor: 'Fufuni',
    categories: ['accessories-tech', 'events-signage'],
    title:       { 'en-US': 'Badge Pins Set',     'fr-FR': 'Lot de badges',            'es-ES': 'Lote de badges',           'zh-CN': '徽章套装',     'ar-SA': 'مجموعة شارات',       'he-IL': 'סט סיכות תג' },
    description: { 'en-US': 'Packaged set of round badge pins with logo artwork for events, giveaways and accessories.', 'fr-FR': 'Lot emballé de badges ronds avec visuel logo pour événements, giveaways et accessoires.', 'es-ES': 'Lote empaquetado de chapas redondas con arte del logotipo para eventos, regalos y accesorios.', 'ar-SA': 'مجموعة معبأة من الشارات الدائرية برسومات الشعار للفعاليات والهدايا والإكسسوارات.', 'zh-CN': '带标志图案的圆形徽章套装包装，适用于活动、赠品和配饰。', 'he-IL': 'סט ארוז של סיכות תג עגולות עם גרפיקת לוגו לאירועים, מתנות ואביזרים。' },
    variants: [{ sku: 'PINS', title: 'Standard', price_cents: 990, weight_g: 40, stock: 100 }],
  },
  {
    key: 'usb-key', file: 'usb-key.png', handle: 'usb-flash-drive', vendor: 'Fufuni',
    categories: ['accessories-tech'],
    title:       { 'en-US': 'USB Flash Drive',    'fr-FR': 'Clé USB',                  'es-ES': 'Memoria USB',              'zh-CN': 'U盘',          'ar-SA': 'ذاكرة USB',           'he-IL': 'דיסק און קי' },
    description: { 'en-US': 'Packaged USB flash drive with logo print, suitable for data transfer or promotional bundles.', 'fr-FR': 'Clé USB emballée avec logo imprimé, adaptée au transfert de données ou aux bundles promotionnels.', 'es-ES': 'Memoria USB empaquetada con logotipo impreso, adecuada para transferencia de datos o packs promocionales.', 'ar-SA': 'ذاكرة USB معبأة مع شعار مطبوع، مناسبة لنقل البيانات أو الباقات الترويجية.', 'zh-CN': '带标志印刷的包装U盘，适合数据传输或促销套装。', 'he-IL': 'דיסק און קי ארוז עם לוגו מודפס, מתאים להעברת נתונים או למארזים שיווקיים。' },
    variants: [{ sku: 'USB_KEY', title: 'Standard', price_cents: 990, weight_g: 25, stock: 120 }],
  },

  // ── Home & Living ──────────────────────────────────────────────────────────
  {
    key: 'beach-towel', file: 'beach-towel.png', handle: 'beach-towel', vendor: 'Fufuni',
    categories: ['home-living', 'sports-outdoor'],
    title:       { 'en-US': 'Beach Towel',        'fr-FR': 'Serviette de plage',       'es-ES': 'Toalla de playa',          'zh-CN': '沙滩巾',       'ar-SA': 'منشفة شاطئ',         'he-IL': 'מגבת חוף' },
    description: { 'en-US': 'Folded beach towel in retail packaging with large central logo print for leisure and travel use.', 'fr-FR': "Serviette de plage pliée en emballage retail avec grand logo centré, idéale pour les loisirs et le voyage.", 'es-ES': 'Toalla de playa plegada en embalaje retail con gran logotipo centrado, ideal para ocio y viaje.', 'ar-SA': 'منشفة شاطئ مطوية في عبوة بيع مع شعار كبير في الوسط، مناسبة للترفيه والسفر.', 'zh-CN': '零售包装折叠沙滩巾，中央大幅标志印刷，适合休闲与旅行。', 'he-IL': 'מגבת חוף מקופלת באריזת קמעונאות עם לוגו גדול במרכז, מתאימה לפנאי ולטיולים。' },
    variants: [{ sku: 'BEACH_TOWEL', title: 'Standard', price_cents: 2490, weight_g: 650, stock: 50 }],
  },
  {
    key: 'bean-bag', file: 'beanbag.png', handle: 'bean-bag', vendor: 'Fufuni',
    categories: ['home-living'],
    title:       { 'en-US': 'Bean Bag',           'fr-FR': 'Pouf poire',               'es-ES': 'Puf tipo pera',            'zh-CN': '懒人沙发',     'ar-SA': 'بين باغ',             'he-IL': 'פוף' },
    description: { 'en-US': 'Packaged bean bag seat with printed upper panel, intended for indoor lounge and event spaces.', 'fr-FR': 'Pouf emballé avec panneau supérieur imprimé, destiné aux espaces lounge et événementiels.', 'es-ES': 'Puf empaquetado con panel superior impreso, destinado a zonas lounge y eventos.', 'ar-SA': 'مقعد بين باغ معبأ مع لوحة علوية مطبوعة، مناسب لمساحات الاستراحة والفعاليات.', 'zh-CN': '带印花上表面的包装懒人沙发，适用于室内休闲和活动空间。', 'he-IL': 'פוף ארוז עם חלק עליון מודפס, מיועד לחללי ישיבה ואירועים。' },
    variants: [{ sku: 'BEANBAG', title: 'Standard', price_cents: 7900, weight_g: 3500, stock: 10 }],
  },
  {
    key: 'coir-doormat', file: 'entry-carpet-hard.png', handle: 'coir-doormat', vendor: 'Fufuni',
    categories: ['events-signage', 'home-living'],
    title:       { 'en-US': 'Coir Doormat',       'fr-FR': 'Paillasson coco',          'es-ES': 'Felpudo de coco',          'zh-CN': '椰棕门垫',     'ar-SA': 'ممسحة باب من ألياف جوز الهند', 'he-IL': 'שטיח כניסה קוקוס' },
    description: { 'en-US': 'Packaged coir doormat with printed center area, made for durable entryway use.', 'fr-FR': 'Paillasson coco emballé avec zone centrale imprimée, conçu pour un usage d\'entrée durable.', 'es-ES': 'Felpudo de coco empaquetado con zona central impresa, pensado para un uso duradero en la entrada.', 'ar-SA': 'ممسحة باب من ألياف جوز الهند معبأة مع منطقة مركزية مطبوعة، مصممة للاستخدام المتين عند المدخل.', 'zh-CN': '带中央印刷区域的包装椰棕门垫，适合耐用型入口使用。', 'he-IL': 'שטיח כניסה מקוקוס ארוז עם אזור מרכזי מודפס, מיועד לשימוש עמיד בפתח הבית。' },
    variants: [{ sku: 'ENTRY_CARPET_HARD', title: 'Standard', price_cents: 2490, weight_g: 2600, stock: 15 }],
  },
  {
    key: 'entry-mat', file: 'entry-carpet.png', handle: 'entry-mat', vendor: 'Fufuni',
    categories: ['events-signage', 'home-living'],
    title:       { 'en-US': 'Entry Mat',          'fr-FR': "Tapis d'entrée",           'es-ES': 'Alfombra de entrada',      'zh-CN': '入门地垫',     'ar-SA': 'سجادة مدخل',         'he-IL': 'שטיח כניסה' },
    description: { 'en-US': 'Packaged entry mat with printed logo area and non-slip backing for indoor or covered entry use.', 'fr-FR': 'Tapis d\'entrée emballé avec zone logo imprimée et sous-couche antidérapante pour usage intérieur ou abrité.', 'es-ES': 'Alfombra de entrada empaquetada con zona de logotipo impresa y base antideslizante para interior o zonas cubiertas.', 'ar-SA': 'سجادة مدخل معبأة مع مساحة شعار مطبوعة وظهر مانع للانزلاق للاستخدام الداخلي أو في الأماكن المغطاة.', 'zh-CN': '带印刷标志区域和防滑底面的包装入门地垫，适用于室内或遮蔽入口。', 'he-IL': 'שטיח כניסה ארוז עם אזור לוגו מודפס ותחתית מונעת החלקה לשימוש פנימי או בכניסה מקורה。' },
    variants: [{ sku: 'ENTRY_CARPET', title: 'Standard', price_cents: 2990, weight_g: 1900, stock: 15 }],
  },

  // ── Events & Signage ───────────────────────────────────────────────────────
  {
    key: 'beach-flag', file: 'beachflag.png', handle: 'beach-flag', vendor: 'Fufuni',
    categories: ['events-signage', 'sports-outdoor'],
    title:       { 'en-US': 'Beach Flag',         'fr-FR': 'Drapeau publicitaire plume', 'es-ES': 'Bandera publicitaria tipo pluma', 'zh-CN': '沙滩旗', 'ar-SA': 'علم شاطئي إعلاني', 'he-IL': 'דגל חוף פרסומי' },
    description: { 'en-US': 'Packaged feather beach flag with pole set and printed textile, designed for outdoor promotion.', 'fr-FR': 'Drapeau plume emballé avec mât et textile imprimé, conçu pour la communication extérieure.', 'es-ES': 'Bandera pluma empaquetada con mástil y textil impreso, diseñada para promoción exterior.', 'ar-SA': 'علم شاطئي من نوع الريشة معبأ مع عمود ونسيج مطبوع، مخصص للدعاية الخارجية.', 'zh-CN': '含旗杆组件和印花旗面的包装沙滩旗，适用于户外宣传。', 'he-IL': 'דגל חוף מסוג נוצה ארוז עם מוט ובד מודפס, מיועד לפרסום חוץ。' },
    variants: [{ sku: 'BEACHFLAG', title: 'Standard', price_cents: 8900, weight_g: 3200, stock: 15 }],
  },
  {
    key: 'flag', file: 'flag.png', handle: 'flag', vendor: 'Fufuni',
    categories: ['events-signage'],
    title:       { 'en-US': 'Flag',               'fr-FR': 'Drapeau',                  'es-ES': 'Bandera',                  'zh-CN': '旗帜',         'ar-SA': 'علم',                 'he-IL': 'דגל' },
    description: { 'en-US': 'Packaged printed flag for indoor or outdoor display, folded for compact shipping.', 'fr-FR': 'Drapeau imprimé emballé pour affichage intérieur ou extérieur, plié pour un transport compact.', 'es-ES': 'Bandera impresa empaquetada para exhibición interior o exterior, plegada para un envío compacto.', 'ar-SA': 'علم مطبوع معبأ للعرض الداخلي أو الخارجي، مطوي لشحن مدمج.', 'zh-CN': '适用于室内或室外展示的包装印刷旗帜，折叠后便于运输。', 'he-IL': 'דגל מודפס ארוז לתצוגה פנימית או חיצונית, מקופל למשלוח קומפקטי。' },
    variants: [{ sku: 'FLAG', title: 'Standard', price_cents: 1490, weight_g: 180, stock: 50 }],
  },
  {
    key: 'totem', file: 'totem.png', handle: 'roll-up-banner', vendor: 'Fufuni',
    categories: ['events-signage'],
    title:       { 'en-US': 'Roll-up Banner',     'fr-FR': 'Kakemono roll-up',         'es-ES': 'Roll-up publicitario',     'zh-CN': '易拉宝展架',   'ar-SA': 'حامل رول أب إعلاني', 'he-IL': 'רול-אפ פרסומי' },
    description: { 'en-US': 'Packaged roll-up banner stand with printed graphic panel for trade shows and retail display.', 'fr-FR': 'Kakemono roll-up emballé avec visuel imprimé pour salons, événements et présentation retail.', 'es-ES': 'Roll-up publicitario empaquetado con panel gráfico impreso para ferias y exposición retail.', 'ar-SA': 'حامل رول أب إعلاني معبأ مع لوحة مطبوعة للمعارض والعرض داخل المتاجر.', 'zh-CN': '带印刷画面的包装易拉宝展架，适用于展会和零售展示。', 'he-IL': 'רול-אפ פרסומי ארוז עם גרפיקה מודפסת לתערוכות ולתצוגה בחנות。' },
    variants: [{ sku: 'TOTEM', title: 'Standard', price_cents: 9900, weight_g: 3200, stock: 10 }],
  },
  {
    key: 'paragliding-windsock', file: 'paragliding-windsock.png', handle: 'paragliding-windsock', vendor: 'Fufuni',
    categories: ['events-signage', 'sports-outdoor'],
    title:       { 'en-US': 'Paragliding Windsock', 'fr-FR': 'Manche à air de parapente', 'es-ES': 'Manga de viento para parapente', 'zh-CN': '滑翔伞风向袋', 'ar-SA': 'كيس رياح للطيران الشراعي', 'he-IL': 'שרוול רוח לרחיפה' },
    description: { 'en-US': 'Packaged paragliding windsock for wind direction indication on launch or landing areas.', 'fr-FR': "Manche à air de parapente emballée pour l'indication du vent sur zone de décollage ou d'atterrissage.", 'es-ES': 'Manga de viento para parapente empaquetada para indicar la dirección del viento en despegue o aterrizaje.', 'ar-SA': 'كيس رياح للطيران الشراعي معبأ لبيان اتجاه الرياح في مناطق الإقلاع أو الهبوط.', 'zh-CN': '用于起飞或降落区域风向指示的包装滑翔伞风向袋。', 'he-IL': 'שרוול רוח לרחיפה ארוז לציון כיוון הרוח באזורי המראה או נחיתה。' },
    variants: [{ sku: 'PARAGLIDING_WINDSOCK', title: 'Standard', price_cents: 3990, weight_g: 250, stock: 20 }],
  },

  // ── Sports & Outdoor ───────────────────────────────────────────────────────
  {
    key: 'golf-ball-x1', file: 'golf-ball-x1.png', handle: 'golf-ball-x1', vendor: 'Fufuni',
    categories: ['sports-outdoor'],
    title:       { 'en-US': 'Golf Ball',          'fr-FR': 'Balle de golf',            'es-ES': 'Pelota de golf',           'zh-CN': '高尔夫球',     'ar-SA': 'كرة غولف',            'he-IL': 'כדור גולף' },
    description: { 'en-US': 'Single packaged golf ball with printed logo, suitable for play or promotional gifting.', 'fr-FR': 'Balle de golf emballée à l\'unité avec logo imprimé, adaptée au jeu ou au cadeau promotionnel.', 'es-ES': 'Pelota de golf empaquetada individualmente con logotipo impreso, apta para juego o regalo promocional.', 'ar-SA': 'كرة غولف معبأة بشكل فردي مع شعار مطبوع، مناسبة للعب أو للهدايا الترويجية.', 'zh-CN': '单颗包装高尔夫球，带印刷标志，适合打球或促销赠品。', 'he-IL': 'כדור גולף ארוז בנפרד עם לוגו מודפס, מתאים למשחק או כמתנה שיווקית。' },
    variants: [{ sku: 'GOLF_BALL_X1', title: 'Standard', price_cents: 490, weight_g: 52, stock: 150 }],
  },
  {
    key: 'golf-balls-x12-box', file: 'golf-balls-x12-box.png', handle: 'golf-balls-x12-box', vendor: 'Fufuni',
    categories: ['sports-outdoor'],
    title:       { 'en-US': 'Box of 12 Golf Balls', 'fr-FR': 'Boîte de 12 balles de golf', 'es-ES': 'Caja de 12 pelotas de golf', 'zh-CN': '12只装高尔夫球盒', 'ar-SA': 'علبة 12 كرة غولف', 'he-IL': 'קופסת 12 כדורי גולף' },
    description: { 'en-US': 'Retail box of twelve logo-printed golf balls, packaged for sale or premium events.', 'fr-FR': 'Boîte retail de douze balles de golf imprimées au logo, emballée pour la vente ou les événements premium.', 'es-ES': 'Caja retail de doce pelotas de golf con logotipo impreso, empaquetada para venta o eventos premium.', 'ar-SA': 'علبة بيع تحتوي على اثنتي عشرة كرة غولف مطبوعة بالشعار، مناسبة للبيع أو للفعاليات المميزة.', 'zh-CN': '零售盒装十二只印有标志的高尔夫球，适合销售或高端活动。', 'he-IL': 'קופסת קמעונאות עם שנים-עשר כדורי גולף מודפסי לוגו, מתאימה למכירה או לאירועי פרימיום。' },
    variants: [{ sku: 'GOLF_BALLS_X12_BOX', title: 'Standard', price_cents: 3990, weight_g: 700, stock: 30 }],
  },
  {
    key: 'golf-club-protectors', file: 'golf-club-protectors-3-set.png', handle: 'golf-club-protectors-3-set', vendor: 'Fufuni',
    categories: ['sports-outdoor'],
    title:       { 'en-US': 'Set of 3 Golf Club Headcovers', 'fr-FR': 'Jeu de 3 protège-têtes de clubs de golf', 'es-ES': 'Set de 3 protectores para palos de golf', 'zh-CN': '3件套高尔夫球杆头套', 'ar-SA': 'مجموعة من 3 أغطية رؤوس مضارب الغولف', 'he-IL': 'סט 3 כיסויי ראש למקלות גולף' },
    description: { 'en-US': 'Packaged set of three padded golf club headcovers with logo print for driver and woods protection.', 'fr-FR': 'Jeu emballé de trois protège-têtes rembourrés pour clubs de golf avec logo imprimé, pour driver et bois.', 'es-ES': 'Set empaquetado de tres fundas acolchadas para palos de golf con logotipo impreso, para driver y maderas.', 'ar-SA': 'مجموعة معبأة من ثلاثة أغطية مبطنة لرؤوس مضارب الغولف مع شعار مطبوع، لحماية الدرايفر والأخشاب.', 'zh-CN': '三件套包装高尔夫球杆头套，带标志印刷，用于一号木和球道木保护。', 'he-IL': 'סט ארוז של שלושה כיסויי ראש מרופדים למקלות גולף עם לוגו מודפס, להגנת דרייבר ועצים。' },
    variants: [{ sku: 'GOLF_CLUB_PROTECTORS_3_SET', title: 'Standard', price_cents: 2490, weight_g: 450, stock: 25 }],
  },
  {
    key: 'golf-tees', file: 'golf-tees.png', handle: 'golf-tees', vendor: 'Fufuni',
    categories: ['sports-outdoor'],
    title:       { 'en-US': 'Pack of Golf Tees',  'fr-FR': 'Sachet de tees de golf',   'es-ES': 'Bolsa de tees de golf',    'zh-CN': '高尔夫球钉套装', 'ar-SA': 'عبوة تيز غولف',     'he-IL': 'חבילת טיז לגולף' },
    description: { 'en-US': 'Packaged golf tees in a transparent bag, intended for promotional resale or course accessories.', 'fr-FR': 'Tees de golf emballés en sachet transparent, destinés à la revente promotionnelle ou aux accessoires de parcours.', 'es-ES': 'Tees de golf empaquetados en bolsa transparente, destinados a reventa promocional o accesorios de campo.', 'ar-SA': 'تيز غولف معبأة في كيس شفاف، مناسبة للبيع الترويجي أو كملحقات للملاعب.', 'zh-CN': '透明袋包装高尔夫球钉，适合促销零售或球场配件。', 'he-IL': 'טיז לגולף ארוזים בשקית שקופה, מתאימים למכירה שיווקית או כאביזרי מגרש。' },
    variants: [{ sku: 'GOLF_TEES', title: 'Standard', price_cents: 890, weight_g: 120, stock: 150 }],
  },
  {
    key: 'golf-umbrella', file: 'golf-umbrella.png', handle: 'golf-umbrella', vendor: 'Fufuni',
    categories: ['sports-outdoor'],
    title:       { 'en-US': 'Golf Umbrella',      'fr-FR': 'Parapluie de golf',        'es-ES': 'Paraguas de golf',         'zh-CN': '高尔夫伞',     'ar-SA': 'مظلة غولف',          'he-IL': 'מטריית גולף' },
    description: { 'en-US': 'Packaged oversized golf umbrella with alternating panels and large printed logo section.', 'fr-FR': 'Parapluie de golf oversize emballé avec panneaux alternés et grande zone logo imprimée.', 'es-ES': 'Paraguas de golf de gran tamaño empaquetado con paneles alternos y gran zona de logotipo impresa.', 'ar-SA': 'مظلة غولف كبيرة معبأة بألواح متناوبة ومساحة شعار مطبوعة كبيرة.', 'zh-CN': '超大号包装高尔夫伞，带拼色伞面和大面积标志印刷区域。', 'he-IL': 'מטריית גולף גדולה ארוזה עם פאנלים מתחלפים ואזור לוגו מודפס גדול。' },
    variants: [{ sku: 'GOLF_UMBRELLA', title: 'Standard', price_cents: 3990, weight_g: 850, stock: 25 }],
  },
  {
    key: 'tennis-protector', file: 'tennis-protector.png', handle: 'tennis-racket-cover', vendor: 'Fufuni',
    categories: ['sports-outdoor'],
    title:       { 'en-US': 'Tennis Racket Cover', 'fr-FR': 'Housse de raquette de tennis', 'es-ES': 'Funda para raqueta de tenis', 'zh-CN': '网球拍套', 'ar-SA': 'غطاء مضرب تنس', 'he-IL': 'כיסוי למחבט טניס' },
    description: { 'en-US': 'Packaged tennis racket cover with zipper closure and centered logo placement.', 'fr-FR': 'Housse de raquette de tennis emballée avec fermeture zippée et logo centré.', 'es-ES': 'Funda para raqueta de tenis empaquetada con cierre de cremallera y logotipo centrado.', 'ar-SA': 'غطاء مضرب تنس معبأ بسحاب وإظهار للشعار في الوسط.', 'zh-CN': '带拉链封口和中央标志位置的包装网球拍套。', 'he-IL': 'כיסוי למחבט טניס ארוז עם רוכסן ומיקום לוגו ממורכז。' },
    variants: [{ sku: 'TENNIS_PROTECTOR', title: 'Standard', price_cents: 1490, weight_g: 220, stock: 30 }],
  },
  {
    key: 'paraglider', file: 'paraglider.png', handle: 'paraglider-wing', vendor: 'Fufuni',
    categories: ['sports-outdoor'],
    title:       { 'en-US': 'Paraglider Wing EN-D',    'fr-FR': 'Voile de parapente EN-D',       'es-ES': 'Ala de parapente EN-D',         'zh-CN': '滑翔伞翼 EN-D',     'ar-SA': 'EN-D جناح طيران شراعي',    'he-IL': 'כנף מצנח רחיפה EN-D' },
    description: { 'en-US': 'Packed paraglider wing with branded canopy panel, delivered folded in transport configuration.', 'fr-FR': 'Voile de parapente emballée avec panneau de voile cousu, livrée pliée en configuration de transport.', 'es-ES': 'Ala de parapente embalada con panel de vela personalizado, entregada plegada para transporte.', 'ar-SA': 'جناح طيران شراعي معبأ مع جزء قماش يحمل العلامة، يُسلم مطوياً بوضعية النقل.', 'zh-CN': '带品牌伞翼面板的打包滑翔伞翼，折叠后按运输状态交付。', 'he-IL': 'כנף מצנח רחיפה ארוזה עם פאנל ממותג, מסופקת מקופלת לתצורת הובלה。' },
    variants: [{ sku: 'PARAGLIDER-XS', title: 'PTV 40-60', price_cents: 329000, weight_g: 3200, stock: 1 },{ sku: 'PARAGLIDER-S', title: 'PTV 60-80', price_cents: 399000, weight_g: 3300, stock: 0 },{ sku: 'PARAGLIDER-M', title: 'PTV 80-100', price_cents: 499000, weight_g: 3400, stock: 2 },{ sku: 'PARAGLIDER-L', title: 'PTV 100-120', price_cents: 399000, weight_g: 3500, stock: 1 } ,{ sku: 'PARAGLIDER-BI', title: 'Tandem 90-220', price_cents: 699000, weight_g: 5500, stock: 5 }],
  },
] as const;

type Product = typeof PRODUCT_CATALOG[number];

/**
 * Seed regions, warehouses, and shipping rates.
 *
 * This function depends on the regions and countries list being available in
 * the database and performs a full multi-zone setup:
 * - Europe (EUR)
 * - United Kingdom (GBP)
 * - North America (USD)
 * - Rest of World (EUR)
 *
 * The result includes IDs required by other seeding steps.
 */
async function seedRegions() {
  console.log('📋 Fetching existing currencies and countries...');

  // Fetch existing currencies
  const { items: currencies } = await api('/v1/regions/currencies');
  const currencyMap: Record<string, string> = {};
  for (const curr of currencies) {
    currencyMap[curr.code] = curr.id;
  }

  // Fetch all countries in one batch request (no pagination)
  const countriesResponse = await api('/v1/regions/countries/batch');
  const countryMap: Record<string, string> = {};

  for (const country of countriesResponse.items) {
    countryMap[country.code] = country.id;
  }

  // Debug: verify we have countries
  if (Object.keys(countryMap).length === 0) {
    console.error('❌ No countries found! Make sure to run init.ts first.');
    process.exit(1);
  }

  console.log(`   Found ${Object.keys(countryMap).length} countries in database`);

  // Log sample countries
  const sampleCodes = ['FR', 'GB', 'US', 'IT'];
  const missingCodes = sampleCodes.filter(code => !countryMap[code]);
  if (missingCodes.length > 0) {
    console.warn(`   ⚠️  Missing country codes: ${missingCodes.join(', ')}`);
  }

  console.log('🏢 Creating warehouses...');
  const warehouse_fr = await api('/v1/regions/warehouses', {
    display_name: 'France Distribution Center',
    address_line1: '218 route Notre Dame de la Gorge',
    city: 'Les Contamines-Montjoie',
    postal_code: '74170',
    country_code: 'FR',
    priority: 1,
  });

  const warehouse_it = await api('/v1/regions/warehouses', {
    display_name: 'Italy Distribution Center',
    address_line1: '17 piazza San Marco',
    city: 'Venezia',
    postal_code: '30124',
    country_code: 'IT',
    priority: 2,
  });

  console.log('💰 Seeding taxes...');
  await seedTaxes();

  console.log('📦 Creating shipping rates...');
  const shippingRate = await api('/v1/regions/shipping-rates', {
    display_name: 'Standard Shipping',
    description: 'Standard international shipping',
    min_delivery_days: 5,
    max_delivery_days: 10,
    tax_code: 'txcd_99999999',
    tax_inclusive: true,
  });

  // Add shipping rate prices for each currency
  await api(`/v1/regions/shipping-rates/${shippingRate.id}/prices`, {
    currency_id: currencyMap.EUR,
    amount_cents: 999, // €9.99
  });

  await api(`/v1/regions/shipping-rates/${shippingRate.id}/prices`, {
    currency_id: currencyMap.GBP,
    amount_cents: 799, // £7.99
  });

  await api(`/v1/regions/shipping-rates/${shippingRate.id}/prices`, {
    currency_id: currencyMap.USD,
    amount_cents: 1299, // $12.99
  });

  console.log('🗺️ Creating regions...');

  // Europe region
  const region_eu = await api('/v1/regions', {
    display_name: 'Europe',
    currency_id: currencyMap.EUR,
    is_default: true,
    tax_inclusive: true,
  });

  // Add countries to Europe
  for (const country of EUROPEAN_COUNTRIES) {
    const countryId = countryMap[country.code];
    if (!countryId) {
      console.warn(`   ⚠️  Country not found in database: ${country.code} (${country.display_name}). Skipping.`);
      continue;
    }
    await api(`/v1/regions/${region_eu.id}/countries`, {
      country_id: countryId,
    });
  }

  // Add warehouses to Europe
  await api(`/v1/regions/${region_eu.id}/warehouses`, { warehouse_id: warehouse_fr.id });
  await api(`/v1/regions/${region_eu.id}/warehouses`, { warehouse_id: warehouse_it.id });

  // Add shipping rates to Europe
  await api(`/v1/regions/${region_eu.id}/shipping-rates`, { shipping_rate_id: shippingRate.id });

  // UK region
  const region_uk = await api('/v1/regions', {
    display_name: 'United Kingdom',
    currency_id: currencyMap.GBP,
    is_default: false,
    tax_inclusive: true,
  });

  for (const country of UK_COUNTRIES) {
    const countryId = countryMap[country.code];
    if (!countryId) {
      console.warn(`   ⚠️  Country not found in database: ${country.code} (${country.display_name}). Skipping.`);
      continue;
    }
    await api(`/v1/regions/${region_uk.id}/countries`, {
      country_id: countryId,
    });
  }

  await api(`/v1/regions/${region_uk.id}/warehouses`, { warehouse_id: warehouse_fr.id });
  await api(`/v1/regions/${region_uk.id}/shipping-rates`, { shipping_rate_id: shippingRate.id });

  // US region
  const region_us = await api('/v1/regions', {
    display_name: 'North America',
    currency_id: currencyMap.USD,
    is_default: false,
    tax_inclusive: true,
  });

  for (const country of US_COUNTRIES) {
    const countryId = countryMap[country.code];
    if (!countryId) {
      console.warn(`   ⚠️  Country not found in database: ${country.code} (${country.display_name}). Skipping.`);
      continue;
    }
    await api(`/v1/regions/${region_us.id}/countries`, {
      country_id: countryId,
    });
  }

  await api(`/v1/regions/${region_us.id}/warehouses`, { warehouse_id: warehouse_it.id });
  await api(`/v1/regions/${region_us.id}/warehouses`, { warehouse_id: warehouse_fr.id });
  await api(`/v1/regions/${region_us.id}/shipping-rates`, { shipping_rate_id: shippingRate.id });

  // World region
  const region_world = await api('/v1/regions', {
    display_name: 'Rest of World',
    currency_id: currencyMap.EUR,
    is_default: false,
    tax_inclusive: true,
  });

  for (const country of OTHER_COUNTRIES) {
    const countryId = countryMap[country.code];
    if (!countryId) {
      console.warn(`   ⚠️  Country not found in database: ${country.code} (${country.display_name}). Skipping.`);
      continue;
    }
    await api(`/v1/regions/${region_world.id}/countries`, {
      country_id: countryId,
    });
  }

  await api(`/v1/regions/${region_world.id}/warehouses`, { warehouse_id: warehouse_fr.id });
  await api(`/v1/regions/${region_world.id}/shipping-rates`, { shipping_rate_id: shippingRate.id });

  return {
    warehouses: { fr: warehouse_fr.id, it: warehouse_it.id },
    regions: { eu: region_eu.id, uk: region_uk.id, us: region_us.id, world: region_world.id },
    currencyMap,
    shippingRate,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Type definitions
// ─────────────────────────────────────────────────────────────────────────────

interface SeedReview { customer_email: string; product_key: string; rating: number; title: string; body: string; status: 'approved' | 'pending'; }


// ─────────────────────────────────────────────────────────────────────────────
// Data: shipping addresses & orders for demo customers
// To add a customer / order: add an entry to SEED_ADDRESSES then SEED_ORDERS.
//
// Region -> customer_email -> address. Used for /v1/orders/test seeds.
// ─────────────────────────────────────────────────────────────────────────────

const SEED_ADDRESSES: Record<string, Record<string, any>> = {
  eu: {
    'sarah@eu.example.com':  { name: 'Sarah Dupont',   line1: '123 Rue de la Paix',        city: 'Paris',      postal_code: '75001',    country: 'FR' },
    'mike@eu.example.com':   { name: 'Mike Schmidt',   line1: '456 Hauptstrasse',           city: 'Berlin',     postal_code: '10115',    country: 'DE' },
    'emma@eu.example.com':   { name: 'Emma García',    line1: '789 Calle Principal',        city: 'Madrid',     postal_code: '28001',    country: 'ES' },
    'oliver@eu.example.com': { name: 'Oliver Rossi',   line1: '321 Via Roma',               city: 'Roma',       postal_code: '00184',    country: 'IT' },
  },
  uk: {
    'james@uk.example.com':  { name: 'James Williams', line1: '100 Oxford Street',          city: 'London',     postal_code: 'W1D 1LL',  country: 'GB', state: 'England' },
    'olivia@uk.example.com': { name: 'Olivia Brown',   line1: '50 Regent Street',           city: 'Manchester', postal_code: 'M1 1JQ',   country: 'GB', state: 'England' },
  },
  us: {
    'noah@us.example.com':   { name: 'Noah Johnson',   line1: '1600 Pennsylvania Avenue NW', city: 'Washington', postal_code: '20500',    country: 'US', state: 'DC' },
    'ava@us.example.com':    { name: 'Ava Smith',      line1: '350 5th Avenue',             city: 'New York',   postal_code: '10118',    country: 'US', state: 'NY' },
  },
};

const SEED_ORDERS: Record<string, Array<{ customer_email: string; items: Array<{ sku: string; qty: number }> }>> = {
  // One entry per region; each test order is created with default shipping rules
  eu: [
    { customer_email: 'sarah@eu.example.com',  items: [{ sku: 'TEE-BLK-M',  qty: 2 }, { sku: 'CAP-BLK',    qty: 1 }] },
    { customer_email: 'mike@eu.example.com',   items: [{ sku: 'HOOD-BLK-L', qty: 1 }] },
    { customer_email: 'emma@eu.example.com',   items: [{ sku: 'TEE-WHT-S',  qty: 1 }, { sku: 'TEE-WHT-M',  qty: 1 }, { sku: 'CAP-NVY', qty: 2 }] },
    { customer_email: 'oliver@eu.example.com', items: [{ sku: 'STICKER-5PK',qty: 3 }, { sku: 'TEE-BLK-S',  qty: 1 }] },
  ],
  uk: [
    { customer_email: 'james@uk.example.com',  items: [{ sku: 'HOOD-GRY-M', qty: 1 }, { sku: 'TEE-BLK-L',  qty: 2 }] },
    { customer_email: 'olivia@uk.example.com', items: [{ sku: 'CAP-BLK',    qty: 1 }] },
  ],
  us: [
    { customer_email: 'noah@us.example.com',   items: [{ sku: 'TEE-BLK-S',  qty: 1 }, { sku: 'TEE-WHT-L',  qty: 1 }, { sku: 'HOOD-BLK-M', qty: 1 }] },
    { customer_email: 'ava@us.example.com',    items: [{ sku: 'HOOD-GRY-L', qty: 2 }] },
  ],
};

// Customers whose orders are immediately set to 'delivered' (review eligibility)
const REVIEW_CUSTOMERS = new Set([
  'ava@us.example.com',
  'noah@us.example.com',
  'olivia@uk.example.com',
  'james@uk.example.com',
  'oliver@eu.example.com',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Data: demo reviews
// status 'approved' → visible immediately · status 'pending' → awaiting moderation
// ─────────────────────────────────────────────────────────────────────────────

const SEED_REVIEWS: SeedReview[] = [
  { customer_email: 'ava@us.example.com',    product_key: 'hoodie',  rating: 5, title: 'Amazing quality!',    body: 'Love this hoodie — great fit and the logo looks fantastic.',        status: 'approved' },
  { customer_email: 'noah@us.example.com',   product_key: 'tee',     rating: 5, title: 'Perfect shirt',        body: 'Super comfortable and the print quality is excellent.',             status: 'approved' },
  { customer_email: 'noah@us.example.com',   product_key: 'hoodie',  rating: 5, title: 'Great hoodie',         body: 'Warm, stylish, and great for everyday wear.',                       status: 'approved' },
  { customer_email: 'olivia@uk.example.com', product_key: 'cap',     rating: 5, title: 'Love this cap',        body: 'Fits perfectly and looks great.',                                   status: 'approved' },
  { customer_email: 'james@uk.example.com',  product_key: 'hoodie',  rating: 5, title: 'Excellent hoodie',     body: 'Really good quality, very happy with this purchase.',               status: 'pending'  },
  { customer_email: 'james@uk.example.com',  product_key: 'tee',     rating: 5, title: 'Quality tee',          body: 'Nice and comfortable, love the logo placement.',                    status: 'pending'  },
  { customer_email: 'oliver@eu.example.com', product_key: 'sticker', rating: 5, title: 'Great stickers',       body: 'Vibrant colors and they stick really well.',                        status: 'pending'  },
  { customer_email: 'oliver@eu.example.com', product_key: 'tee',     rating: 5, title: 'Classic and comfy',    body: 'Nice and comfortable, the logo placement is perfect.',              status: 'pending'  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Seeding functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create all products from PRODUCT_CATALOG with multi-currency pricing,
 * category assignments and warehouse inventory.
 *
 * 1. Creates product metadata (titles/descriptions/translations)
 * 2. Links product to categories
 * 3. Creates variants with storage-agnostic images and prices
 * 4. Sets inventory in relevant warehouses
 *
 * @param regionData Output from seedRegions()
 * @param categoryData Output from seedCategories()
 * @returns Map of product key -> product id.
 */
async function seedProducts(regionData: any, categoryData: any): Promise<Record<string, string>> {
  const productIds: Record<string, string> = {};
  const { EUR: eurId, USD: usdId, GBP: gbpId } = regionData.currencyMap as Record<string, string>;

  const handleToId: Record<string, string> = {
    'classic-tees':     categoryData.classicTees,
    'caps':             categoryData.caps,
    'hoodies':          categoryData.hoodies,
    'stickers':         categoryData.stickers,
    'bags-carry':       categoryData.bagsCarry,
    'drinkware':        categoryData.drinkware,
    'accessories-tech': categoryData.accessoriesTech,
    'home-living':      categoryData.homeLiving,
    'events-signage':   categoryData.eventsSignage,
    'sports-outdoor':   categoryData.sportsOutdoor,
  };

  for (const prod of PRODUCT_CATALOG) {
    // Preserve localized vendor name for all defined locales.
    const i18nVendor = { 'en-US': prod.vendor, 'fr-FR': prod.vendor, 'es-ES': prod.vendor, 'zh-CN': prod.vendor, 'ar-SA': prod.vendor, 'he-IL': prod.vendor };

    console.log(`📦 Creating ${prod.title['en-US']}...`);
    const product = await api('/v1/products', {
      handle: prod.handle,
      title: JSON.stringify(prod.title),
      description: JSON.stringify(prod.description),
      vendor: JSON.stringify(i18nVendor),
    });

    productIds[prod.key] = product.id;

    for (const cat of prod.categories) {
      const catId = handleToId[cat];
      if (catId) await api(`/v1/categories/${catId}/products`, { product_ids: [product.id] });
    }

    for (const v of prod.variants) {
      const { stock, imageFile, ...variantBase } = v as any;
      const imgFile: string = imageFile ?? prod.file;
      const variantPayload: any = { ...variantBase, currency: 'EUR', tax_code: 'txcd_99999999' };
      const rawSrc: string = imageMap[imgFile] ?? imgFile;
      const imageUrl = await toWebpDataUri(rawSrc, 1200, 80);
      const thumbnailUrl = await toWebpDataUri(rawSrc, 400, 80);
      if (imageUrl) variantPayload.image_url = imageUrl;
      if (thumbnailUrl) variantPayload.thumbnail_url = thumbnailUrl;

      console.log(`   └─ ${v.sku}`);
      const created = await api(`/v1/products/${product.id}/variants`, variantPayload);

      if (eurId) await api(`/v1/products/${product.id}/variants/${created.id}/prices`, { currency_id: eurId, price_cents: v.price_cents });
      if (usdId) await api(`/v1/products/${product.id}/variants/${created.id}/prices`, { currency_id: usdId, price_cents: convertCents(v.price_cents, EUR_TO_USD) });
      if (gbpId) await api(`/v1/products/${product.id}/variants/${created.id}/prices`, { currency_id: gbpId, price_cents: convertCents(v.price_cents, EUR_TO_GBP) });

      // Special mock distribution: TEE-BLK-S is split between IT/FR warehouses
      // for regional stock testing; all other SKUs are stocked in FR.
      if (v.sku === 'TEE-BLK-S') {
        await api(`/v1/inventory/${encodeURIComponent(v.sku)}/warehouse-adjust`, { warehouse_id: regionData.warehouses.it, delta: 10,         reason: 'restock' });
        await api(`/v1/inventory/${encodeURIComponent(v.sku)}/warehouse-adjust`, { warehouse_id: regionData.warehouses.fr, delta: stock - 10, reason: 'restock' });
      } else {
        await api(`/v1/inventory/${encodeURIComponent(v.sku)}/warehouse-adjust`, { warehouse_id: regionData.warehouses.fr, delta: stock, reason: 'restock' });
      }
    }
  }

  return productIds;
}

/**
 * Create all demo orders across regions.
 * Orders for customers in REVIEW_CUSTOMERS are immediately transitioned to
 * 'delivered' so they become review-eligible.
 *
 * This also simulates a payment session and attaches shipping metadata.
 */
async function seedOrders(regionData: any): Promise<void> {
  console.log('\n🛒 Creating test orders...');
  const shippingCentsByRegion: Record<string, number> = { eu: 999, uk: 799, us: 1299 };

  for (const [regionKey, orders] of Object.entries(SEED_ORDERS)) {
    const regionId = regionData.regions[regionKey as keyof typeof regionData.regions];
    const shippingCents = shippingCentsByRegion[regionKey] ?? 999;

    for (const order of orders) {
      const address = SEED_ADDRESSES[regionKey]?.[order.customer_email];
      const result = await api('/v1/orders/test', {
        ...order,
        region_id: regionId,
        shipping_address: address,
        shipping_rate_id: regionData.shippingRate.id,
        shipping_cents: shippingCents,
        stripe_checkout_session_id: `cs_test_${Math.random().toString(36).substring(2, 22).toUpperCase()}`,
        stripe_payment_intent_id:   `pi_test_${Math.random().toString(36).substring(2, 22).toUpperCase()}`,
      });

      const itemsSummary = order.items.map((i) => `${i.qty}x ${i.sku}`).join(', ');
      console.log(`   └─ [${regionKey.toUpperCase()}] ${result.number}: ${order.customer_email} (${itemsSummary})`);

      if (REVIEW_CUSTOMERS.has(order.customer_email)) {
        await apiPatch(`/v1/orders/${result.id}`, { status: 'delivered' });
        console.log(`      ✓ marked delivered (review-eligible)`);
      }
    }
  }
}

/**
 * Seed demo reviews via the admin seed endpoint.
 * Idempotent — skips reviews that already exist (safe for re-runs).
 *
 * @param productIds Map from product key to product id.
 */
async function seedReviews(productIds: Record<string, string>): Promise<void> {
  console.log('\n⭐ Seeding reviews...');

  for (const review of SEED_REVIEWS) {
    const productId = productIds[review.product_key];
    if (!productId) {
      console.warn(`   ⚠️  Unknown product key '${review.product_key}' — skipping review for ${review.customer_email}`);
      continue;
    }
    const result = await api('/v1/reviews/admin/seed', {
      product_id: productId,
      customer_email: review.customer_email,
      rating: review.rating,
      title: review.title,
      body: review.body,
      status: review.status,
    });

    if (result.status === 'already_exists') {
      console.log(`   ↩  ${review.customer_email} → ${review.product_key} (already exists)`);
    } else {
      const icon = review.status === 'approved' ? '✅' : '🕐';
      console.log(`   ${icon} ${review.customer_email} → ${review.product_key}: "${review.title}" [${review.status}]`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main orchestrator
// ─────────────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('🌱 Seeding demo data...\n');

  // Step 1: Regions, tax, shipping, and warehouses.
  const regionData   = await seedRegions();

  // Step 2: Categories, including parent-children links.
  const categoryData = await seedCategories();

  // Step 3: Products + prices + inventory.
  const productIds = await seedProducts(regionData, categoryData);

  // Step 4: Place sample orders and mark review-eligible orders as delivered.
  await seedOrders(regionData);

  // Step 5: Seed review entries for delivered orders.
  await seedReviews(productIds);

  console.log('\n✅ Done! Demo data created.\n');

  const { items: allProducts } = await api('/v1/products');
  const { items: allOrders }   = await api('/v1/orders');
  console.log(`Products : ${allProducts.length}`);
  console.log(`Variants : ${allProducts.reduce((sum: number, p: any) => sum + p.variants.length, 0)}`);
  console.log(`Orders   : ${allOrders.length}`);
  const totalRevenue = allOrders.reduce((sum: number, o: any) => sum + o.amounts.total_cents, 0);
  console.log(`Revenue  : €${(totalRevenue / 100).toFixed(2)}`);
  console.log(`\n📊 Admin: ${API_URL}`);
}

seed().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

