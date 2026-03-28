/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { useCallback } from 'react';
import { decodeJwt } from 'jose';
import { useAuth } from '@/authentication';
import { useTokenRefresh } from '@/hooks/use-token-refresh';
import { getStoreMetadata } from '@/lib/store-metadata';
import { useTokenUserData } from '@/hooks/use-token-user-data';
import { getApiBase } from '@/lib/api-base';

/**
 * SavedCartSnapshot — Complete cart snapshot stored in Auth0 user_metadata
 * Allows reconstruction of cart without database fetch
 */
export interface SavedCartSnapshot {
  id: string;
  items: Array<{
    sku: string;
    title: string;
    qty: number;
    unit_price_cents: number;
  }>;
  totals: {
    subtotal_cents: number;
    discount_cents: number;
    shipping_cents: number;
    tax_cents: number;
    total_cents: number;
  };
  currency: string;
  customer_email: string;
  status: 'open' | 'checked_out' | 'expired';
  expires_at: string;
  saved_at: string;
}

export interface UseSavedCartsReturn {
  savedCarts: (SavedCartSnapshot | string)[]; // Support both new snapshots and legacy IDs
  isLoading: boolean;
  isError: boolean;
  toggleSavedCart: (cartId: string) => Promise<void>;
  isSaved: (cartId: string) => boolean;
  getSavedCart: (cartId: string) => SavedCartSnapshot | undefined;
}

const SAVED_CARTS_UPDATED_EVENT = 'fufuni:saved-carts-updated';

/**
 * Lightweight token parser function.
 * Extracts saved carts from the user_metadata of the JWT access_token.
 */
const STORE_URL = import.meta.env.STORE_URL;

export function getSavedCartsFromToken(token: string | null): (SavedCartSnapshot | string)[] {
  if (!token) return [];
  try {
    const payload = decodeJwt(token) as any;
    const userMetadata = payload['extra_user_info/user_metadata'];
    const storeMetadata = getStoreMetadata(userMetadata, STORE_URL);

    // Support both new snapshot format and legacy string ID format
    if (Array.isArray(storeMetadata?.saved_carts)) {
      return storeMetadata.saved_carts;
    }

    // fallback to legacy root key for backward compatibility
    if (Array.isArray(userMetadata?.saved_carts)) {
      return userMetadata.saved_carts;
    }

    return [];
  } catch (error) {
    console.error('[useSavedCarts] Error decoding token for saved carts:', error);
    return [];
  }
}

/**
 * Custom React hook to manage the user's saved carts.
 * 
 * Features:
 * - Extremely lightweight: 100% derived from the JWT user_metadata
 * - Stores complete cart snapshots (items, totals) for offline reconstruction
 * - Uses `useTokenRefresh` to keep JWT synced after mutations
 * - Uses a CustomEvent for fast cross-component reactivity without heavy contexts/query caches
 */
export function useSavedCarts(): UseSavedCartsReturn {
  const auth = useAuth();
  const { refreshToken } = useTokenRefresh();
  const apiBase = getApiBase();

  const {
    data: savedCarts,
    isLoading,
    isError,
    setData: setSavedCarts,
  } = useTokenUserData(getSavedCartsFromToken, SAVED_CARTS_UPDATED_EVENT);

  const toggleSavedCart = useCallback(
    async (cartId: string) => {
      if (!auth.isAuthenticated) {
        console.warn('[useSavedCarts] Attempted to toggle without authentication');
        return;
      }

      const saved = savedCarts.some(sc => {
        if (typeof sc === 'string') return sc === cartId;
        return (sc as SavedCartSnapshot).id === cartId;
      });

      try {
        if (saved) {
          await auth.deleteJson(`${apiBase}/v1/me/saved-carts/${cartId}`);
        } else {
          await auth.postJson(`${apiBase}/v1/me/saved-carts`, { cartId });
        }

        const newToken = await refreshToken();
        const newSavedCarts = getSavedCartsFromToken(newToken || null);

        setSavedCarts(newSavedCarts);
        window.dispatchEvent(new CustomEvent(SAVED_CARTS_UPDATED_EVENT, { detail: newSavedCarts }));
      } catch (error) {
        console.error('[useSavedCarts] Mutation error:', error);
      }
    },
    [auth, refreshToken, savedCarts, apiBase]
  );

  const isSaved = useCallback(
    (cartId: string) => savedCarts.some(sc => {
      if (typeof sc === 'string') return sc === cartId;
      return (sc as SavedCartSnapshot).id === cartId;
    }),
    [savedCarts]
  );

  const getSavedCart = useCallback(
    (cartId: string) => savedCarts.find(sc => {
      if (typeof sc === 'string') return false;
      return (sc as SavedCartSnapshot).id === cartId;
    }) as SavedCartSnapshot | undefined,
    [savedCarts]
  );

  return {
    savedCarts,
    isLoading,
    isError,
    toggleSavedCart,
    isSaved,
    getSavedCart,
  };
}
