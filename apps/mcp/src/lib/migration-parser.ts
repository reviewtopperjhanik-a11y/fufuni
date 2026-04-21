// Copyright (c) 2024-2026 Ronan LE MEILLAT
// License: AGPL-3.0-or-later
//
// Migration file parser — extracts migration metadata from SQL filenames.

export type MigrationInfo = {
  id: string;
  name: string;
  description: string;
  file_path: string;
  sql_preview?: string;
};

/**
 * Parse migration filename and content.
 * Expected format: NNN-description.sql (e.g., 034-add-refunds-audit.sql)
 *
 * @param filePath - Repo-relative path (e.g., apps/merchant/migrations/034-add-refunds-audit.sql)
 * @param content - SQL content (optional, used for preview)
 * @returns Migration metadata
 */
export function parseMigration(filePath: string, content?: string): MigrationInfo {
  // Extract filename (last part after /)
  const filename = filePath.split("/").pop() || "";
  
  // Match: NNN-description.sql
  const match = filename.match(/^(\d+)-(.+)\.sql$/i);
  
  if (!match) {
    return {
      id: filename,
      name: filename,
      description: "Unknown migration",
      file_path: filePath,
    };
  }

  const [, id, desc] = match;
  
  // Build preview: first 200 chars of SQL, stripped comments
  let preview = "";
  if (content) {
    const lines = content.split("\n")
      .filter(l => !l.trim().startsWith("--"))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    preview = lines.substring(0, 200) + (lines.length > 200 ? "…" : "");
  }

  return {
    id,
    name: `${id}-${desc}`,
    description: desc.replace(/-/g, " "),
    file_path: filePath,
    sql_preview: preview || undefined,
  };
}

/**
 * Extract migrations from a list of file paths.
 * Filters to only .sql files in migrations directories.
 *
 * @param files - Array of {path, content?}
 * @returns Array of migration metadata, sorted by ID descending
 */
export function extractMigrations(
  files: Array<{ path: string; content?: string }>,
): MigrationInfo[] {
  const migrations: MigrationInfo[] = [];

  for (const { path, content } of files) {
    // Only consider migration directories
    if (!/migrations\/\d{3}-.*\.sql$/.test(path)) {
      continue;
    }

    migrations.push(parseMigration(path, content));
  }

  // Sort by ID descending (newest first)
  return migrations.sort((a, b) => parseInt(b.id, 10) - parseInt(a.id, 10));
}
