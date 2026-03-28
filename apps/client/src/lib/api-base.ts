/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

/**
 * Returns the API base URL resolved from environment variables.
 * Tries API_BASE_URL first (standard Vite-exposed var), then the
 * legacy VITE_API_BASE_URL injected at build-time via (import.meta as any).env.
 */
export function getApiBase(): string {
  return (
    import.meta.env.API_BASE_URL ||
    (import.meta as any).env?.VITE_API_BASE_URL ||
    ""
  );
}
