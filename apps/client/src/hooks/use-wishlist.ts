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

export interface UseWishlistReturn {
  wishlist: string[];
  isLoading: boolean;
  isError: boolean;
  toggle: (productId: string) => Promise<void>;
  isFavorite: (productId: string) => boolean;
}

const WISHLIST_UPDATED_EVENT = 'fufuni:wishlist-updated';

/**
 * Lightweight token parser function.
 * Extracts wishlist from the user_metadata of the JWT access_token.
 */
const STORE_URL = import.meta.env.STORE_URL;

export function getWishlistFromToken(token: string | null): string[] {
  if (!token) return [];
  try {
    const payload = decodeJwt(token) as any;
    const userMetadata = payload['extra_user_info/user_metadata'];
    const storeMetadata = getStoreMetadata(userMetadata, STORE_URL);

    if (Array.isArray(storeMetadata?.wishlist)) {
      return storeMetadata.wishlist;
    }

    // fallback to legacy root key for backward compatibility
    if (Array.isArray(userMetadata?.wishlist)) {
      return userMetadata.wishlist;
    }

    return [];
  } catch (error) {
    console.error('[useWishlist] Error decoding token for wishlist:', error);
    return [];
  }
}

/**
 * Custom React hook to manage the user's wishlist (favorites).
 * 
 * Features:
 * - Extremely lightweight: 100% derived from the JWT user_metadata
 * - Uses `useTokenRefresh` to keep JWT synced after mutations
 * - Uses a CustomEvent for fast cross-component reactivity without heavy contexts/query caches
 */
export function useWishlist(): UseWishlistReturn {
  const auth = useAuth();
  const { refreshToken } = useTokenRefresh();
  const apiBase = getApiBase();

  const {
    data: wishlist,
    isLoading,
    isError,
    setData: setWishlist,
  } = useTokenUserData(getWishlistFromToken, WISHLIST_UPDATED_EVENT);

  const toggle = useCallback(
    async (productId: string) => {
      if (!auth.isAuthenticated) {
        console.warn('[useWishlist] Attempted to toggle without authentication');
        return;
      }

      const isFav = wishlist.includes(productId);

      try {
        if (isFav) {
          await auth.deleteJson(`${apiBase}/v1/me/wishlist/${productId}`);
        } else {
          await auth.postJson(`${apiBase}/v1/me/wishlist`, { productId });
        }

        const newToken = await refreshToken();
        const newWishlist = getWishlistFromToken(newToken || null);

        setWishlist(newWishlist);
        window.dispatchEvent(new CustomEvent(WISHLIST_UPDATED_EVENT, { detail: newWishlist }));
      } catch (error) {
        console.error('[useWishlist] Mutation error:', error);
      }
    },
    [auth, refreshToken, wishlist, apiBase]
  );

  const isFavorite = useCallback(
    (productId: string) => wishlist.includes(productId),
    [wishlist]
  );

  return {
    wishlist,
    isLoading,
    isError,
    toggle,
    isFavorite,
  };
}
