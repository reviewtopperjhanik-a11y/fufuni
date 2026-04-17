/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'how-to-add-migration',
  description: 'Step-by-step guide: add a DB migration to do.ts + SQL file',
  sources: [
    'apps/merchant/src/do.ts',
    'apps/merchant/migrations/027-categories.sql',
    'apps/merchant/migrations/028_product_reviews.sql',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'Every schema change MUST be applied in three places: (1) the SCHEMA constant in do.ts — full DDL with CREATE TABLE IF NOT EXISTS; (2) a migration block in ensureInitialized() in do.ts that uses a migrations table to track what has already been applied; (3) a numbered SQL file in apps/merchant/migrations/ for forward-compatibility tooling.',
    'Migration files are named NNN-description.sql where NNN is a zero-padded 3-digit integer (e.g. 034-add-tags.sql). The current highest migration is 034.',
    'The migration record name stored in the migrations table must match the SQL file stem exactly (e.g. "033-order-email-settings-add-pending-paid").',
    'ensureInitialized() is synchronous (no await) because Durable Object SQL is synchronous. Use this.sql.exec() directly, not db.run().',
    'Always use IF NOT EXISTS on CREATE TABLE and CREATE INDEX to make migrations idempotent.',
    'Column types: use TEXT for UUIDs and ISO dates, INTEGER for booleans (0/1) and cents, REAL for percentages and ratings.',
    'Migrations are **idempotent by design** — `ensureInitialized()` never re‑applies a migration already recorded in the `migrations` table.',
    'Never retroactively modify a migration that has already been deployed to production — always create a new migration instead.',
  ],
  buildPrompt: (src) => appendFacts(`
Below are:
1. The do.ts file showing the ensureInitialized() migration pattern.
2. Two example migration SQL files (027 and 028).

${src}

Task: Write a "How to Add a Database Migration" guide.
Include:
1. When to use a migration (vs editing the SCHEMA constant directly).
2. Exact numbered steps:
   a. Create the SQL file in apps/merchant/migrations/ with the correct numbering convention.
   b. Add the migration block in ensureInitialized() inside do.ts (show the exact code template with comments).
   c. Add the full DDL to the SCHEMA constant in do.ts.
3. A complete worked example creating a hypothetical "tags" table (all 3 files).
4. Common pitfalls (IF NOT EXISTS, idempotency, column types, migration name must match file stem).
`, topic.manualFacts),
};

export default topic;
