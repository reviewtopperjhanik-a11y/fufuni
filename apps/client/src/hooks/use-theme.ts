/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

// originally written by @imoaazahmed

import { useEffect, useMemo, useState } from "react";

import { THEME_UPDATED_EVENT } from "@/providers/theme-provider";

const ThemeProps = {
  key: "theme",
  light: "light",
  dark: "dark",
} as const;

/** Mirrors StoreThemeProvider's THEME_LS_KEY — keeps the two systems in sync. */
const STORE_THEME_KEY = "ui-theme";

type Theme = typeof ThemeProps.light | typeof ThemeProps.dark;

/**
 * Manages the application color theme (`"light"` | `"dark"`).
 *
 * The active theme is persisted in `localStorage` under the key `"theme"` and
 * applied as a CSS class on `document.documentElement`, making it compatible
 * with Tailwind CSS dark-mode class strategy.
 *
 * When a luxury theme variant is active (`data-theme="luxury-dark"` / `"luxury"`),
 * toggling also swaps the `data-theme` attribute so the two systems stay coherent
 * and the CSS cascade behaves correctly.
 *
 * @param defaultTheme - Initial theme to use when no stored preference is
 *   found. Defaults to `"light"`.
 * @returns An object with the current theme, boolean helpers (`isDark`,
 *   `isLight`), and setters (`setLightTheme`, `setDarkTheme`, `toggleTheme`).
 */
export const useTheme = (defaultTheme?: Theme) => {
  const [theme, setTheme] = useState<Theme>(() => {
    const storedTheme = localStorage.getItem(ThemeProps.key) as Theme | null;

    return storedTheme || (defaultTheme ?? ThemeProps.light);
  });

  const isDark = useMemo(() => theme === ThemeProps.dark, [theme]);
  const isLight = useMemo(() => theme === ThemeProps.light, [theme]);

  /**
   * Apply a theme to the DOM without updating React state.
   * Also syncs the `data-theme` attribute so luxury variants stay coherent:
   * `"luxury"` ↔ `"luxury-dark"` when toggling.
   */
  const _applyToDom = (newTheme: Theme) => {
    localStorage.setItem(ThemeProps.key, newTheme);
    document.documentElement.classList.remove(ThemeProps.light, ThemeProps.dark);
    document.documentElement.classList.add(newTheme);

    // Sync luxury data-theme variants with the new dark/light intent
    const currentDataTheme = document.documentElement.getAttribute("data-theme");
    let syncedDataTheme = currentDataTheme;

    if (
      newTheme === ThemeProps.dark &&
      currentDataTheme &&
      !currentDataTheme.endsWith("-dark") &&
      currentDataTheme !== "default"
    ) {
      // e.g. "luxury" → "luxury-dark"
      syncedDataTheme = `${currentDataTheme}-dark`;
    } else if (
      newTheme === ThemeProps.light &&
      currentDataTheme?.endsWith("-dark")
    ) {
      // e.g. "luxury-dark" → "luxury"
      syncedDataTheme = currentDataTheme.replace(/-dark$/, "");
    }

    if (syncedDataTheme !== currentDataTheme) {
      if (syncedDataTheme) {
        document.documentElement.setAttribute("data-theme", syncedDataTheme);
        localStorage.setItem(STORE_THEME_KEY, syncedDataTheme);
      } else {
        document.documentElement.removeAttribute("data-theme");
        localStorage.removeItem(STORE_THEME_KEY);
      }
      // Notify StoreThemeProvider and any useStoreTheme instance
      window.dispatchEvent(
        new CustomEvent(THEME_UPDATED_EVENT, { detail: syncedDataTheme }),
      );
    }
  };

  const _setTheme = (newTheme: Theme) => {
    _applyToDom(newTheme);
    setTheme(newTheme);
  };

  const setLightTheme = () => _setTheme(ThemeProps.light);
  const setDarkTheme = () => _setTheme(ThemeProps.dark);

  const toggleTheme = () =>
    theme === ThemeProps.dark ? setLightTheme() : setDarkTheme();

  // Apply to DOM on mount and whenever the theme state is updated
  // (_applyToDom only touches DOM globals — safe to omit from deps)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { _applyToDom(theme); }, [theme]);

  return { theme, isDark, isLight, setLightTheme, setDarkTheme, toggleTheme };
};
