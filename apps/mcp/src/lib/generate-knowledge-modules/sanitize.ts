// Copyright (c) 2024-2026 Ronan LE MEILLAT - SCTG Development
// License: AGPL-3.0-or-later

import { writeFileSync, chmodSync } from 'fs';
import { faker } from '@faker-js/faker';
import { nanoid } from 'nanoid';

/**
 * Mutable state containing the decrypted secrets to redact.
 * Arrays are passed by reference — mutations in generate.ts are visible here.
 */
export type SanitizerState = {
  decryptedAiKeys: string[];
  decryptedOwnerEmails: string[];
};

export type Sanitizer = {
  /** Replace sensitive values with stable synthetic placeholders. */
  sanitizeGeneratedContent: (content: string) => string;
  /** Return the original content if not gitignored, otherwise sanitize it. */
  getAiSafeContent: (
    relativePath: string,
    content: string,
    isGitignored: (path: string) => boolean,
  ) => string;
  /** Write a file after sanitizing its content. */
  writeGeneratedFile: (filePath: string, content: string) => void;
  /** Write an executable script file (chmod 755, no sanitization). */
  writeGeneratedScript: (filePath: string, content: string) => void;
};

/**
 * Create a content sanitizer bound to the provided mutable state.
 *
 * The sanitizer replaces decrypted AI keys and owner emails with stable
 * synthetic placeholders before any generated content is written or sent
 * to an AI API.  Because the state arrays are passed by reference, mutations
 * performed in generate.ts (e.g. by loadAiConfigOverride) are automatically
 * reflected in subsequent sanitize calls.
 *
 * @param state - Mutable arrays of secrets to redact.
 * @returns A bound set of sanitization and write helpers.
 */
export function createSanitizer(state: SanitizerState): Sanitizer {
  const aiKeyReplacements = new Map<string, string>();
  const ownerEmailReplacements = new Map<string, string>();

  function getAiKeyReplacement(key: string): string {
    if (!aiKeyReplacements.has(key)) {
      aiKeyReplacements.set(key, nanoid(16));
    }
    return aiKeyReplacements.get(key)!;
  }

  function getOwnerEmailReplacement(email: string): string {
    if (!ownerEmailReplacements.has(email)) {
      ownerEmailReplacements.set(email, faker.internet.email());
    }
    return ownerEmailReplacements.get(email)!;
  }

  function sanitizeGeneratedContent(content: string): string {
    let sanitized = content.replaceAll(
      'process.env.CLOUDFLARE_ACCOUNT_ID',
      '___cloudflare_account_id___',
    );

    const cloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (cloudflareAccountId) {
      sanitized = sanitized.split(cloudflareAccountId).join('___cloudflare_account_id___');
    }

    for (const key of state.decryptedAiKeys) {
      if (!key) continue;
      sanitized = sanitized.split(key).join(getAiKeyReplacement(key));
    }

    for (const email of state.decryptedOwnerEmails) {
      if (!email) continue;
      sanitized = sanitized.split(email).join(getOwnerEmailReplacement(email));
    }

    return sanitized;
  }

  function getAiSafeContent(
    relativePath: string,
    content: string,
    isGitignored: (path: string) => boolean,
  ): string {
    if (!isGitignored(relativePath)) return content;
    console.warn(
      `Warning: file "${relativePath}" is gitignored. Masking sensitive content for AI input.`,
    );
    return sanitizeGeneratedContent(content);
  }

  function writeGeneratedFile(filePath: string, content: string): void {
    writeFileSync(filePath, sanitizeGeneratedContent(content), 'utf8');
  }

  function writeGeneratedScript(filePath: string, content: string): void {
    writeFileSync(filePath, content, 'utf8');
    try {
      chmodSync(filePath, 0o755);
    } catch {
      // best-effort only; existing permissions may be preserved on some platforms.
    }
  }

  return { sanitizeGeneratedContent, getAiSafeContent, writeGeneratedFile, writeGeneratedScript };
}
