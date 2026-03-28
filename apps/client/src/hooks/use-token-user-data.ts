/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { useState, useEffect } from "react";

import { useAuth } from "@/authentication";

/**
 * Generic hook that manages a piece of state derived from the JWT access
 * token's user_metadata field.
 *
 * Handles:
 * 1. Initial load — reads the token on mount and on auth status changes.
 * 2. Cross-component sync — listens for a named CustomEvent so that any
 *    other component that dispatches the event (after a mutation) will
 *    immediately update all instances that share the same eventName.
 *
 * The mutation logic (add / remove / toggle) is intentionally left to the
 * caller because it differs between use-cases (wishlist vs saved-carts, etc.).
 *
 * @template T - Type of the data stored in user_metadata.
 * @param parseFromToken - Extract data of type T from a JWT string (pass null for the empty value).
 * @param eventName - CustomEvent name used for cross-component sync.
 */
export function useTokenUserData<T>(
  parseFromToken: (token: string | null) => T,
  eventName: string,
): {
  data: T;
  isLoading: boolean;
  isError: boolean;
  setData: (value: T) => void;
} {
  const auth = useAuth();
  const [data, setData] = useState<T>(() => parseFromToken(null));
  const [isLoading, setIsLoading] = useState<boolean>(auth.isAuthenticated);
  const [isError, setIsError] = useState<boolean>(false);

  // ── Initial load from token ──────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (!auth.isAuthenticated) {
        if (isMounted) {
          setData(parseFromToken(null));
          setIsLoading(false);
        }

        return;
      }

      try {
        const token = await auth.getAccessToken();

        if (isMounted) {
          setData(parseFromToken(token));
          setIsLoading(false);
        }
      } catch {
        if (isMounted) {
          setIsError(true);
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [auth.isAuthenticated, auth.getAccessToken]);

  // ── Cross-component sync via CustomEvent ─────────────────────────────
  useEffect(() => {
    const handleSync = (e: Event) => {
      setData((e as CustomEvent<T>).detail);
    };

    window.addEventListener(eventName, handleSync);

    return () => window.removeEventListener(eventName, handleSync);
  }, [eventName]);

  return { data, isLoading, isError, setData };
}
