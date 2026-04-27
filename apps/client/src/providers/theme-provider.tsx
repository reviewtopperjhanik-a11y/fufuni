/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 *
 * StoreThemeProvider — applies the active theme to the <html> element.
 *
 * - Authenticated users: theme is stored in Auth0 user_metadata (store-scoped)
 *   and read from the JWT access token. Mutations go via PATCH /v1/me/preferences.
 * - Unauthenticated users: theme is persisted in localStorage.
 *
 * Cross-component sync is handled by a CustomEvent (THEME_UPDATED_EVENT) so that
 * any component that calls setTheme() immediately updates all other instances.
 */

import type React from "react";
import { useCallback, useEffect } from "react";
import { decodeJwt } from "jose";

import { useAuth } from "@/authentication";
import { useTokenRefresh } from "@/hooks/use-token-refresh";
import { useTokenUserData } from "@/hooks/use-token-user-data";
import { getStoreMetadata } from "@/lib/store-metadata";
import { getApiBase } from "@/lib/api-base";

// ── Constants ────────────────────────────────────────────────────────────────

/** localStorage key for the current theme slug */
const THEME_LS_KEY = "ui-theme";

/** CustomEvent name used for cross-component sync */
export const THEME_UPDATED_EVENT = "fufuni:theme-updated";

/** Store URL for scoped metadata — must match the backend STORE_URL env var */
const STORE_URL = import.meta.env.STORE_URL;

/**
 * All supported theme slugs.
 * `default` means no data-theme attribute (built-in HeroUI baseline).
 */
export const AVAILABLE_THEMES = ["default", "luxury", "luxury-dark"] as const;
export type ThemeSlug = (typeof AVAILABLE_THEMES)[number];

// ── Theme application ─────────────────────────────────────────────────────────

/**
 * Apply a theme slug to the document root.
 * Passing `null` or `"default"` removes the data-theme attribute.
 */
function applyTheme(slug: string | null) {
  const root = document.documentElement;

  if (!slug || slug === "default") {
    root.removeAttribute("data-theme");
    localStorage.removeItem(THEME_LS_KEY);
  } else {
    root.setAttribute("data-theme", slug);
    localStorage.setItem(THEME_LS_KEY, slug);
  }
}

// ── JWT parser ────────────────────────────────────────────────────────────────

/**
 * Extract the theme slug from the JWT access token's user_metadata.
 * Returns `null` if no theme is stored or the token is invalid.
 */
export function getThemeFromToken(token: string | null): string | null {
  if (!token) return null;
  try {
    const payload = decodeJwt(token) as any;
    const userMetadata = payload["extra_user_info/user_metadata"];
    const storeMetadata = getStoreMetadata(userMetadata, STORE_URL);

    return storeMetadata?.theme ?? userMetadata?.theme ?? null;
  } catch {
    return null;
  }
}

// ── useStoreTheme ─────────────────────────────────────────────────────────────

export interface UseStoreThemeReturn {
  /** Currently active theme slug, or null for the default */
  theme: string | null;
  isLoading: boolean;
  /** Change the active theme. Persists to API (auth) or localStorage (guest). */
  setTheme: (slug: string | null) => Promise<void>;
}

/**
 * Hook to read and set the current store theme.
 *
 * Must be called inside an `AuthenticationProvider` context.
 * Theme changes are broadcast via `THEME_UPDATED_EVENT` so that
 * `StoreThemeProvider` (which may live outside the auth tree) can
 * apply them to the DOM.
 */
export function useStoreTheme(): UseStoreThemeReturn {
  const auth = useAuth();
  const { refreshToken } = useTokenRefresh();
  const apiBase = getApiBase();

  const {
    data: theme,
    isLoading,
    setData: setThemeData,
  } = useTokenUserData(getThemeFromToken, THEME_UPDATED_EVENT);

  // Once auth + token are ready, broadcast the JWT-derived theme so
  // StoreThemeProvider (outside the auth tree) can apply it to the DOM.
  useEffect(() => {
    if (!isLoading && auth.isAuthenticated && theme) {
      window.dispatchEvent(
        new CustomEvent(THEME_UPDATED_EVENT, { detail: theme }),
      );
    }
  }, [isLoading, auth.isAuthenticated, theme]);

  const setTheme = useCallback(
    async (slug: string | null) => {
      const normalized = !slug || slug === "default" ? null : slug;

      if (auth.isAuthenticated) {
        // Optimistic update: apply immediately for a responsive UI
        setThemeData(normalized);
        window.dispatchEvent(
          new CustomEvent(THEME_UPDATED_EVENT, { detail: normalized }),
        );

        try {
          await auth.patchJson(`${apiBase}/v1/me/preferences`, {
            theme: normalized ?? "",
          });
          const newToken = await refreshToken();
          const newTheme = getThemeFromToken(newToken ?? null);

          // Reconcile with server-confirmed value
          setThemeData(newTheme);
          if (newTheme !== normalized) {
            window.dispatchEvent(
              new CustomEvent(THEME_UPDATED_EVENT, { detail: newTheme }),
            );
          }
        } catch (err) {
          console.error("[useStoreTheme] Failed to persist theme:", err);
          // Keep the optimistic state; theme will re-sync on next token refresh
        }
      } else {
        // Guest: persist to localStorage and broadcast
        setThemeData(normalized);
        window.dispatchEvent(
          new CustomEvent(THEME_UPDATED_EVENT, { detail: normalized }),
        );
      }
    },
    [auth, apiBase, refreshToken, setThemeData],
  );

  return { theme, isLoading, setTheme };
}

// ── StoreThemeProvider ────────────────────────────────────────────────────────

/**
 * Thin provider that applies the active theme to the DOM.
 *
 * On mount it reads the last known theme from localStorage (to avoid a flash
 * of unstyled content). It then listens for THEME_UPDATED_EVENT so that
 * `useStoreTheme` changes are reflected immediately across the whole page,
 * even though this provider lives *outside* the AuthenticationProvider tree.
 */
export function StoreThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // Restore cached theme immediately to avoid a flash of unstyled content.
    const stored = localStorage.getItem(THEME_LS_KEY);

    if (stored) {
      document.documentElement.setAttribute("data-theme", stored);
    }

    const handleThemeUpdate = (e: Event) => {
      applyTheme((e as CustomEvent<string | null>).detail);
    };

    window.addEventListener(THEME_UPDATED_EVENT, handleThemeUpdate);

    return () => window.removeEventListener(THEME_UPDATED_EVENT, handleThemeUpdate);
  }, []);

  return <>{children}</>;
}
