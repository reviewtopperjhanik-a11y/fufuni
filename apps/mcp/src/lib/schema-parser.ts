// Copyright (c) 2024-2026 Ronan LE MEILLAT
// License: AGPL-3.0-or-later
//
// Simple SQL DDL parser — extracts CREATE TABLE and CREATE INDEX statements.
// Limited to pattern matching (no full SQL parser), but sufficient for documentation.

export type Column = {
  name: string;
  type: string;
  constraints: string;
};

export type Table = {
  name: string;
  columns: Column[];
  indexes: string[];
};

/**
 * Parse CREATE TABLE and CREATE INDEX statements from SQL/TypeScript source.
 * Returns a map of table name → {columns, indexes}.
 *
 * @param source - Source code containing SQL CREATE statements
 * @returns Record of table definitions
 */
export function parseSchema(source: string): Record<string, Table> {
  const tables: Record<string, Table> = {};

  // Match: CREATE TABLE [IF NOT EXISTS] "name" ( ... );
  const tableRegex =
    /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:")?(\w+)(?:")?\s*\(([\s\S]*?)\);/gi;

  let m: RegExpExecArray | null;
  while ((m = tableRegex.exec(source))) {
    const tableName = m[1];
    const body = m[2];
    const columns: Column[] = [];

    // Split by comma, but avoid splitting inside parentheses (for FK constraints)
    const parts = body.split(/,\s*(?![^()]*\))/g);

    for (const part of parts) {
      const line = part.trim();

      // Skip constraint lines (PRIMARY KEY, FOREIGN KEY, UNIQUE, etc.)
      if (!line || /^\s*(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|CONSTRAINT)\b/i.test(line)) {
        continue;
      }

      // Parse: NAME TYPE [constraints...]
      const tokens = line.split(/\s+/);
      if (tokens.length >= 2) {
        const name = tokens[0].replace(/["'`]/g, "");
        const type = tokens[1];
        const constraints = tokens.slice(2).join(" ");

        columns.push({
          name,
          type,
          constraints,
        });
      }
    }

    tables[tableName] = {
      name: tableName,
      columns,
      indexes: [],
    };
  }

  // Match: CREATE [UNIQUE] INDEX [IF NOT EXISTS] name ON table
  const indexRegex =
    /CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:")?(\w+)(?:")?\s+ON\s+(?:")?(\w+)(?:")?/gi;

  while ((m = indexRegex.exec(source))) {
    const indexName = m[1];
    const tableName = m[2];

    if (tables[tableName]) {
      tables[tableName].indexes.push(indexName);
    }
  }

  return tables;
}
