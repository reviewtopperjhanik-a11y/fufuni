// Copyright (c) 2024-2026 Ronan LE MEILLAT - SCTG Development
// License: AGPL-3.0-or-later

import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import type { Topic } from '../../knowledge/base.js';

/**
 * Dynamically import all *.ts files from a topics directory.
 *
 * Files are sorted alphabetically. Each file must export a default Topic
 * object with at least a `name` property.  Invalid or unloadable files are
 * logged and skipped rather than aborting the whole run.
 *
 * @param topicsDir - Absolute path to the topics directory.
 * @returns An array of Topic objects exported by the discovered files.
 */
export async function loadTopics(topicsDir: string): Promise<Topic[]> {
  if (!existsSync(topicsDir)) {
    console.warn(`  [warn] topics/ directory not found at ${topicsDir}`);
    return [];
  }

  const files = readdirSync(topicsDir)
    .filter((f) => f.endsWith('.ts'))
    .sort();

  const topics: Topic[] = [];
  for (const file of files) {
    const filePath = join(topicsDir, file);
    try {
      const mod = await import(pathToFileURL(filePath).href);
      if (!mod.default || typeof mod.default !== 'object' || !mod.default.name) {
        console.warn(
          `  [warn] ${file} does not export a valid default Topic object — skipped.`,
        );
        continue;
      }
      topics.push(mod.default as Topic);
    } catch (err) {
      console.error(
        `  [error] Failed to load topic file ${file}: ${(err as Error).message}`,
      );
    }
  }
  return topics;
}
