/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'user-preferences-and-wishlist',
  description: 'Wishlist via Auth0 user_metadata, saved carts, user preference hooks',
  sources: [
    'apps/client/src/hooks/use-wishlist.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'Wishlist is stored in Auth0 user_metadata (not a SQL table). Key: "wishlist", value: string[] of product IDs.',
    'useWishlist() returns: { wishlist, isLoading, addToWishlist, removeFromWishlist, isInWishlist, toggleWishlist }.',
    'useWishlist() requires the user to be authenticated. Call isInWishlist(productId) before showing the wishlist button state.',
    'Wishlist mutations call PATCH /api/v2/users/:userId/metadata on the Auth0 Management API via the getAuth0ManagementToken() helper from useSecuredApi(). The token is cached in memory for 60 s.',
    'Saved carts are stored in the saved_carts SQL table (not user_metadata). One saved cart per user. Endpoints: GET /v1/me/saved-cart, PUT /v1/me/saved-cart (upsert), DELETE /v1/me/saved-cart.',
    'The CartProvider (apps/client/src/contexts/cart-context.tsx) auto-loads the saved cart from the API when the user logs in, and auto-saves on change (debounced 2 s).',
    'User preferences (locale, currency display) are stored in the user_preferences table. GET /v1/me/preferences, PUT /v1/me/preferences. Requires customerAuthMiddleware.',
  ],
  buildPrompt: (src) => appendFacts(`
Below is use-wishlist.ts.

${src}

Task: Write a "User Preferences & Wishlist Reference".
Include:
1. Wishlist storage: where data lives (Auth0 user_metadata), why not a SQL table.
2. useWishlist() hook: all return values, usage example with heart-button toggle.
3. Auth0 Management API call: how the token is obtained and cached.
4. Saved cart: storage location, endpoints, auto-save behaviour.
5. CartProvider integration with saved-cart API.
6. User preferences: endpoints, what fields are stored.
`, topic.manualFacts),
};

export default topic;
