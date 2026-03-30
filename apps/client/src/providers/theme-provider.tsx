/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 *
 * StoreThemeProvider — fetches the active theme configuration from the backend
 * and applies it to the <html> element via data-theme + inline CSS variable overrides.
 *
 * The approach prioritises the CSS `data-theme` attribute (which activates a full
 * pre-compiled theme block from styles/themes/*.css) and falls back to individual
 * variable overrides for fine-grained tweaks stored in the DB.
 */

import type React from "react";
import { useEffect } from "react";

import { getApiBase } from "@/lib/api-base";

interface ThemeConfig {
  /** Corresponds to a [data-theme="..."] block defined in styles/themes/*.css */
  themeSlug?: string;
  /** Primary accent colour in oklch format — e.g. "oklch(15% 0 0)" */
  accentOklch?: string;
  /** Border radius preset */
  radius?: "none" | "sm" | "md" | "lg";
}

const RADIUS_MAP: Record<NonNullable<ThemeConfig["radius"]>, string> = {
  none: "0px",
  sm: "0.25rem",
  md: "0.5rem",
  lg: "1rem",
};

async function fetchThemeConfig(): Promise<ThemeConfig | null> {
  try {
    const base = getApiBase();
    if (!base) return null;
    const res = await fetch(`${base}/v1/theme/active`);
    if (!res.ok) return null;
    const data = await res.json();
    return JSON.parse(data.config_json) as ThemeConfig;
  } catch {
    return null;
  }
}

function applyConfig(config: ThemeConfig) {
  const root = document.documentElement;

  if (config.themeSlug) {
    root.setAttribute("data-theme", config.themeSlug);
    localStorage.setItem("ui-theme", config.themeSlug);
  }

  if (config.accentOklch) {
    root.style.setProperty("--accent", config.accentOklch);
  }

  if (config.radius) {
    const value = RADIUS_MAP[config.radius];
    root.style.setProperty("--radius", value);
    root.style.setProperty("--field-radius", value);
  }
}

export function StoreThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // Restore previously applied theme from localStorage immediately
    // to avoid a flash of unstyled content while the API request is in-flight.
    const stored = localStorage.getItem("ui-theme");
    if (stored) {
      document.documentElement.setAttribute("data-theme", stored);
    }

    // Then fetch the authoritative config from the backend.
    fetchThemeConfig().then((config) => {
      if (config) applyConfig(config);
    });
  }, []);

  return <>{children}</>;
}
