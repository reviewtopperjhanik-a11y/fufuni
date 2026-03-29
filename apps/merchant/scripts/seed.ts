#!/usr/bin/env npx tsx
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

/**
 * Seed script - creates demo data via the API
 *
 * Usage:
 *   npx tsx scripts/seed.ts <api_url> <admin_key>
 *   npx tsx scripts/seed.ts http://localhost:8787 sk_...
 */

// images are embedded as base64 so this file can run even after the PNGs are removed
import { imageMap } from './image_map';
import {
  EUROPEAN_COUNTRIES,
  UK_COUNTRIES,
  US_COUNTRIES,
  OTHER_COUNTRIES,
} from './seed-data';

// helper converting SKUs to the filenames we generated above
const skuToImage: Record<string, string> = {
  // tee variants all use the same image regardless of size
  'TEE-BLK-S': 'tee-black.png',
  'TEE-BLK-M': 'tee-black.png',
  'TEE-BLK-L': 'tee-black.png',
  'TEE-WHT-S': 'tee-white.png',
  'TEE-WHT-M': 'tee-white.png',
  'TEE-WHT-L': 'tee-white.png',
  // hoodies share by colour
  'HOOD-BLK-M': 'hoodie-black.png',
  'HOOD-BLK-L': 'hoodie-black.png',
  'HOOD-GRY-M': 'hoodie-white.png',
  'HOOD-GRY-L': 'hoodie-white.png',
  // caps
  'CAP-BLK': 'cap-black.png',
  'CAP-NVY': 'cap-navy.png',
  // sticker pack
  'STICKER-5PK': 'stickers.png',
};

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
 * Convert cents at a given rate and round to the nearest cent.
 * Rates are expressed relative to EUR (base currency for seeded products).
 */
function convertCents(cents: number, rate: number): number {
  return Math.round(cents * rate);
}

const EUR_TO_USD = 1.14;
const EUR_TO_GBP = 0.86;

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

const additionalProducts = [
  {
    file: 'backpack.png',
    handle: 'backpack',
    title: { 'en-US': 'Backpack' },
    description: { 'en-US': 'Packaged backpack with front compartment and full-color logo print, suitable for everyday carry.' },
    price_cents: 2990,
    weight_g: 700,
    categories: ['bags-carry'],
  },
  {
    file: 'beach-towel.png',
    handle: 'beach-towel',
    title: { 'en-US': 'Beach Towel' },
    description: { 'en-US': 'Folded beach towel in retail packaging with large central logo print for leisure and travel use.' },
    price_cents: 2490,
    weight_g: 650,
    categories: ['home-living', 'sports-outdoor'],
  },
  {
    file: 'beachflag.png',
    handle: 'beach-flag',
    title: { 'en-US': 'Beach Flag' },
    description: { 'en-US': 'Packaged feather beach flag with pole set and printed textile, designed for outdoor promotion.' },
    price_cents: 8900,
    weight_g: 3200,
    categories: ['events-signage', 'sports-outdoor'],
  },
  {
    file: 'beanbag.png',
    handle: 'bean-bag',
    title: { 'en-US': 'Bean Bag' },
    description: { 'en-US': 'Packaged bean bag seat with printed upper panel, intended for indoor lounge and event spaces.' },
    price_cents: 7900,
    weight_g: 3500,
    categories: ['home-living'],
  },
  {
    file: 'bottle-aluminium.png',
    handle: 'aluminium-bottle',
    title: { 'en-US': 'Aluminium Bottle' },
    description: { 'en-US': 'Packaged aluminium bottle with screw cap or sports top and front logo print.' },
    price_cents: 1990,
    weight_g: 320,
    categories: ['drinkware', 'sports-outdoor'],
  },
  {
    file: 'entry-carpet-hard.png',
    handle: 'coir-doormat',
    title: { 'en-US': 'Coir Doormat' },
    description: { 'en-US': 'Packaged coir doormat with printed center area, made for durable entryway use.' },
    price_cents: 2490,
    weight_g: 2600,
    categories: ['events-signage', 'home-living'],
  },
  {
    file: 'entry-carpet.png',
    handle: 'entry-mat',
    title: { 'en-US': 'Entry Mat' },
    description: { 'en-US': 'Packaged entry mat with printed logo area and non-slip backing for indoor or covered entry use.' },
    price_cents: 2990,
    weight_g: 1900,
    categories: ['events-signage', 'home-living'],
  },
  {
    file: 'flag.png',
    handle: 'flag',
    title: { 'en-US': 'Flag' },
    description: { 'en-US': 'Packaged printed flag for indoor or outdoor display, folded for compact shipping.' },
    price_cents: 1490,
    weight_g: 180,
    categories: ['events-signage'],
  },
  {
    file: 'golf-bag.png',
    handle: 'golf-bag',
    title: { 'en-US': 'Golf Bag' },
    description: { 'en-US': 'Packaged golf bag with club compartments and logo panel, intended for full-course transport.' },
    price_cents: 14900,
    weight_g: 3500,
    categories: ['bags-carry', 'sports-outdoor'],
  },
  {
    file: 'golf-ball-x1.png',
    handle: 'golf-ball-x1',
    title: { 'en-US': 'Golf Ball' },
    description: { 'en-US': 'Single packaged golf ball with printed logo, suitable for play or promotional gifting.' },
    price_cents: 490,
    weight_g: 52,
    categories: ['sports-outdoor'],
  },
  {
    file: 'golf-balls-x12-box.png',
    handle: 'golf-balls-x12-box',
    title: { 'en-US': 'Box of 12 Golf Balls' },
    description: { 'en-US': 'Retail box of twelve logo-printed golf balls, packaged for sale or premium events.' },
    price_cents: 3990,
    weight_g: 700,
    categories: ['sports-outdoor'],
  },
  {
    file: 'golf-club-protectors-3-set.png',
    handle: 'golf-club-protectors-3-set',
    title: { 'en-US': 'Set of 3 Golf Club Headcovers' },
    description: { 'en-US': 'Packaged set of three padded golf club headcovers with logo print for driver and woods protection.' },
    price_cents: 2490,
    weight_g: 450,
    categories: ['sports-outdoor'],
  },
  {
    file: 'golf-tees.png',
    handle: 'golf-tees',
    title: { 'en-US': 'Pack of Golf Tees' },
    description: { 'en-US': 'Packaged golf tees in a transparent bag, intended for promotional resale or course accessories.' },
    price_cents: 890,
    weight_g: 120,
    categories: ['sports-outdoor'],
  },
  {
    file: 'golf-umbrella.png',
    handle: 'golf-umbrella',
    title: { 'en-US': 'Golf Umbrella' },
    description: { 'en-US': 'Packaged oversized golf umbrella with alternating panels and large printed logo section.' },
    price_cents: 3990,
    weight_g: 850,
    categories: ['sports-outdoor'],
  },
  {
    file: 'iphone-case.png',
    handle: 'iphone-17-case',
    title: { 'en-US': 'iPhone 17 Case' },
    description: { 'en-US': 'Packaged protective case for iPhone 17 with centered logo print and slim everyday profile.' },
    price_cents: 2490,
    weight_g: 55,
    categories: ['accessories-tech'],
  },
  {
    file: 'key-holder.png',
    handle: 'acrylic-keychain',
    title: { 'en-US': 'Acrylic Keychain' },
    description: { 'en-US': 'Packaged acrylic keychain with metal ring and full-color insert featuring the product logo.' },
    price_cents: 690,
    weight_g: 35,
    categories: ['accessories-tech'],
  },
  {
    file: 'large-bag.png',
    handle: 'duffle-bag',
    title: { 'en-US': 'Duffle Bag' },
    description: { 'en-US': 'Packaged duffle bag with shoulder strap, zip pockets and side logo placement.' },
    price_cents: 3990,
    weight_g: 900,
    categories: ['bags-carry'],
  },
  {
    file: 'lux-pen.png',
    handle: 'luxury-metal-pen',
    title: { 'en-US': 'Luxury Metal Pen' },
    description: { 'en-US': 'Packaged premium metal pen with glossy finish and discreet logo branding.' },
    price_cents: 1490,
    weight_g: 80,
    categories: ['accessories-tech'],
  },
  {
    file: 'mouse-pad.png',
    handle: 'mouse-pad',
    title: { 'en-US': 'Mouse Pad' },
    description: { 'en-US': 'Packaged mouse pad with smooth top surface and centered full-color logo print.' },
    price_cents: 1290,
    weight_g: 140,
    categories: ['accessories-tech'],
  },
  {
    file: 'mug.png',
    handle: 'ceramic-mug',
    title: { 'en-US': 'Ceramic Mug' },
    description: { 'en-US': 'Packaged ceramic mug with printed front logo, suitable for office or home beverage use.' },
    price_cents: 1290,
    weight_g: 380,
    categories: ['drinkware', 'home-living'],
  },
  {
    file: 'paraglider.png',
    handle: 'paraglider-wing',
    title: { 'en-US': 'Paraglider Wing' },
    description: { 'en-US': 'Packed paraglider wing with branded canopy panel, delivered folded in transport configuration.' },
    price_cents: 329000,
    weight_g: 6500,
    categories: ['sports-outdoor'],
  },
  {
    file: 'paragliding-windsock.png',
    handle: 'paragliding-windsock',
    title: { 'en-US': 'Paragliding Windsock' },
    description: { 'en-US': 'Packaged paragliding windsock for wind direction indication on launch or landing areas.' },
    price_cents: 3990,
    weight_g: 250,
    categories: ['events-signage', 'sports-outdoor'],
  },
  {
    file: 'pen-4-colors.png',
    handle: 'pen-4-colors',
    title: { 'en-US': '4-Color Pen' },
    description: { 'en-US': 'Packaged multi-ink pen with four writing colors and compact logo print area.' },
    price_cents: 490,
    weight_g: 35,
    categories: ['accessories-tech'],
  },
  {
    file: 'pins.png',
    handle: 'badge-pins-set',
    title: { 'en-US': 'Badge Pins Set' },
    description: { 'en-US': 'Packaged set of round badge pins with logo artwork for events, giveaways and accessories.' },
    price_cents: 990,
    weight_g: 40,
    categories: ['accessories-tech', 'events-signage'],
  },
  {
    file: 'tennis-protector.png',
    handle: 'tennis-racket-cover',
    title: { 'en-US': 'Tennis Racket Cover' },
    description: { 'en-US': 'Packaged tennis racket cover with zipper closure and centered logo placement.' },
    price_cents: 1490,
    weight_g: 220,
    categories: ['sports-outdoor'],
  },
  {
    file: 'tote-bag.png',
    handle: 'tote-bag',
    title: { 'en-US': 'Tote Bag' },
    description: { 'en-US': 'Packaged fabric tote bag with long handles and large centered logo print.' },
    price_cents: 1290,
    weight_g: 140,
    categories: ['bags-carry'],
  },
  {
    file: 'totem.png',
    handle: 'roll-up-banner',
    title: { 'en-US': 'Roll-up Banner' },
    description: { 'en-US': 'Packaged roll-up banner stand with printed graphic panel for trade shows and retail display.' },
    price_cents: 9900,
    weight_g: 3200,
    categories: ['events-signage'],
  },
  {
    file: 'usb-key.png',
    handle: 'usb-flash-drive',
    title: { 'en-US': 'USB Flash Drive' },
    description: { 'en-US': 'Packaged USB flash drive with logo print, suitable for data transfer or promotional bundles.' },
    price_cents: 990,
    weight_g: 25,
    categories: ['accessories-tech'],
  },
];

const additionalProductTranslations: Record<string, {title: Record<string,string>, description: Record<string,string>}> = {
  'backpack.png': {
    title: {
      'en-US': "Backpack",
      'fr-FR': "Sac à dos",
      'es-ES': "Mochila",
      'ar-SA': "حقيبة ظهر",
      'zh-CN': "双肩背包",
      'he-IL': "תיק גב",
    },
    description: {
      'en-US': "Packaged backpack with front compartment and full-color logo print, suitable for everyday carry.",
      'fr-FR': "Sac à dos emballé avec compartiment avant et marquage logo en couleur, adapté à un usage quotidien.",
      'es-ES': "Mochila empaquetada con compartimento frontal e impresión del logotipo a color, adecuada para uso diario.",
      'ar-SA': "حقيبة ظهر معبأة مع جيب أمامي وطباعة شعار بالألوان الكاملة، مناسبة للاستخدام اليومي.",
      'zh-CN': "带前袋和彩色标志印刷的包装双肩背包，适合日常使用。",
      'he-IL': "תיק גב ארוז עם תא קדמי והדפסת לוגו צבעונית, מתאים לשימוש יומיומי。",
    },
  },
  'beach-towel.png': {
    title: {
      'en-US': "Beach Towel",
      'fr-FR': "Serviette de plage",
      'es-ES': "Toalla de playa",
      'ar-SA': "منشفة شاطئ",
      'zh-CN': "沙滩巾",
      'he-IL': "מגבת חוף",
    },
    description: {
      'en-US': "Folded beach towel in retail packaging with large central logo print for leisure and travel use.",
      'fr-FR': "Serviette de plage pliée en emballage retail avec grand logo centré, idéale pour les loisirs et le voyage.",
      'es-ES': "Toalla de playa plegada en embalaje retail con gran logotipo centrado, ideal para ocio y viaje.",
      'ar-SA': "منشفة شاطئ مطوية في عبوة بيع مع شعار كبير في الوسط، مناسبة للترفيه والسفر.",
      'zh-CN': "零售包装折叠沙滩巾，中央大幅标志印刷，适合休闲与旅行。",
      'he-IL': "מגבת חוף מקופלת באריזת קמעונאות עם לוגו גדול במרכז, מתאימה לפנאי ולטיולים。",
    },
  },
  'beachflag.png': {
    title: {
      'en-US': "Beach Flag",
      'fr-FR': "Drapeau publicitaire plume",
      'es-ES': "Bandera publicitaria tipo pluma",
      'ar-SA': "علم شاطئي إعلاني",
      'zh-CN': "沙滩旗",
      'he-IL': "דגל חוף פרסומי",
    },
    description: {
      'en-US': "Packaged feather beach flag with pole set and printed textile, designed for outdoor promotion.",
      'fr-FR': "Drapeau plume emballé avec mât et textile imprimé, conçu pour la communication extérieure.",
      'es-ES': "Bandera pluma empaquetada con mástil y textil impreso, diseñada para promoción exterior.",
      'ar-SA': "علم شاطئي من نوع الريشة معبأ مع عمود ونسيج مطبوع، مخصص للدعاية الخارجية.",
      'zh-CN': "含旗杆组件和印花旗面的包装沙滩旗，适用于户外宣传。",
      'he-IL': "דגל חוף מסוג נוצה ארוז עם מוט ובד מודפס, מיועד לפרסום חוץ。",
    },
  },
  'beanbag.png': {
    title: {
      'en-US': "Bean Bag",
      'fr-FR': "Pouf poire",
      'es-ES': "Puf tipo pera",
      'ar-SA': "بين باغ",
      'zh-CN': "懒人沙发",
      'he-IL': "פוף",
    },
    description: {
      'en-US': "Packaged bean bag seat with printed upper panel, intended for indoor lounge and event spaces.",
      'fr-FR': "Pouf emballé avec panneau supérieur imprimé, destiné aux espaces lounge et événementiels.",
      'es-ES': "Puf empaquetado con panel superior impreso, destinado a zonas lounge y eventos.",
      'ar-SA': "مقعد بين باغ معبأ مع لوحة علوية مطبوعة، مناسب لمساحات الاستراحة والفعاليات.",
      'zh-CN': "带印花上表面的包装懒人沙发，适用于室内休闲和活动空间。",
      'he-IL': "פוף ארוז עם חלק עליון מודפס, מיועד לחללי ישיבה ואירועים。",
    },
  },
  'bottle-aluminium.png': {
    title: {
      'en-US': "Aluminium Bottle",
      'fr-FR': "Gourde aluminium",
      'es-ES': "Botella de aluminio",
      'ar-SA': "قارورة ألمنيوم",
      'zh-CN': "铝制水壶",
      'he-IL': "בקבוק אלומיניום",
    },
    description: {
      'en-US': "Packaged aluminium bottle with screw cap or sports top and front logo print.",
      'fr-FR': "Gourde aluminium emballée avec bouchon vissé ou sport et logo imprimé en face avant.",
      'es-ES': "Botella de aluminio empaquetada con tapón de rosca o deportivo y logotipo impreso en la parte frontal.",
      'ar-SA': "قارورة ألمنيوم معبأة بغطاء لولبي أو رياضي مع شعار مطبوع في الواجهة الأمامية.",
      'zh-CN': "带螺旋盖或运动盖并正面印有标志的包装铝制水壶。",
      'he-IL': "בקבוק אלומיניום ארוז עם פקק הברגה או ספורט ולוגו מודפס בחזית。",
    },
  },
  'entry-carpet-hard.png': {
    title: {
      'en-US': "Coir Doormat",
      'fr-FR': "Paillasson coco",
      'es-ES': "Felpudo de coco",
      'ar-SA': "ممسحة باب من ألياف جوز الهند",
      'zh-CN': "椰棕门垫",
      'he-IL': "שטיח כניסה קוקוס",
    },
    description: {
      'en-US': "Packaged coir doormat with printed center area, made for durable entryway use.",
      'fr-FR': "Paillasson coco emballé avec zone centrale imprimée, conçu pour un usage d’entrée durable.",
      'es-ES': "Felpudo de coco empaquetado con zona central impresa, pensado para un uso duradero en la entrada.",
      'ar-SA': "ممسحة باب من ألياف جوز الهند معبأة مع منطقة مركزية مطبوعة، مصممة للاستخدام المتين عند المدخل.",
      'zh-CN': "带中央印刷区域的包装椰棕门垫，适合耐用型入口使用。",
      'he-IL': "שטיח כניסה מקוקוס ארוז עם אזור מרכזי מודפס, מיועד לשימוש עמיד בפתח הבית。",
    },
  },
  'entry-carpet.png': {
    title: {
      'en-US': "Entry Mat",
      'fr-FR': "Tapis d’entrée",
      'es-ES': "Alfombra de entrada",
      'ar-SA': "سجادة مدخل",
      'zh-CN': "入门地垫",
      'he-IL': "שטיח כניסה",
    },
    description: {
      'en-US': "Packaged entry mat with printed logo area and non-slip backing for indoor or covered entry use.",
      'fr-FR': "Tapis d’entrée emballé avec zone logo imprimée et sous-couche antidérapante pour usage intérieur ou abrité.",
      'es-ES': "Alfombra de entrada empaquetada con zona de logotipo impresa y base antideslizante para interior o zonas cubiertas.",
      'ar-SA': "سجادة مدخل معبأة مع مساحة شعار مطبوعة وظهر مانع للانزلاق للاستخدام الداخلي أو في الأماكن المغطاة.",
      'zh-CN': "带印刷标志区域和防滑底面的包装入门地垫，适用于室内或遮蔽入口。",
      'he-IL': "שטיח כניסה ארוז עם אזור לוגו מודפס ותחתית מונעת החלקה לשימוש פנימי או בכניסה מקורה。",
    },
  },
  'flag.png': {
    title: {
      'en-US': "Flag",
      'fr-FR': "Drapeau",
      'es-ES': "Bandera",
      'ar-SA': "علم",
      'zh-CN': "旗帜",
      'he-IL': "דגל",
    },
    description: {
      'en-US': "Packaged printed flag for indoor or outdoor display, folded for compact shipping.",
      'fr-FR': "Drapeau imprimé emballé pour affichage intérieur ou extérieur, plié pour un transport compact.",
      'es-ES': "Bandera impresa empaquetada para exhibición interior o exterior, plegada para un envío compacto.",
      'ar-SA': "علم مطبوع معبأ للعرض الداخلي أو الخارجي، مطوي لشحن مدمج.",
      'zh-CN': "适用于室内或室外展示的包装印刷旗帜，折叠后便于运输。",
      'he-IL': "דגל מודפס ארוז לתצוגה פנימית או חיצונית, מקופל למשלוח קומפקטי。",
    },
  },
  'golf-bag.png': {
    title: {
      'en-US': "Golf Bag",
      'fr-FR': "Sac de golf",
      'es-ES': "Bolsa de golf",
      'ar-SA': "حقيبة غولف",
      'zh-CN': "高尔夫球包",
      'he-IL': "תיק גולף",
    },
    description: {
      'en-US': "Packaged golf bag with club compartments and logo panel, intended for full-course transport.",
      'fr-FR': "Sac de golf emballé avec compartiments pour clubs et panneau logo, destiné au transport sur parcours.",
      'es-ES': "Bolsa de golf empaquetada con compartimentos para palos y panel con logotipo, destinada al transporte en el campo.",
      'ar-SA': "حقيبة غولف معبأة مع أقسام للمضارب ولوحة شعار، مخصصة للنقل في الملعب.",
      'zh-CN': "带球杆分仓和标志面板的包装高尔夫球包，适合全场携带。",
      'he-IL': "תיק גולף ארוז עם תאים למקלות ופאנל לוגו, מיועד לנשיאה במגרש。",
    },
  },
  'golf-ball-x1.png': {
    title: {
      'en-US': "Golf Ball",
      'fr-FR': "Balle de golf",
      'es-ES': "Pelota de golf",
      'ar-SA': "كرة غولف",
      'zh-CN': "高尔夫球",
      'he-IL': "כדור גולף",
    },
    description: {
      'en-US': "Single packaged golf ball with printed logo, suitable for play or promotional gifting.",
      'fr-FR': "Balle de golf emballée à l’unité avec logo imprimé, adaptée au jeu ou au cadeau promotionnel.",
      'es-ES': "Pelota de golf empaquetada individualmente con logotipo impreso, apta para juego o regalo promocional.",
      'ar-SA': "كرة غولف معبأة بشكل فردي مع شعار مطبوع، مناسبة للعب أو للهدايا الترويجية.",
      'zh-CN': "单颗包装高尔夫球，带印刷标志，适合打球或促销赠品。",
      'he-IL': "כדור גולף ארוז בנפרד עם לוגו מודפס, מתאים למשחק או כמתנה שיווקית。",
    },
  },
  'golf-balls-x12-box.png': {
    title: {
      'en-US': "Box of 12 Golf Balls",
      'fr-FR': "Boîte de 12 balles de golf",
      'es-ES': "Caja de 12 pelotas de golf",
      'ar-SA': "علبة 12 كرة غولف",
      'zh-CN': "12只装高尔夫球盒",
      'he-IL': "קופסת 12 כדורי גולף",
    },
    description: {
      'en-US': "Retail box of twelve logo-printed golf balls, packaged for sale or premium events.",
      'fr-FR': "Boîte retail de douze balles de golf imprimées au logo, emballée pour la vente ou les événements premium.",
      'es-ES': "Caja retail de doce pelotas de golf con logotipo impreso, empaquetada para venta o eventos premium.",
      'ar-SA': "علبة بيع تحتوي على اثنتي عشرة كرة غولف مطبوعة بالشعار، مناسبة للبيع أو للفعاليات المميزة.",
      'zh-CN': "零售盒装十二只印有标志的高尔夫球，适合销售或高端活动。",
      'he-IL': "קופסת קמעונאות עם שנים-עשר כדורי גולף מודפסי לוגו, מתאימה למכירה או לאירועי פרימיום。",
    },
  },
  'golf-club-protectors-3-set.png': {
    title: {
      'en-US': "Set of 3 Golf Club Headcovers",
      'fr-FR': "Jeu de 3 protège-têtes de clubs de golf",
      'es-ES': "Set de 3 protectores para palos de golf",
      'ar-SA': "مجموعة من 3 أغطية رؤوس مضارب الغولف",
      'zh-CN': "3件套高尔夫球杆头套",
      'he-IL': "סט 3 כיסויי ראש למקלות גולף",
    },
    description: {
      'en-US': "Packaged set of three padded golf club headcovers with logo print for driver and woods protection.",
      'fr-FR': "Jeu emballé de trois protège-têtes rembourrés pour clubs de golf avec logo imprimé, pour driver et bois.",
      'es-ES': "Set empaquetado de tres fundas acolchadas para palos de golf con logotipo impreso, para driver y maderas.",
      'ar-SA': "مجموعة معبأة من ثلاثة أغطية مبطنة لرؤوس مضارب الغولف مع شعار مطبوع، لحماية الدرايفر والأخشاب.",
      'zh-CN': "三件套包装高尔夫球杆头套，带标志印刷，用于一号木和球道木保护。",
      'he-IL': "סט ארוז של שלושה כיסויי ראש מרופדים למקלות גולף עם לוגו מודפס, להגנת דרייבר ועצים。",
    },
  },
  'golf-tees.png': {
    title: {
      'en-US': "Pack of Golf Tees",
      'fr-FR': "Sachet de tees de golf",
      'es-ES': "Bolsa de tees de golf",
      'ar-SA': "عبوة تيز غولف",
      'zh-CN': "高尔夫球钉套装",
      'he-IL': "חבילת טיז לגולף",
    },
    description: {
      'en-US': "Packaged golf tees in a transparent bag, intended for promotional resale or course accessories.",
      'fr-FR': "Tees de golf emballés en sachet transparent, destinés à la revente promotionnelle ou aux accessoires de parcours.",
      'es-ES': "Tees de golf empaquetados en bolsa transparente, destinados a reventa promocional o accesorios de campo.",
      'ar-SA': "تيز غولف معبأة في كيس شفاف، مناسبة للبيع الترويجي أو كملحقات للملاعب.",
      'zh-CN': "透明袋包装高尔夫球钉，适合促销零售或球场配件。",
      'he-IL': "טיז לגולף ארוזים בשקית שקופה, מתאימים למכירה שיווקית או כאביזרי מגרש。",
    },
  },
  'golf-umbrella.png': {
    title: {
      'en-US': "Golf Umbrella",
      'fr-FR': "Parapluie de golf",
      'es-ES': "Paraguas de golf",
      'ar-SA': "مظلة غولف",
      'zh-CN': "高尔夫伞",
      'he-IL': "מטריית גולף",
    },
    description: {
      'en-US': "Packaged oversized golf umbrella with alternating panels and large printed logo section.",
      'fr-FR': "Parapluie de golf oversize emballé avec panneaux alternés et grande zone logo imprimée.",
      'es-ES': "Paraguas de golf de gran tamaño empaquetado con paneles alternos y gran zona de logotipo impresa.",
      'ar-SA': "مظلة غولف كبيرة معبأة بألواح متناوبة ومساحة شعار مطبوعة كبيرة.",
      'zh-CN': "超大号包装高尔夫伞，带拼色伞面和大面积标志印刷区域。",
      'he-IL': "מטריית גולף גדולה ארוזה עם פאנלים מתחלפים ואזור לוגו מודפס גדול。",
    },
  },
  'iphone-case.png': {
    title: {
      'en-US': "iPhone 17 Case",
      'fr-FR': "Coque iPhone 17",
      'es-ES': "Funda para iPhone 17",
      'ar-SA': "غطاء iPhone 17",
      'zh-CN': "iPhone 17 手机壳",
      'he-IL': "כיסוי iPhone 17",
    },
    description: {
      'en-US': "Packaged protective case for iPhone 17 with centered logo print and slim everyday profile.",
      'fr-FR': "Coque de protection emballée pour iPhone 17 avec logo centré et profil fin pour un usage quotidien.",
      'es-ES': "Funda protectora empaquetada para iPhone 17 con logotipo centrado y perfil fino para uso diario.",
      'ar-SA': "غطاء حماية معبأ لهاتف iPhone 17 مع شعار في الوسط وتصميم نحيف للاستخدام اليومي.",
      'zh-CN': "适用于 iPhone 17 的包装保护壳，中央带标志印刷，日常使用轻薄。",
      'he-IL': "כיסוי מגן ארוז ל‑iPhone 17 עם לוגו ממורכז ופרופיל דק לשימוש יומיומי。",
    },
  },
  'key-holder.png': {
    title: {
      'en-US': "Acrylic Keychain",
      'fr-FR': "Porte-clés acrylique",
      'es-ES': "Llavero acrílico",
      'ar-SA': "سلسلة مفاتيح أكريليك",
      'zh-CN': "亚克力钥匙扣",
      'he-IL': "מחזיק מפתחות אקרילי",
    },
    description: {
      'en-US': "Packaged acrylic keychain with metal ring and full-color insert featuring the product logo.",
      'fr-FR': "Porte-clés acrylique emballé avec anneau métallique et insert couleur au logo du produit.",
      'es-ES': "Llavero acrílico empaquetado con anilla metálica e inserto a color con el logotipo del producto.",
      'ar-SA': "سلسلة مفاتيح أكريليك معبأة مع حلقة معدنية وإدخال ملون يحمل شعار المنتج.",
      'zh-CN': "带金属环和彩色内芯标志图案的包装亚克力钥匙扣。",
      'he-IL': "מחזיק מפתחות אקרילי ארוז עם טבעת מתכת והדפסה צבעונית של הלוגו。",
    },
  },
  'large-bag.png': {
    title: {
      'en-US': "Duffle Bag",
      'fr-FR': "Grand sac de voyage",
      'es-ES': "Bolsa de viaje grande",
      'ar-SA': "حقيبة سفر كبيرة",
      'zh-CN': "大号旅行袋",
      'he-IL': "תיק נסיעות גדול",
    },
    description: {
      'en-US': "Packaged duffle bag with shoulder strap, zip pockets and side logo placement.",
      'fr-FR': "Grand sac de voyage emballé avec bandoulière, poches zippées et logo sur le côté.",
      'es-ES': "Bolsa de viaje grande empaquetada con correa de hombro, bolsillos con cremallera y logotipo lateral.",
      'ar-SA': "حقيبة سفر كبيرة معبأة مع حزام كتف وجيوب بسحاب وشعار جانبي.",
      'zh-CN': "带肩带、拉链口袋和侧面标志位置的包装旅行袋。",
      'he-IL': "תיק נסיעות גדול ארוז עם רצועת כתף, כיסי רוכסן ומיקום לוגו בצד。",
    },
  },
  'lux-pen.png': {
    title: {
      'en-US': "Luxury Metal Pen",
      'fr-FR': "Stylo métal premium",
      'es-ES': "Bolígrafo metálico premium",
      'ar-SA': "قلم معدني فاخر",
      'zh-CN': "高端金属笔",
      'he-IL': "עט מתכת יוקרתי",
    },
    description: {
      'en-US': "Packaged premium metal pen with glossy finish and discreet logo branding.",
      'fr-FR': "Stylo métal premium emballé avec finition brillante et marquage logo discret.",
      'es-ES': "Bolígrafo metálico premium empaquetado con acabado brillante y marcado de logotipo discreto.",
      'ar-SA': "قلم معدني فاخر معبأ بلمسة لامعة وعلامة شعار أنيقة.",
      'zh-CN': "带亮面处理和低调标志的包装高端金属笔。",
      'he-IL': "עט מתכת יוקרתי ארוז עם גימור מבריק ומיתוג לוגו עדין。",
    },
  },
  'mouse-pad.png': {
    title: {
      'en-US': "Mouse Pad",
      'fr-FR': "Tapis de souris",
      'es-ES': "Alfombrilla de ratón",
      'ar-SA': "لوحة فأرة",
      'zh-CN': "鼠标垫",
      'he-IL': "משטח עכבר",
    },
    description: {
      'en-US': "Packaged mouse pad with smooth top surface and centered full-color logo print.",
      'fr-FR': "Tapis de souris emballé avec surface supérieure lisse et logo couleur centré.",
      'es-ES': "Alfombrilla de ratón empaquetada con superficie lisa y logotipo a color centrado.",
      'ar-SA': "لوحة فأرة معبأة بسطح علوي أملس وشعار ملون في المنتصف.",
      'zh-CN': "带顺滑表面和中央彩色标志印刷的包装鼠标垫。",
      'he-IL': "משטח עכבר ארוז עם משטח עליון חלק ולוגו צבעוני במרכז。",
    },
  },
  'mug.png': {
    title: {
      'en-US': "Ceramic Mug",
      'fr-FR': "Mug en céramique",
      'es-ES': "Taza de cerámica",
      'ar-SA': "كوب سيراميك",
      'zh-CN': "陶瓷马克杯",
      'he-IL': "ספל קרמי",
    },
    description: {
      'en-US': "Packaged ceramic mug with printed front logo, suitable for office or home beverage use.",
      'fr-FR': "Mug en céramique emballé avec logo imprimé en face avant, adapté à un usage bureau ou maison.",
      'es-ES': "Taza de cerámica empaquetada con logotipo impreso en la parte frontal, adecuada para oficina o hogar.",
      'ar-SA': "كوب سيراميك معبأ مع شعار مطبوع في الواجهة الأمامية، مناسب للمكتب أو المنزل.",
      'zh-CN': "带正面标志印刷的包装陶瓷马克杯，适合办公室或家用。",
      'he-IL': "ספל קרמי ארוז עם לוגו מודפס בחזית, מתאים למשרד או לבית。",
    },
  },
  'paraglider.png': {
    title: {
      'en-US': "Paraglider Wing",
      'fr-FR': "Voile de parapente",
      'es-ES': "Ala de parapente",
      'ar-SA': "جناح طيران شراعي",
      'zh-CN': "滑翔伞翼",
      'he-IL': "כנף מצנח רחיפה",
    },
    description: {
      'en-US': "Packed paraglider wing with branded canopy panel, delivered folded in transport configuration.",
      'fr-FR': "Voile de parapente emballée avec panneau de voile brandé, livrée pliée en configuration de transport.",
      'es-ES': "Ala de parapente embalada con panel de vela personalizado, entregada plegada para transporte.",
      'ar-SA': "جناح طيران شراعي معبأ مع جزء قماش يحمل العلامة، يُسلم مطوياً بوضعية النقل.",
      'zh-CN': "带品牌伞翼面板的打包滑翔伞翼，折叠后按运输状态交付。",
      'he-IL': "כנף מצנח רחיפה ארוזה עם פאנל ממותג, מסופקת מקופלת לתצורת הובלה。",
    },
  },
  'paragliding-windsock.png': {
    title: {
      'en-US': "Paragliding Windsock",
      'fr-FR': "Manche à air de parapente",
      'es-ES': "Manga de viento para parapente",
      'ar-SA': "كيس رياح للطيران الشراعي",
      'zh-CN': "滑翔伞风向袋",
      'he-IL': "שרוול רוח לרחיפה",
    },
    description: {
      'en-US': "Packaged paragliding windsock for wind direction indication on launch or landing areas.",
      'fr-FR': "Manche à air de parapente emballée pour l’indication du vent sur zone de décollage ou d’atterrissage.",
      'es-ES': "Manga de viento para parapente empaquetada para indicar la dirección del viento en despegue o aterrizaje.",
      'ar-SA': "كيس رياح للطيران الشراعي معبأ لبيان اتجاه الرياح في مناطق الإقلاع أو الهبوط.",
      'zh-CN': "用于起飞或降落区域风向指示的包装滑翔伞风向袋。",
      'he-IL': "שרוול רוח לרחיפה ארוז לציון כיוון הרוח באזורי המראה או נחיתה。",
    },
  },
  'pen-4-colors.png': {
    title: {
      'en-US': "4-Color Pen",
      'fr-FR': "Stylo 4 couleurs",
      'es-ES': "Bolígrafo de 4 colores",
      'ar-SA': "قلم بأربعة ألوان",
      'zh-CN': "四色圆珠笔",
      'he-IL': "עט 4 צבעים",
    },
    description: {
      'en-US': "Packaged multi-ink pen with four writing colors and compact logo print area.",
      'fr-FR': "Stylo multi-encre emballé avec quatre couleurs d’écriture et zone de logo compacte.",
      'es-ES': "Bolígrafo multitinta empaquetado con cuatro colores de escritura y zona compacta para logotipo.",
      'ar-SA': "قلم متعدد الأحبار معبأ بأربعة ألوان كتابة ومساحة مدمجة للشعار.",
      'zh-CN': "带四种书写颜色和紧凑标志印刷区的包装多色圆珠笔。",
      'he-IL': "עט רב-דיו ארוז עם ארבעה צבעי כתיבה ואזור לוגו קומפקטי。",
    },
  },
  'pins.png': {
    title: {
      'en-US': "Badge Pins Set",
      'fr-FR': "Lot de badges",
      'es-ES': "Lote de badges",
      'ar-SA': "مجموعة شارات",
      'zh-CN': "徽章套装",
      'he-IL': "סט סיכות תג",
    },
    description: {
      'en-US': "Packaged set of round badge pins with logo artwork for events, giveaways and accessories.",
      'fr-FR': "Lot emballé de badges ronds avec visuel logo pour événements, giveaways et accessoires.",
      'es-ES': "Lote empaquetado de chapas redondas con arte del logotipo para eventos, regalos y accesorios.",
      'ar-SA': "مجموعة معبأة من الشارات الدائرية برسومات الشعار للفعاليات والهدايا والإكسسوارات.",
      'zh-CN': "带标志图案的圆形徽章套装包装，适用于活动、赠品和配饰。",
      'he-IL': "סט ארוז של סיכות תג עגולות עם גרפיקת לוגו לאירועים, מתנות ואביזרים。",
    },
  },
  'tennis-protector.png': {
    title: {
      'en-US': "Tennis Racket Cover",
      'fr-FR': "Housse de raquette de tennis",
      'es-ES': "Funda para raqueta de tenis",
      'ar-SA': "غطاء مضرب تنس",
      'zh-CN': "网球拍套",
      'he-IL': "כיסוי למחבט טניס",
    },
    description: {
      'en-US': "Packaged tennis racket cover with zipper closure and centered logo placement.",
      'fr-FR': "Housse de raquette de tennis emballée avec fermeture zippée et logo centré.",
      'es-ES': "Funda para raqueta de tenis empaquetada con cierre de cremallera y logotipo centrado.",
      'ar-SA': "غطاء مضرب تنس معبأ بسحاب وإظهار للشعار في الوسط.",
      'zh-CN': "带拉链封口和中央标志位置的包装网球拍套。",
      'he-IL': "כיסוי למחבט טניס ארוז עם רוכסן ומיקום לוגו ממורכז。",
    },
  },
  'tote-bag.png': {
    title: {
      'en-US': "Tote Bag",
      'fr-FR': "Tote bag",
      'es-ES': "Bolsa tote",
      'ar-SA': "حقيبة قماش",
      'zh-CN': "帆布手提袋",
      'he-IL': "תיק טוט",
    },
    description: {
      'en-US': "Packaged fabric tote bag with long handles and large centered logo print.",
      'fr-FR': "Tote bag en tissu emballé avec longues anses et grand logo centré.",
      'es-ES': "Bolsa tote de tela empaquetada con asas largas y gran logotipo centrado.",
      'ar-SA': "حقيبة قماش معبأة بمقابض طويلة وشعار كبير في المنتصف.",
      'zh-CN': "带长提手和中央大幅标志印刷的包装布质手提袋。",
      'he-IL': "תיק טוט מבד ארוז עם ידיות ארוכות ולוגו גדול במרכז。",
    },
  },
  'totem.png': {
    title: {
      'en-US': "Roll-up Banner",
      'fr-FR': "Kakemono roll-up",
      'es-ES': "Roll-up publicitario",
      'ar-SA': "حامل رول أب إعلاني",
      'zh-CN': "易拉宝展架",
      'he-IL': "רול-אפ פרסומי",
    },
    description: {
      'en-US': "Packaged roll-up banner stand with printed graphic panel for trade shows and retail display.",
      'fr-FR': "Kakemono roll-up emballé avec visuel imprimé pour salons, événements et présentation retail.",
      'es-ES': "Roll-up publicitario empaquetado con panel gráfico impreso para ferias y exposición retail.",
      'ar-SA': "حامل رول أب إعلاني معبأ مع لوحة مطبوعة للمعارض والعرض داخل المتاجر.",
      'zh-CN': "带印刷画面的包装易拉宝展架，适用于展会和零售展示。",
      'he-IL': "רול-אפ פרסומי ארוז עם גרפיקה מודפסת לתערוכות ולתצוגה בחנות。",
    },
  },
  'usb-key.png': {
    title: {
      'en-US': "USB Flash Drive",
      'fr-FR': "Clé USB",
      'es-ES': "Memoria USB",
      'ar-SA': "ذاكرة USB",
      'zh-CN': "U盘",
      'he-IL': "דיסק און קי",
    },
    description: {
      'en-US': "Packaged USB flash drive with logo print, suitable for data transfer or promotional bundles.",
      'fr-FR': "Clé USB emballée avec logo imprimé, adaptée au transfert de données ou aux bundles promotionnels.",
      'es-ES': "Memoria USB empaquetada con logotipo impreso, adecuada para transferencia de datos o packs promocionales.",
      'ar-SA': "ذاكرة USB معبأة مع شعار مطبوع، مناسبة لنقل البيانات أو الباقات الترويجية.",
      'zh-CN': "带标志印刷的包装U盘，适合数据传输或促销套装。",
      'he-IL': "דיסק און קי ארוז עם לוגו מודפס, מתאים להעברת נתונים או למארזים שיווקיים。",
    },
  },
};

async function seedAdditionalProducts(categoryData: any, regionData: any) {
  const categoryByHandle: Record<string, string> = {
    'bags-carry': categoryData.bagsCarry,
    'drinkware': categoryData.drinkware,
    'accessories-tech': categoryData.accessoriesTech,
    'home-living': categoryData.homeLiving,
    'events-signage': categoryData.eventsSignage,
    'sports-outdoor': categoryData.sportsOutdoor,
  };

  for (const productData of additionalProducts) {
    const translation = additionalProductTranslations[productData.file];
    const fullTitle = translation ? translation.title : productData.title;
    const fullDescription = translation ? translation.description : productData.description;

    console.log(`📦 Creating catalog product: ${fullTitle['en-US']}`);

    const product = await api('/v1/products', {
      handle: productData.handle,
      title: JSON.stringify(fullTitle),
      description: JSON.stringify(fullDescription),
      vendor: JSON.stringify({ 'en-US': 'Fufuni' }),
    });

    const categories = productData.categories.map((cat: string) => categoryByHandle[cat] || cat).filter(Boolean);
    if (categories.length > 0) {
      await api(`/v1/categories/${categories[0]}/products`, {
        product_ids: [product.id],
      });
      for (const cat of categories.slice(1)) {
        await api(`/v1/categories/${cat}/products`, {
          product_ids: [product.id],
        });
      }
    }

    const sku = productData.file.replace(/\.png$/, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    const variantPayload: any = {
      sku,
      title: productData.title['en-US'],
      price_cents: productData.price_cents,
      weight_g: productData.weight_g,
      currency: 'EUR',
      tax_code: 'txcd_99999999',
    };

    const imageUrl = (imageMap as any)[productData.file];
    if (imageUrl) {
      variantPayload.image_url = imageUrl;
    }

    const createdVariant = await api(`/v1/products/${product.id}/variants`, variantPayload);

    await api(`/v1/inventory/${encodeURIComponent(sku)}/warehouse-adjust`, {
      warehouse_id: regionData.warehouses.fr,
      delta: 20,
      reason: 'restock',
    });
  }
}

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

async function seed() {
  console.log('🌱 Seeding demo data...\n');

  // Create regions and other data
  const regionData = await seedRegions();

  // Create categories
  const categoryData = await seedCategories();

  // Create the new products from catalog CSV and attach them to categories
  await seedAdditionalProducts(categoryData, regionData);

  // Products with their category mapping
  const products = [
    {
      title: '{"en-US":"Classic Tee", "fr-FR":"T-Shirt Classique", "es-ES":"Camiseta Clásica","zh-CN":"经典T恤","ar-SA":"تي شيرت كلاسيكي" ,"he-IL":"טי שירט קלאסי" }',
      description: '{"en-US":"<p>Premium cotton t-shirt. Soft, breathable, and built to last, with our logo…</p>", "fr-FR":"<p>T-shirt en coton premium. Doux, respirant et conçu pour durer, avec notre logo…</p>", "es-ES":"<p>Camiseta de algodón premium. Suave, transpirable y duradera, con nuestro logo…</p>","zh-CN":"<p>优质棉质T恤。柔软、透气、经久耐用，印有我们的标志…</p>","ar-SA":"<p>تي شيرت قطني فاخر. ناعم، قابل للتنفس، ومصمم ليدوم طويلاً، مع شعارنا…</p>" ,"he-IL":"<p>חולצת טי כותנה פרימיום. רכה, נושמת ובנויה להחזיק מעמד, עם הלוגו שלנו…</p>" }',
      vendor: '{"en-US":"SCTG","fr-FR":"SCTG","es-ES":"SCTG","zh-CN":"SCTG","ar-SA":"SCTG","he-IL":"SCTG"}',
      category_id: categoryData.classicTees,
    },
    {
      title: '{"en-US":"Hoodie", "fr-FR":"Sweat à capuche", "es-ES":"Sudadera con capucha", "zh-CN":"连帽衫", "ar-SA":"هودي", "he-IL":"סווטשירט עם כובע" }',
      description: '{"en-US":"<p>Cozy pullover hoodie with large logo. Perfect for coding sessions…</p>","fr-FR":"<p>Sweat à capuche confortable avec grand logo. Parfait pour les sessions de codage…</p>", "es-ES":"<p>Sudadera con capucha cómoda y gran logo. Perfecta para sesiones de programación…</p>","zh-CN":"<p>舒适的连帽衫，带有大标志。非常适合编码会话…</p>","ar-SA":"<p>سويت بالكلاو مريح مع شعار كبير. مثالية لجلسات البرمجة…</p>" ,"he-IL":"<p>חולצת קפואה נוחה עם לוגו גדול. מושלמת לישיבות תכנות…</p>" }',
      vendor: '{"en-US":"SCTG","fr-FR":"SCTG","es-ES":"SCTG","zh-CN":"SCTG","ar-SA":"SCTG","he-IL":"SCTG"}',
      category_id: categoryData.hoodies,
    },
    {
      title: '{"en-US":"Cap", "fr-FR":"Casquette", "es-ES":"Gorra", "zh-CN":"棒球帽", "ar-SA":"قبعة", "he-IL":"כובע" }',
      description: '{"en-US":"<p><strong>Embroidered</strong> baseball cap with logo. One size fits all heads…</p>", "fr-FR":"<p>Casquette de baseball brodée avec logo. Une taille convient à toutes les têtes…</p>", "es-ES":"<p>Gorra de béisbol bordada con logo. Talla única para todas las cabezas…</p>","zh-CN":"<p>刺绣棒球帽，带有标志。适合所有头型…</p>","ar-SA":"<p>قبعة بيسبول مخيطة بشعار. مقاس واحد يناسب جميع الرؤوس…</p>" ,"he-IL":"<p>כובע בייסבול רקום עם לוגו. גודל אחד מתאים לכל הראש…</p>" }',
      vendor: '{"en-US":"SCTG","fr-FR":"SCTG","es-ES":"SCTG","zh-CN":"SCTG","ar-SA":"SCTG","he-IL":"SCTG"}',
      category_id: categoryData.caps,
    },
    {
      title: '{"en-US":"Sticker Pack", "fr-FR":"Pack d’autocollants", "es-ES":"Paquete de pegatinas", "zh-CN":"贴纸包", "ar-SA":"مجموعة ملصقات", "he-IL":"חבילת מדבקות" }',
      description: '{"en-US":"<p>Set of 5 die-cut vinyl stickers. Beautiful, waterproof and durable…</p>", "fr-FR":"<p>Ensemble de 5 autocollants en vinyle découpés. Beaux, imperméables et durables…</p>", "es-ES":"<p>Set de 5 pegatinas de vinilo recortadas. Hermosas, impermeables y duraderas…</p>","zh-CN":"<p>5件套模切乙烯基贴纸。美观、防水且耐用…</ p>","ar-SA":"<p>مجموعة من 5 ملصقات فينيل مقطوعة. جميلة، مقاومة للماء ومتينة…</ p>" ,"he-IL":"< p>סט של 5 מדבקות ויניל חתוכות. יפות, עמידות למים ועמידות…</ p>" }',
      vendor: '{"en-US":"SCTG","fr-FR":"SCTG","es-ES":"SCTG","zh-CN":"SCTG","ar-SA":"SCTG","he-IL":"SCTG"}',
      category_id: categoryData.stickers,
    },
  ];

  const variants: Record<string, any[]> = {
    'Classic Tee': [
      { sku: 'TEE-BLK-S', title: 'Black / S', price_cents: 2999, weight_g: 180, stock: 50 },
      { sku: 'TEE-BLK-M', title: 'Black / M', price_cents: 2999, weight_g: 200, stock: 75 },
      { sku: 'TEE-BLK-L', title: 'Black / L', price_cents: 2999, weight_g: 220, stock: 60 },
      { sku: 'TEE-WHT-S', title: 'White / S', price_cents: 2999, weight_g: 180, stock: 40 },
      { sku: 'TEE-WHT-M', title: 'White / M', price_cents: 2999, weight_g: 200, stock: 55 },
      { sku: 'TEE-WHT-L', title: 'White / L', price_cents: 2999, weight_g: 220, stock: 45 },
    ],
    Hoodie: [
      { sku: 'HOOD-BLK-M', title: 'Black / M', price_cents: 5999, weight_g: 520, stock: 30 },
      { sku: 'HOOD-BLK-L', title: 'Black / L', price_cents: 5999, weight_g: 560, stock: 25 },
      { sku: 'HOOD-GRY-M', title: 'Gray / M', price_cents: 5999, weight_g: 520, stock: 20 },
      { sku: 'HOOD-GRY-L', title: 'Gray / L', price_cents: 5999, weight_g: 560, stock: 15 },
    ],
    Cap: [
      { sku: 'CAP-BLK', title: 'Black', price_cents: 2499, weight_g: 120, stock: 100 },
      { sku: 'CAP-NVY', title: 'Navy', price_cents: 2499, weight_g: 120, stock: 80 },
    ],
    'Sticker Pack': [
      { sku: 'STICKER-5PK', title: '5 Pack', price_cents: 999, weight_g: 30, stock: 200 },
    ],
  };

  // Helper `JSON.parse` wrapper to avoid throwing on invalid JSON
  const safeJsonParse = (value: string) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  for (const prod of products) {
    const rawTitle = prod.title;

    // Normalize title to a canonical key used in the `variants` map.
    // `prod.title` can be a plain string or a JSON string representing a locale map.
    const parsedTitleObj =
      typeof rawTitle === 'string' && rawTitle.trim().startsWith('{')
        ? safeJsonParse(rawTitle)
        : null;

    const titleObj =
      typeof rawTitle === 'object' && rawTitle !== null
        ? rawTitle
        : parsedTitleObj || null;

    const titleKey =
      typeof rawTitle === 'string' && !titleObj
        ? rawTitle
        : (titleObj && (titleObj['en-US'] || Object.values(titleObj)[0])) ||
        (typeof rawTitle === 'string' ? rawTitle : String(rawTitle));

    const displayTitle =
      (titleObj && (titleObj['en-US'] || Object.values(titleObj)[0])) ||
      (typeof rawTitle === 'string' ? rawTitle : String(rawTitle));

    console.log(`📦 Creating ${displayTitle}...`);

    // Send only the supported product fields to the API (exclude our helper keys if any)
    const { handle, category_id, ...productPayload } = prod as any;
    const product = await api('/v1/products', productPayload);

    // Add product to its category
    if (category_id) {
      await api(`/v1/categories/${category_id}/products`, {
        product_ids: [product.id],
      });
    }

    const productVariants = variants[titleKey];
    if (!productVariants) {
      throw new Error(`No variants defined for product title key: ${titleKey}`);
    }

    for (const v of productVariants) {
      const { stock, ...variant } = v;

      // attach an image if we know which file corresponds to this SKU
      const imgFile = skuToImage[variant.sku];
      if (imgFile) {
        variant.image_url = imageMap[imgFile];
      }

      console.log(`   └─ ${variant.sku}`);

      // Create variant (base price is in EUR)
      const createdVariant = await api(`/v1/products/${product.id}/variants`, {
        ...variant,
        currency: 'EUR',
        tax_code: 'txcd_99999999',
      });

      // Add EUR/USD/GBP prices based on fixed conversion rates (EUR is the base currency here)
      const eurCurrencyId = regionData.currencyMap?.EUR;
      const usdCurrencyId = regionData.currencyMap?.USD;
      const gbpCurrencyId = regionData.currencyMap?.GBP;

      if (eurCurrencyId) {
        await api(`/v1/products/${product.id}/variants/${createdVariant.id}/prices`, {
          currency_id: eurCurrencyId,
          price_cents: variant.price_cents,
        });
      }

      if (usdCurrencyId) {
        await api(`/v1/products/${product.id}/variants/${createdVariant.id}/prices`, {
          currency_id: usdCurrencyId,
          price_cents: convertCents(variant.price_cents, EUR_TO_USD),
        });
      }
      if (gbpCurrencyId) {
        await api(`/v1/products/${product.id}/variants/${createdVariant.id}/prices`, {
          currency_id: gbpCurrencyId,
          price_cents: convertCents(variant.price_cents, EUR_TO_GBP),
        });
      }

      // Add warehouse inventory
      // Special case: 10 TEE-BLK-S in Italy, rest in France
      if (variant.sku === 'TEE-BLK-S') {
        // 10 in Italy
        await api(`/v1/inventory/${encodeURIComponent(variant.sku)}/warehouse-adjust`, {
          warehouse_id: regionData.warehouses.it,
          delta: 10,
          reason: 'restock',
        });
        // Rest (40, 35, 10) in France based on sizes
        const stock_fr = stock - 10;
        await api(`/v1/inventory/${encodeURIComponent(variant.sku)}/warehouse-adjust`, {
          warehouse_id: regionData.warehouses.fr,
          delta: stock_fr,
          reason: 'restock',
        });
      } else {
        // All other SKUs go to France warehouse
        await api(`/v1/inventory/${encodeURIComponent(variant.sku)}/warehouse-adjust`, {
          warehouse_id: regionData.warehouses.fr,
          delta: stock,
          reason: 'restock',
        });
      }
    }
  };

  // Create test orders across different regions
  console.log('\n🛒 Creating test orders...');

  // Addresses for each test customer/region
  const addressesByRegion: Record<string, Record<string, any>> = {
    eu: {
      'sarah@eu.example.com': {
        name: 'Sarah Dupont',
        line1: '123 Rue de la Paix',
        city: 'Paris',
        postal_code: '75001',
        country: 'FR',
      },
      'mike@eu.example.com': {
        name: 'Mike Schmidt',
        line1: '456 Hauptstrasse',
        city: 'Berlin',
        postal_code: '10115',
        country: 'DE',
      },
      'emma@eu.example.com': {
        name: 'Emma García',
        line1: '789 Calle Principal',
        city: 'Madrid',
        postal_code: '28001',
        country: 'ES',
      },
      'oliver@eu.example.com': {
        name: 'Oliver Rossi',
        line1: '321 Via Roma',
        city: 'Roma',
        postal_code: '00184',
        country: 'IT',
      },
    },
    uk: {
      'james@uk.example.com': {
        name: 'James Williams',
        line1: '100 Oxford Street',
        city: 'London',
        state: 'England',
        postal_code: 'W1D 1LL',
        country: 'GB',
      },
      'olivia@uk.example.com': {
        name: 'Olivia Brown',
        line1: '50 Regent Street',
        city: 'Manchester',
        state: 'England',
        postal_code: 'M1 1JQ',
        country: 'GB',
      },
    },
    us: {
      'noah@us.example.com': {
        name: 'Noah Johnson',
        line1: '1600 Pennsylvania Avenue NW',
        city: 'Washington',
        state: 'DC',
        postal_code: '20500',
        country: 'US',
      },
      'ava@us.example.com': {
        name: 'Ava Smith',
        line1: '350 5th Avenue',
        city: 'New York',
        state: 'NY',
        postal_code: '10118',
        country: 'US',
      },
    },
  };

  const testOrdersByRegion: Record<string, Array<{ customer_email: string; items: Array<{ sku: string; qty: number }> }>> = {
    eu: [
      {
        customer_email: 'sarah@eu.example.com',
        items: [
          { sku: 'TEE-BLK-M', qty: 2 },
          { sku: 'CAP-BLK', qty: 1 },
        ],
      },
      {
        customer_email: 'mike@eu.example.com',
        items: [{ sku: 'HOOD-BLK-L', qty: 1 }],
      },
      {
        customer_email: 'emma@eu.example.com',
        items: [
          { sku: 'TEE-WHT-S', qty: 1 },
          { sku: 'TEE-WHT-M', qty: 1 },
          { sku: 'CAP-NVY', qty: 2 },
        ],
      },
      {
        customer_email: 'oliver@eu.example.com',
        items: [
          { sku: 'STICKER-5PK', qty: 3 },
          { sku: 'TEE-BLK-S', qty: 1 },
        ],
      },
    ],
    uk: [
      {
        customer_email: 'james@uk.example.com',
        items: [
          { sku: 'HOOD-GRY-M', qty: 1 },
          { sku: 'TEE-BLK-L', qty: 2 },
        ],
      },
      {
        customer_email: 'olivia@uk.example.com',
        items: [{ sku: 'CAP-BLK', qty: 1 }],
      },
    ],
    us: [
      {
        customer_email: 'noah@us.example.com',
        items: [
          { sku: 'TEE-BLK-S', qty: 1 },
          { sku: 'TEE-WHT-L', qty: 1 },
          { sku: 'HOOD-BLK-M', qty: 1 },
        ],
      },
      {
        customer_email: 'ava@us.example.com',
        items: [{ sku: 'HOOD-GRY-L', qty: 2 }],
      },
    ],
  };

  // Create orders for each region
  for (const [regionKey, orders] of Object.entries(testOrdersByRegion)) {
    const regionId = regionData.regions[regionKey as keyof typeof regionData.regions];
    const shippingRateId = regionData.shippingRate.id; // from seedRegions()

    // Use region-specific shipping prices
    let shippingCents = 999; // EUR default
    if (regionKey === 'uk') shippingCents = 799; // GBP
    if (regionKey === 'us') shippingCents = 1299; // USD

    for (const order of orders) {
      const address = addressesByRegion[regionKey]?.[order.customer_email];

      const result = await api('/v1/orders/test', {
        ...order,
        region_id: regionId,
        shipping_address: address,
        shipping_rate_id: shippingRateId,
        shipping_cents: shippingCents,
        stripe_checkout_session_id: `cs_test_${Math.random().toString(36).substr(2, 20).toUpperCase()}`,
        stripe_payment_intent_id: `pi_test_${Math.random().toString(36).substr(2, 20).toUpperCase()}`,
      });
      const itemsSummary = order.items.map((i) => `${i.qty}x ${i.sku}`).join(', ');
      console.log(`   └─ [${regionKey.toUpperCase()}] ${result.number}: ${order.customer_email} (${itemsSummary})`);
    }
  }

  console.log('\n✅ Done! Demo data created.\n');

  // Show summary
  const { items: allProducts } = await api('/v1/products');
  const { items: allOrders } = await api('/v1/orders');
  console.log(`Products: ${allProducts.length}`);
  console.log(
    `Variants: ${allProducts.reduce((sum: number, p: any) => sum + p.variants.length, 0)}`
  );
  console.log(`Orders: ${allOrders.length}`);

  const totalRevenue = allOrders.reduce((sum: number, o: any) => sum + o.amounts.total_cents, 0);
  console.log(`Revenue: $${(totalRevenue / 100).toFixed(2)}`);

  console.log(`\n📊 Admin dashboard: cd admin && npm run dev`);
  console.log(`   Connect with: ${API_URL}`);
}

seed().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
