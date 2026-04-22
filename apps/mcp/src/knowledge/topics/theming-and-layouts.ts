/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'theming-and-layouts',
  description: 'Theme and layout system — ThemeProvider, the Default and Luxury layouts, CMS-driven content blocks, and siteConfig integration.',
  tags: ["design","frontend","react","theming","ui"],
  sources: [
    'apps/client/src/layouts/default.tsx',
    'apps/client/src/layouts/luxury.tsx',
    'apps/client/src/config/cms-content.ts',
    'apps/client/src/providers/theme-provider.tsx',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'There are 2 layouts: DefaultLayout (apps/client/src/layouts/default.tsx) — standard e-commerce layout with navbar and cart drawer; LuxuryLayout (apps/client/src/layouts/luxury.tsx) — full-bleed hero layout for premium product pages.',
    'StoreThemeProvider (apps/client/src/providers/theme-provider.tsx) fetches the active theme from GET /v1/store-themes/active at startup and applies CSS variables (--color-primary, --color-secondary, etc.) to :root. Themes are stored in the store_themes DB table.',
    'To add a new CSS variable to the theme system: (1) add it to the store_themes DB schema; (2) apply it in theme-provider.tsx; (3) use var(--your-variable) in Tailwind config or component className.',
    'HeroUI color variables are overridden by the StoreThemeProvider. The ThemeSwitch component (light/dark mode) is separate from the store theme and changes the HeroUI color mode class on <html>.',
    'cms-content.ts (apps/client/src/config/cms-content.ts) is the CMS data layer. It exports siteConfig() which returns structured content: hero banners, featured categories, promotional sections. These are fetched from GET /v1/cms/content at runtime.',
    'To add a new CMS content section: (1) add a field to the CmsContent type in cms-content.ts; (2) add an admin editor in the admin/cms page; (3) call PUT /v1/cms/content from the admin page; (4) render the new field in the appropriate layout or page component.',
    'DefaultLayout handles: Navbar, CartDrawer, mobile menu, toast provider, and <Outlet> for page content. Pages rendered by DefaultLayout must not add their own Navbar.',
    'LuxuryLayout has no Navbar — it uses a minimal transparent header. Use it only for product landing pages where full-bleed imagery is required.',
  ],
  buildPrompt: (src) => appendFacts(`
Below are the two layout components, cms-content.ts, and theme-provider.tsx.

${src}

Task: Write a "Theming & Layouts Reference".
Include:
1. The 2 layouts: when to use each, what they provide (Navbar, CartDrawer, etc.).
2. StoreThemeProvider: how it fetches and applies the active theme, CSS variable list.
3. How to add a new CSS variable to the theme system (3 steps).
4. ThemeSwitch (light/dark mode) vs StoreTheme — the difference.
5. CMS content: cms-content.ts structure, siteConfig(), how content is fetched.
6. How to add a new CMS section (4 steps).
7. HeroUI color override mechanism.
`, topic.manualFacts),
};

export default topic;
