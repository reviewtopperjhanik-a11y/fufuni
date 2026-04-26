// Copyright (c) 2024-2026 Ronan LE MEILLAT
// License: AGPL-3.0-or-later

import type { Topic } from '../../knowledge/base.js';

export type HeaderMeta = {
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  manualFactsChecksum?: string;
  sourcesChecksum?: string;
  sourceFileHashes?: Record<string, string>;
  apiEndpoint?: string;
};

export type GeneratedChunk = {
  id: string;
  topic: string;
  heading: string;
  heading_path: string[];
  text: string;
  word_count: number;
};

export type Bm25Doc = {
  id: string;
  terms: string[];
};

export type TopicManifest = {
  generated_at: string;
  commit: string;
  manifest_version: '1.0.0';
  topics: Array<{
    slug: string;
    title: string;
    description: string;
    tags: string[];
    updated_at: string;
    word_count: number;
    sources_checksum: string;
  }>;
};

export type EmbeddingResult = {
  vector: number[];
  connection: 'direct' | 'gateway' | null;
  stats: Array<{
    key: string;
    owner: string;
    nbTry: number;
    nbSuccess: number;
    nbFail: number;
  }>;
};

export type CallAiOptions = {
  apiUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  fetch?: typeof fetch;
  abortSignal?: AbortSignal;
  verbose?: boolean;
  showKeyOwner?: boolean;
  keyOwner?: string;
  /** Cloudflare AI Gateway bearer token. When set, adds the cf-aig-authorization header. */
  aigToken?: string;
};

export type ApiKeyWithOwner = {
  key: string;
  owner: string;
};

export type TopicChecksumResult = {
  manualFactsChecksum: string;
  sourcesChecksum: string;
  sourceFileHashes: Record<string, string>;
};

export type OfflineRequestMeta = {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  model: string;
  isAnthropic: boolean;
  isGemini: boolean;
  usesApiKeyInUrl: boolean;
  includeAigHeader: boolean;
  apiKey: string;
  aigToken?: string;
};

/** Shape returned by GET /openai/v1/models on Groq and other OAI-compatible APIs. */
export type GroqModel = {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
  active: boolean;
  context_window: number;
  max_completion_tokens?: number;
};
