#!/usr/bin/env tsx
/// <reference types="node" />
/**
 * Evaluate recall@5 on the Phase 2 eval-queries.json test set.
 *
 * Usage:
 *   npx tsx apps/mcp/scripts/eval-recall.ts
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');

// Import generated search indexes
import { BM25_INDEX } from '../src/search/bm25-index.js';
import { CHUNKS } from '../src/search/chunks.js';
import { Bm25Index, tokenise } from '../src/search/bm25.js';

// Load eval queries
const evalQueriesPath = join(__dirname, '../tests/fixtures/eval-queries.json');
const evalQueries = JSON.parse(readFileSync(evalQueriesPath, 'utf8')) as Array<{
  query: string;
  relevant_topics: string[];
}>;

// Initialize BM25 index
const bm25 = new Bm25Index(BM25_INDEX.docs);

// Evaluate
interface Result {
  query: string;
  relevant_topics: string[];
  retrieved_topics: string[];
  is_hit: boolean;
}

const results: Result[] = [];

console.log(`Evaluating recall@5 on ${evalQueries.length} queries...\n`);

for (const { query, relevant_topics } of evalQueries) {
  const tokens = tokenise(query);
  const hits = bm25.search(tokens, 5); // Get top 5

  const retrievedTopics = [
    ...new Set(hits.map((h) => h.id.split('#')[0])),
  ];

  // Check if any retrieved topic is in the relevant set
  const isHit = retrievedTopics.some((topic) => relevant_topics.includes(topic));

  results.push({
    query,
    relevant_topics,
    retrieved_topics: retrievedTopics,
    is_hit: isHit,
  });

  if (!isHit) {
    console.log(`✗ "${query}"`);
    console.log(`  Relevant: ${relevant_topics.join(', ')}`);
    console.log(`  Retrieved: ${retrievedTopics.join(', ')}`);
  }
}

// Calculate metrics
const hits = results.filter((r) => r.is_hit).length;
const recall = (hits / results.length) * 100;

console.log(`\n${'─'.repeat(60)}`);
console.log(`Recall@5: ${hits}/${results.length} = ${recall.toFixed(1)}%`);

if (recall >= 90) {
  console.log(`✅ PASS: Recall ≥ 90% (acceptance criterion met)`);
  process.exit(0);
} else {
  console.log(`❌ FAIL: Recall < 90% (need to improve BM25 or add embeddings)`);
  process.exit(1);
}
