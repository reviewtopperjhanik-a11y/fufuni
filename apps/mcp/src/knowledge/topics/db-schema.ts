/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'db-schema',
  description: 'Complete Durable Object SQL schema — every table, column, index and foreign key used by the Fufuni backend.',
  tags: ["database","durable-object","schema"],
  sources: [
    'apps/merchant/src/do.ts',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'The Durable Object executes SQL synchronously via `this.sql.exec()` but incoming calls from the Worker are asynchronous (fetch-based RPC via MERCHANT binding).',
    'Migrations are tracked via the SQL `migrations` table (columns: name TEXT PK, applied_at TEXT). There is NO storage.put("db_version") pattern — all migration state lives in the DB itself.',
    'ensureInitialized() first runs the SCHEMA DDL, then iterates an inline array of { name, sql } migration objects and inserts their name into the migrations table once applied.',
    'Fufuni does NOT use Drizzle ORM or any query builder. All queries are raw SQL strings passed to db.query<T>(sql, params) or db.run(sql, params) from the getDb() helper.',
    'Per-user theme is stored in Auth0 user_metadata (JWT custom claim), NOT in the store_themes DB table. The store_themes table holds merchant-level default theme configuration.',
    'getDb(c.var.db) returns a Database object with query<T>(sql, params?): Promise<T[]> and run(sql, params?): Promise<{changes}> — both proxy to the Durable Object via RPC.',
    'Migration 034 added currency, reason (duplicate|fraudulent|requested_by_customer), notes, and updated_at to the existing refunds table. The refunds table now fully tracks partial refunds with audit trail.',
    'Migration 035 added variant_type (physical|digital|ai_tokens) and ai_token_units columns to the variants table, and created three new tables: digital_assets (per-variant download metadata), ai_token_balances (customer AI token wallet), and ai_token_transactions (debit/credit ledger).',
    'digital_assets table: id, variant_id (FK→variants), file_key (R2 object key or null), file_url (external URL or null), filename, content_type, created_at, updated_at. One row per digital variant.',
    'ai_token_balances table: id, customer_id (FK→customers), api_key (TEXT UNIQUE), balance INTEGER, created_at, updated_at. One row per customer per API key.',
    'ai_token_transactions table: id, customer_id (FK→customers), order_id (FK→orders), api_key TEXT, delta INTEGER, reason TEXT, created_at.',
  ],
  buildPrompt: (src) => appendFacts(`
Below is the source of the Durable Object class (do.ts).  It contains the SCHEMA
constant with the full DDL for all SQLite tables, and the ensureInitialized() method
that applies runtime migrations.

${src}

Task: Write a "Database Schema Reference" document.
Include:
1. A brief explanation of how the Durable Object pattern works (SCHEMA + ensureInitialized).
2. For every table found in the DDL, produce a sub-section "### tableName" with:
   - Column list (name | type | notes) as a table.
   - Any relevant indexes or constraints.
3. An "Entity Relationship" section with a plain-text ERD showing which tables
   reference others via foreign keys.
Do not include any DDL code — summarise in tables and prose only.
`, topic.manualFacts),
};

export default topic;
