#!/usr/bin/env tsx
/**
 * Add `tags` field to all topic files in apps/mcp/knowledge/topics/
 * Derives tags from slug + description using heuristic rules.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOPICS_DIR = join(__dirname, '../knowledge/topics');

// Tag derivation rules: if any pattern matches, add the corresponding tags
const TAG_RULES: Array<{ match: RegExp; tags: string[] }> = [
  { match: /migration/i, tags: ['database', 'migrations', 'schema'] },
  { match: /schema|durable.?object|sqlite/i, tags: ['database', 'schema', 'durable-object'] },
  { match: /route|hono|openapi/i, tags: ['backend', 'api', 'hono'] },
  { match: /auth0?|jwt|identity|credential/i, tags: ['auth', 'auth0', 'security'] },
  { match: /stripe|payment|checkout|refund|billing/i, tags: ['payments', 'stripe', 'checkout'] },
  { match: /webhook|event|notification/i, tags: ['webhooks', 'events'] },
  { match: /react|frontend|heroui|component|ui/i, tags: ['frontend', 'react', 'ui'] },
  { match: /i18n|locale|translation|language/i, tags: ['i18n', 'localization'] },
  { match: /email|mailgun|transactional/i, tags: ['email', 'mailgun'] },
  { match: /order|refund|purchase|customer/i, tags: ['orders', 'commerce'] },
  { match: /product|catalog|category/i, tags: ['catalog', 'products'] },
  { match: /inventory|warehouse|stock|availability/i, tags: ['inventory', 'warehouse'] },
  { match: /discount|pricing|tax|shipping|region/i, tags: ['pricing', 'commerce'] },
  { match: /review|rating|feedback|moderation|ai.?assisted/i, tags: ['reviews', 'ai', 'moderation'] },
  { match: /seed|fixture|test.?data|demo/i, tags: ['testing', 'data'] },
  { match: /ucp|ai.?agent|shopping/i, tags: ['ucp', 'ai-agents'] },
  { match: /invoice|pdf|document/i, tags: ['invoicing', 'documents'] },
  { match: /image|r2|storage|upload|file/i, tags: ['storage', 'images', 'cloudflare'] },
  { match: /theme|layout|design|styling/i, tags: ['theming', 'design'] },
  { match: /e2e|playwright|test|ci|github/i, tags: ['testing', 'ci'] },
  { match: /oauth|embedded|integration|api.?key/i, tags: ['api', 'integration'] },
  { match: /account|profile|preference|wishlist/i, tags: ['user', 'account'] },
  { match: /manifest|metric|observabilit|dashboard|analytics/i, tags: ['observability', 'metrics'] },
];

function deriveTags(slug: string, description: string): string[] {
  const haystack = `${slug} ${description}`.toLowerCase();
  const tags = new Set<string>();

  for (const rule of TAG_RULES) {
    if (rule.match.test(haystack)) {
      rule.tags.forEach((t) => tags.add(t));
    }
  }

  // Fallback: if no tags matched, add a generic tag based on area
  if (tags.size === 0) {
    if (slug.includes('route') || slug.includes('hono')) tags.add('backend');
    else if (slug.includes('react') || slug.includes('component')) tags.add('frontend');
    else tags.add('general');
  }

  return Array.from(tags).sort();
}

async function main() {
  const files = readdirSync(TOPICS_DIR)
    .filter((f) => f.endsWith('.ts'))
    .sort();

  console.log(`Processing ${files.length} topic files...`);

  for (const file of files) {
    const filePath = join(TOPICS_DIR, file);
    let content = readFileSync(filePath, 'utf8');

    // Skip if tags already present
    if (/^\s+tags:\s+\[/m.test(content)) {
      console.log(`  ✓ ${file} (already has tags)`);
      continue;
    }

    // Extract the slug (filename without .ts)
    const slug = file.replace(/\.ts$/, '');

    // Extract description from the topic definition
    const descMatch = content.match(/description:\s*['"]([^'"]+)['"]/);
    if (!descMatch) {
      console.error(`  ✗ ${file} — could not extract description`);
      continue;
    }

    const description = descMatch[1];
    const tags = deriveTags(slug, description);

    // Insert tags after description
    const replacement = `description: '${description}',\n  tags: ${JSON.stringify(tags)},`;
    const modified = content.replace(
      /description:\s*['"]([^'"]+)['"](,?)/,
      replacement + '$2',
    );

    if (modified === content) {
      console.error(`  ✗ ${file} — replacement failed`);
      continue;
    }

    writeFileSync(filePath, modified, 'utf8');
    console.log(`  ✓ ${file} — added tags: ${tags.join(', ')}`);
  }

  console.log('\nDone. All topic files updated.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
