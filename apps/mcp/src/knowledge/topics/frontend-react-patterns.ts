/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'frontend-react-patterns',
  description: 'React 19 patterns on the merchant UI — React Query defaults, HeroUI v3 components, client routing, custom hooks, navbar wiring, and theme integration.',
  tags: ["design","frontend","react","theming","ui"],
  sources: [
    'apps/client/src/app.tsx',
    'apps/client/src/provider.tsx',
    'apps/client/src/config/site.ts',
    'apps/client/src/components/navbar.tsx',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'The UI uses HeroUI v3 (not v2). Import from "@heroui/react". Use compound component syntax: <Dropdown.Trigger>, <Card.Header>, etc.',
    'Adding a new page requires three steps: (1) create the page component in apps/client/src/pages/; (2) add it to the router in app.tsx (wrap with AuthenticationGuard or AuthenticationGuardWithPermission if protected); (3) optionally add a navItem entry in apps/client/src/config/site.ts with a permissions[] array to control navbar visibility.',
    'The navbar (apps/client/src/components/navbar.tsx) reads siteConfig().navItems: public items (permissions: []) are always shown; the admin dropdown is wrapped with <AuthenticationGuardWithPermission permission="admin:store"> and only shows items whose permissions[] includes "admin:store".',
    'The ThemeSwitch component (apps/client/src/shared/ui/navigation/theme-switch.tsx) is already included in the navbar. Users can switch between light/dark and custom themes. Theme config is stored in the store_themes DB table.',
    'Feature folder structure: apps/client/src/features/<feature-name>/components/, hooks/, index.ts. Export public API from index.ts only.',
    'New React hooks go in apps/client/src/hooks/ if they are page-agnostic, or in the feature folder if feature-specific.',
    'The LoginModal component handles both email/passwordless and social login. Show it instead of redirecting when you want the user to stay on the current page after login.',
    'Reusable display components (apps/client/src/components/): ProductCard (compact list card), ProductCardFull (detail view with variant selector, tax info), ProductImage (square image with fallback and variant-count badge), ProductReviews (review list + gated write form), CategoryBentoGrid (category landing 5-tile bento layout), ProductCarousel (horizontal snap-scroll product strip).',
    'ImageUploadInput (apps/client/src/components/image-upload-input.tsx) handles the full image upload flow: file picker, WebP conversion, auto-select base64 vs R2 based on size, preview, manual URL input, thumbnail generation. Use it for any admin image field.',
    'apps/client/src/provider.tsx wraps the app with exactly four providers in order: StoreThemeProvider (custom theme) > Toast.Provider (HeroUI toasts) > CartProvider (cart context) > CartDrawerProvider (global cart drawer open/close state). Auth0Provider is NOT in provider.tsx — authentication is initialised in the auth feature module.',
    'CartDrawerProvider (apps/client/src/contexts/cart-drawer-context.tsx) exposes useCartDrawer() which returns { isOpen, open, close }. ProductCard and ProductCardFull call open() after addItem() to auto-open the cart drawer. DefaultLayout consumes isOpen/open/close to wire Navbar and CartDrawer.',
    'useSeoMeta (apps/client/src/hooks/use-seo-meta.ts) dynamically sets <title> and Open Graph meta tags. Used in ProductPage and any page that needs per-route SEO without react-helmet.',
  ],
  buildPrompt: (src) => appendFacts(`
Below are the React application entry files, site config, and navbar.

${src}

Task: Write a "Frontend React Patterns" guide.
Include:
1. React Router setup: how routes are declared, protected routes pattern with AuthenticationGuard.
2. How to add a new page: 3 steps (page component + router + siteConfig navItem).
3. How the navbar auto-shows/hides items based on Auth0 permissions.
4. HeroUI v3: compound component pattern, key components (Button, Card, Modal, Table, Form).
5. ThemeSwitch: what it does, how it\'s already wired in.
6. Feature folder structure and hook placement conventions.
7. A worked example: adding a "Product Tags" admin page end-to-end.
`, topic.manualFacts),
};

export default topic;
