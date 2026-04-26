// Copyright (c) 2024-2026 Ronan LE MEILLAT - SCTG Development
// License: AGPL-3.0-or-later

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

type GitignorePattern = {
  raw: string;
  negative: boolean;
  directoryOnly: boolean;
  anchored: boolean;
  hasSlash: boolean;
  regex: RegExp;
};

/** Module-level cache keyed by absolute directory path. */
const gitignoreCache = new Map<string, GitignorePattern[]>();

/**
 * Escape special regex characters in a string.
 *
 * @param value - The string to escape.
 * @returns The escaped string safe for inclusion in a RegExp.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convert a gitignore-style pattern into a regular expression.
 *
 * @param pattern - The gitignore pattern text.
 * @param anchored - Whether the pattern is anchored to the current directory.
 * @param directoryOnly - Whether the pattern matches directories only.
 * @param hasSlash - Whether the pattern includes a slash.
 * @returns A RegExp that matches paths affected by the pattern.
 */
function gitignorePatternToRegex(
  pattern: string,
  anchored: boolean,
  directoryOnly: boolean,
  hasSlash: boolean,
): RegExp {
  let regex = '^';
  const escaped = pattern.split('**').map(escapeRegExp).join('.*');
  const withWildcards = escaped.replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');

  if (anchored || hasSlash) {
    regex += withWildcards;
  } else {
    regex += '(.*/)?' + withWildcards + '($|/.*)';
  }

  if (directoryOnly) {
    if (!regex.endsWith('(/.*) ')) {
      regex += '(/.*)?';
    }
  }

  regex += '$';
  return new RegExp(regex);
}

/**
 * Parse the contents of a .gitignore file into matchable patterns.
 *
 * @param content - The raw text of a .gitignore file.
 * @returns Parsed gitignore patterns with matching metadata.
 */
function parseGitignorePatterns(content: string): GitignorePattern[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((raw) => {
      let line = raw;
      const negative = line.startsWith('!');
      if (negative) line = line.slice(1);
      const directoryOnly = line.endsWith('/');
      if (directoryOnly) line = line.slice(0, -1);
      const anchored = line.startsWith('/');
      if (anchored) line = line.slice(1);
      const hasSlash = line.includes('/');
      const regex = gitignorePatternToRegex(line, anchored, directoryOnly, hasSlash);
      return { raw, negative, directoryOnly, anchored, hasSlash, regex };
    });
}

/**
 * Load and cache .gitignore patterns for a directory.
 *
 * @param dir - The absolute path to the directory.
 * @returns Parsed patterns from the .gitignore file, or an empty array.
 */
function loadGitignorePatterns(dir: string): GitignorePattern[] {
  if (gitignoreCache.has(dir)) return gitignoreCache.get(dir)!;
  const patterns: GitignorePattern[] = [];
  const gitignorePath = join(dir, '.gitignore');
  if (existsSync(gitignorePath)) {
    patterns.push(...parseGitignorePatterns(readFileSync(gitignorePath, 'utf8')));
  }
  gitignoreCache.set(dir, patterns);
  return patterns;
}

/**
 * Determine whether a path is ignored by any .gitignore file in its ancestry.
 *
 * @param relativePath - A path relative to the repository root.
 * @param rootDir - The absolute repository root directory.
 * @returns True when the file is matched by .gitignore patterns.
 */
export function isGitignored(relativePath: string, rootDir: string): boolean {
  const normalizedPath = relativePath.split('\\').join('/');
  const pathSegments = normalizedPath.split('/');
  const dirs = [''];
  for (let i = 0; i < pathSegments.length - 1; i++) {
    dirs.push(dirs[i] ? `${dirs[i]}/${pathSegments[i]}` : pathSegments[i]);
  }

  let ignored = false;
  for (const dirRel of dirs) {
    const dir = dirRel ? join(rootDir, dirRel) : rootDir;
    const patterns = loadGitignorePatterns(dir);
    const relativeToGitignore = dirRel ? normalizedPath.slice(dirRel.length + 1) : normalizedPath;
    for (const pattern of patterns) {
      if (pattern.regex.test(relativeToGitignore)) {
        ignored = !pattern.negative;
      }
    }
  }
  return ignored;
}
