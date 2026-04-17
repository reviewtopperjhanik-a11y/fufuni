#!/usr/bin/env tsx
/**
 * Fix syntax errors in topics where tags were added with extra commas.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOPICS_DIR = join(__dirname, '../knowledge/topics');

async function main() {
  const files = readdirSync(TOPICS_DIR)
    .filter((f) => f.endsWith('.ts'))
    .sort();

  console.log(`Fixing syntax errors in ${files.length} files...`);

  for (const file of files) {
    const filePath = join(TOPICS_DIR, file);
    let content = readFileSync(filePath, 'utf8');

    // Fix double commas: `tags: [...],,,` → `tags: [...],`
    const fixed = content.replace(/tags:\s*\[([^\]]*)\],,/g, 'tags: [$1],');

    if (fixed !== content) {
      writeFileSync(filePath, fixed, 'utf8');
      console.log(`  ✓ ${file} — fixed double commas`);
    }
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
