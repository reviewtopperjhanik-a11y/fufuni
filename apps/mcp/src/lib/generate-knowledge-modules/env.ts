// Copyright (c) 2024-2026 Ronan LE MEILLAT - SCTG Development
// License: AGPL-3.0-or-later

import { existsSync, readFileSync } from 'fs';

/**
 * Load a simple env file without pulling in dotenv as a dependency.
 *
 * Values enclosed in single or double quotes are unquoted automatically.
 * Lines starting with # and empty lines are skipped.
 *
 * @param envPath - Absolute path to the .env file.
 * @returns Parsed key/value pairs from the file.
 */
export function loadDotenv(envPath: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync(envPath)) return env;
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}
