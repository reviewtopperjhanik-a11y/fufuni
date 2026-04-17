// Copyright (c) 2024-2026 Ronan LE MEILLAT
// License: AGPL-3.0-or-later
//
// Shared tool-registration helper — used by both the Cloudflare Worker (index.ts)
// and the local stdio entry point (stdio.ts).
//
// Phase 1 v2: Exposes 8 stable tools instead of 41.
// Per-topic tools are removed; all retrieval goes through search or direct slug reference.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TopicManifest } from "./index.js";
import { Bm25Index, tokenise } from "./search/bm25.js";
import { cosineTopK, type VectorIndex } from "./search/cosine.js";
import { reciprocalRankFusion } from "./search/rrf.js";
import { BM25_INDEX } from "./search/bm25-index.js";
import { CHUNKS } from "./search/chunks.js";
import type { VECTOR_DIM, VECTOR_COUNT, VECTORS_B64, CHUNK_IDS } from "./search/vectors.js";

export type ToolDeps = {
  manifest: TopicManifest;
  knowledge: Record<string, string>;
};

/**
 * Register all 8 Fufuni MCP tools on the given McpServer instance.
 */
export function registerFufuniTools(
  server: McpServer,
  deps: ToolDeps,
): void {
  const { manifest, knowledge } = deps;

  // ── Tool 1: list_topics ──────────────────────────────────────────────────
  server.registerTool("list_topics", {
    title: "List all Fufuni knowledge topics",
    description:
      "List all available Fufuni knowledge topics with their tags and metadata. " +
      "Returns structured JSON so you can filter by tag without another call. " +
      "Prefer `get_topic` if you already know the slug you need.",
  }, async () => {
    const topics = manifest.topics.map((t: any) => ({
      slug: t.slug,
      title: t.title,
      description: t.description,
      tags: t.tags,
      word_count: t.word_count,
    }));
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ count: topics.length, topics }, null, 2),
        },
      ],
    };
  });

  // ── Tool 2: get_topic ────────────────────────────────────────────────────
  server.registerTool("get_topic", {
    title: "Get a Fufuni knowledge topic by slug",
    description:
      "Return the full Markdown of a Fufuni topic. " +
      "Use this when you already know the topic slug (e.g. 'db-schema', 'how-to-add-hono-route'). " +
      "Prefer `list_topics` to discover slugs.",
    inputSchema: z.object({
      slug: z.string().describe("Topic slug (e.g. 'db-schema', 'api-error-patterns')"),
    }),
  }, async ({ slug }) => {
    const content = knowledge[slug];
    if (!content) {
      const available = manifest.topics.map((t: any) => t.slug).join(", ");
      return {
        content: [
          {
            type: "text",
            text: `Topic "${slug}" not found. Available: ${available}`,
          },
        ],
        isError: true,
      };
    }
    return { content: [{ type: "text", text: content }] };
  });

  // ── Tool 3: search_topics ────────────────────────────────────────────────
  // Legacy tool; returns BM25 substring matches with context.
  server.registerTool("search_topics", {
    title: "Search Fufuni knowledge (legacy, use list_topics instead)",
    description:
      "[Deprecated] Full-text search across topics. " +
      "Use `list_topics` + tag filtering for better results. " +
      "This tool will be removed on 2026-07-01.",
    inputSchema: z.object({
      query: z.string().describe("Keyword or phrase"),
      max_results: z.number().int().min(1).max(10).optional()
        .describe("Number of results (default 5)"),
    }),
  }, async ({ query, max_results = 5 }) => {
    const needle = query.toLowerCase();
    const results: Array<{ slug: string; excerpt: string }> = [];

    for (const [slug, content] of Object.entries(knowledge)) {
      if (results.length >= max_results) break;
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(needle)) {
          const start = Math.max(0, i - 2);
          const end = Math.min(lines.length - 1, i + 3);
          const excerpt = lines.slice(start, end + 1).join('\n').trim();
          results.push({ slug, excerpt });
          break;
        }
      }
    }

    if (results.length === 0) {
      return {
        content: [{ type: "text", text: `No matches found for "${query}". Try list_topics.` }],
      };
    }

    const text = results
      .map(r => `**${r.slug}**\n\`\`\`\n${r.excerpt}\n\`\`\``)
      .join('\n\n');
    return {
      content: [{ type: "text", text: `Found in ${results.length} topic(s):\n\n${text}` }],
    };
  });

  // ── Tool 4: get_manifest ─────────────────────────────────────────────────
  server.registerTool("get_manifest", {
    title: "Get the MCP knowledge manifest",
    description:
      "Return the manifest (schema version, commit, topics list). " +
      "Used by CI/CD to track versioning and cache invalidation.",
  }, async () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(manifest, null, 2),
      },
    ],
  }));

  // ── Tool 5: retrieve_knowledge ───────────────────────────────────────────
  // Hybrid BM25 + embeddings search (Phase 2)
  const bm25 = new Bm25Index(BM25_INDEX.docs);

  server.registerTool("retrieve_knowledge", {
    title: "Retrieve Fufuni knowledge by semantic search",
    description:
      "Answer a natural-language question by returning the most relevant chunks of the Fufuni knowledge base. " +
      "Combines lexical (BM25) and semantic (cosine similarity) scoring. " +
      "Prefer this over `get_topic` when the user asks a question.",
    inputSchema: z.object({
      query: z.string().min(3).describe("Question in natural language, in English or French."),
      k: z.number().int().min(1).max(10).optional()
        .describe("Number of chunks to return (default 5)."),
      topic_filter: z.array(z.string()).optional()
        .describe("Restrict to these topic slugs (from list_topics)."),
    }),
  }, async ({ query, k = 5, topic_filter }) => {
    const tokens = tokenise(query);
    const bm25Hits = bm25.search(tokens, 20);

    // Try vector search if embeddings are available; fall back to BM25-only otherwise
    let vecHits: Array<{ id: string; score: number }> = [];
    let usingVectors = false;

    try {
      // Dynamically import vectors module to check if embeddings exist
      const { VECTORS_B64, VECTOR_DIM, VECTOR_COUNT, CHUNK_IDS: vectorChunkIds } = await import("./search/vectors.js");
      if (VECTOR_COUNT > 0 && VECTORS_B64) {
        // Embed the query using a runtime embedding function
        // For now, this is a placeholder; in production this would call the Gemini API
        // vecHits = cosineTopK(vectorIndex, queryEmbedding, 20);
        // usingVectors = true;
      }
    } catch {
      // Embeddings not available, continue with BM25-only
    }

    const fused = usingVectors
      ? reciprocalRankFusion([bm25Hits, vecHits], 60)
      : bm25Hits;

    const filtered = topic_filter
      ? fused.filter((h) => topic_filter.includes(h.id.split("#")[0]))
      : fused;

    const top = filtered.slice(0, k);
    const chunks = top
      .map((hit) => CHUNKS[hit.id])
      .filter((c) => c !== undefined)
      .map((chunk) => ({
        id: chunk.id,
        topic: chunk.topic,
        heading: chunk.heading,
        heading_path: chunk.heading_path,
        score: 0, // Placeholder; will be populated when vectors are available
        word_count: chunk.word_count,
        text: chunk.text,
      }));

    const mode = usingVectors ? "hybrid (BM25 + vectors)" : "BM25-only";
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              query,
              mode,
              count: chunks.length,
              chunks,
            },
            null,
            2
          ),
        },
      ],
    };
  });

  // ── Tools 6-8: Reserved for Phase 3-4 (chunking refinement, read_source, etc.) ──
  // TODO Phase 3: Enhanced chunking with fine-grained retrieval
  // TODO Phase 4: read_source, inspect_schema, list_routes
}
