// Copyright (c) 2024-2026 Ronan LE MEILLAT
// License: AGPL-3.0-or-later
//
// Shared tool-registration helper — used by both the Cloudflare Worker (index.ts)
// and the local stdio entry point (stdio.ts).
//
// Phase 1 v2: Exposes 8 stable tools instead of 41.
// Per-topic tools are removed; all retrieval goes through search or direct slug reference.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { TopicManifest } from "./index.js";
import { Bm25Index, tokenise } from "./search/bm25.js";
import { cosineTopK, type VectorIndex } from "./search/cosine.js";
import { reciprocalRankFusion } from "./search/rrf.js";
import { BM25_INDEX } from "./search/bm25-index.js";
import { CHUNKS } from "./search/chunks.js";
import { VECTOR_MODEL, VECTOR_DIM, VECTOR_COUNT, VECTORS_B64, CHUNK_IDS } from "./search/vectors.js";
import { decryptAiConfig, resolveProviderEndpoint, selectEmbeddingModels } from "./lib/ai-enc.js";
import { generateEmbedding, buildApiKeyPool, normalizeVector, maskApiKey } from "./lib/generate-knowledge.js";
import { SOURCES, SOURCE_COMMITS } from "./sources.js";
import { READABLE_SOURCES } from "./sources-whitelist.js";
import { parseSchema } from "./lib/schema-parser.js";
import { ROUTES } from "./search/routes.js";
import { extractMigrations } from "./lib/migration-parser.js";
import { MANIFEST_GENERATED_AT, MANIFEST_COMMIT } from "./manifest.js";
import { makeCacheKey, withKvCache } from "./lib/kv-cache.js";

export type ToolDeps = {
  manifest: TopicManifest;
  knowledge: Record<string, string>;
  aiEncJson: string;
  env: Env;
};

/**
 * Register all 8 Fufuni MCP tools on the given McpServer instance.
 */
export function registerFufuniTools(
  server: McpServer,
  deps: ToolDeps,
): void {
  const { manifest, knowledge, aiEncJson, env } = deps;

  // ── Tool 1: list_topics ──────────────────────────────────────────────────
  server.registerTool("list_topics", {
    title: "List all Fufuni knowledge topics",
    description:
      "List all available Fufuni knowledge topics with their tags and metadata. " +
      "Returns structured JSON so you can filter by tag without another call. " +
      "Prefer `get_topic` if you already know the slug you need.",
  }, async () => {
    const cacheKey = makeCacheKey("list_topics", {});
    return withKvCache(env.KV_CACHE, cacheKey, 86_400, async () => {
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
            type: "text" as const,
            text: JSON.stringify({ count: topics.length, topics }, null, 2),
          },
        ],
      };
    });
  });

  // ── Tool 2: get_topic ────────────────────────────────────────────────────
  server.registerTool("get_topic", {
    title: "Get a Fufuni knowledge topic by slug",
    description:
      "Return the full Markdown of a Fufuni topic, or a single section if `section` is provided. " +
      "Use this when you already know the topic slug (e.g. 'db-schema', 'how-to-add-hono-route'). " +
      "Prefer `retrieve_knowledge` to search by question; use `get_topic` only when you know the slug.",
    inputSchema: z.object({
      slug: z.string().describe("Topic slug (e.g. 'db-schema', 'api-error-patterns')"),
      section: z.string().optional()
        .describe('Optional heading to narrow the response (e.g. "Refund flow"). Matches on the trimmed heading text.'),
    }),
  }, async ({ slug, section }) => {
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

    const cacheKey = makeCacheKey("get_topic", { slug, section: section ?? null });
    return withKvCache(env.KV_CACHE, cacheKey, 86_400, async () => {
      // If no section specified, return full topic
      if (!section) {
        return { content: [{ type: "text" as const, text: content }] };
      }

      // Find chunk matching the section heading
      const chunks = Object.values(CHUNKS).filter((c) => c.topic === slug);
      const hit = chunks.find((c) =>
        c.heading.toLowerCase().includes(section.toLowerCase()),
      );

      if (!hit) {
        const available = chunks.map((c) => c.heading.trim()).join(", ");
        return {
          content: [
            {
              type: "text" as const,
              text: `Section "${section}" not found in "${slug}". Available sections: ${available}`,
            },
          ],
          isError: true,
        };
      }

      return { content: [{ type: "text" as const, text: hit.text }] };
    });
  });

  // ── Tool 3: search_topics ────────────────────────────────────────────────
  // Legacy tool; returns BM25 substring matches with context.
  server.registerTool("search_topics", {
    title: "Search Fufuni knowledge (legacy, use list_topics instead)",
    description:
      "[Deprecated] Full-text search across topics. " +
      "Use `list_topics` + tag filtering for better results. " +
      "This tool will be removed on 2026-07-01.",
    inputSchema: {
      query: z.string().describe("Keyword or phrase"),
      max_results: z.int().min(1).max(10).optional()
        .describe("Number of results (default 5)"),
    },
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
  }, async () => {
    const cacheKey = makeCacheKey("get_manifest", {});
    return withKvCache(env.KV_CACHE, cacheKey, 3_600, async () => {
      const ageMs = Date.now() - new Date(MANIFEST_GENERATED_AT).getTime();
      const staleDays = Math.floor(ageMs / 86_400_000);
      const content = [] as Array<{ type: "text"; text: string }>;
      content.push({
        type: "text",
        text: JSON.stringify(manifest, null, 2),
      });
      if (staleDays > 28) {
        content.push({
          type: "text",
          text: `⚠️ Manifest is ${staleDays} days old. Consider regenerating it with the latest knowledge.`,
        });
      }
      return { content };
    });
  });

  // ── Tool 5: retrieve_knowledge ───────────────────────────────────────────
  // Hybrid BM25 + embeddings search (Phase 2)
  const bm25 = new Bm25Index(BM25_INDEX.docs);
  // const aiConfig = await decryptAiConfig(aiEncJson, env.CRYPTOKEN).catch((e) => {
  //   console.warn("[MCP] Failed to decrypt AI config. retrieve_knowledge will operate in BM25-only mode.", e);
  //   return null;
  // });

  server.registerTool("retrieve_knowledge", {
    title: "Retrieve Fufuni knowledge by semantic search",
    description:
      "Answer a natural-language question by returning the most relevant chunks of the Fufuni knowledge base. " +
      "Combines lexical (BM25) and semantic (cosine similarity) scoring. " +
      "Prefer this over `get_topic` when the user asks a question.",
    inputSchema: {
      query: z.string().min(3).describe("Question in natural language only in English."),
      k: z.int().min(1).max(10).optional()
        .describe("Number of chunks to return (default 5)."),
      topic_filter: z.array(z.string()).optional()
        .describe("Restrict to these topic slugs (from list_topics)."),
    },
  }, async ({ query, k = 5, topic_filter }) => {
    const cacheKey = makeCacheKey("retrieve_knowledge", {
      query,
      k,
      topic_filter: topic_filter ?? null,
    });
    return withKvCache(env.KV_CACHE, cacheKey, 3_600, async () => {
      const tokens = tokenise(query);
      const bm25Hits = bm25.search(tokens, 20);

      // Try vector search via Gemini embedding; fall back to BM25-only otherwise
      let vecHits: Array<{ id: string; score: number }> = [];
      let usingVectors = false;
      let embeddingStats: Array<{ key: string; nb_try: number; nb_success: number; nb_fail: number }> = [];
      let connectedViaGateway = false;
      if (aiEncJson && env.CRYPTOKEN && VECTOR_COUNT > 0 && VECTORS_B64) {
        try {
          const aiConfig = await decryptAiConfig(aiEncJson, env.CRYPTOKEN);
          const apiKeys = buildApiKeyPool(aiConfig, { protocol: 'gemini' });
          // Resolve gateway base URL from the embedding model's provider config
          const embCandidates = selectEmbeddingModels(aiConfig, 'gemini');
          const embProvider = embCandidates[0]?.provider;
          const { endpoint: embEndpoint, useGateway } = embProvider
            ? resolveProviderEndpoint(embProvider, env.CLOUDFLARE_AIG_TOKEN)
            : { endpoint: '', useGateway: false };
          // Strip /compat suffix — native Gemini embedContent path is rooted at the gateway base
          const gatewayBaseUrl = useGateway ? embEndpoint.replace(/\/compat$/, '') : undefined;
          const result = await generateEmbedding(query, {
            apiKeys,
            model: VECTOR_MODEL,
            vectorDimension: VECTOR_DIM,
            taskType: 'RETRIEVAL_QUERY',
            aigToken: env.CLOUDFLARE_AIG_TOKEN,
            gatewayBaseUrl,
          });
          if (result) {
            connectedViaGateway = result.connection === 'gateway';
            embeddingStats = result.stats
              .filter((s) => s.nbTry > 0)
              .map((s) => ({
                key: maskApiKey(s.key),
                nb_try: s.nbTry,
                nb_success: s.nbSuccess,
                nb_fail: s.nbFail,
              }));
            if (result.vector.length === VECTOR_DIM) {
              const queryVec = new Float32Array(normalizeVector(result.vector));
              const vectorIndex: VectorIndex = { VECTOR_DIM, VECTOR_COUNT, VECTORS_B64, CHUNK_IDS };
              vecHits = cosineTopK(vectorIndex, queryVec, 20);
              usingVectors = true;
            }
          }
        } catch (e) {
          console.error('[MCP] Vector embedding failed, falling back to BM25-only', e);
        }
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
          score: top.find((h) => h.id === chunk.id)?.score ?? 0,
          word_count: chunk.word_count,
          text: chunk.text,
        }));

      const mode = usingVectors ? "hybrid (BM25 + vectors)" : "BM25-only";
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                query,
                mode,
                count: chunks.length,
                chunks,
                stats: embeddingStats,
                connection: connectedViaGateway === true ? "gateway" : "direct",
              },
              null,
              2
            ),
          },
        ],
      };
    });
  });

  // ── Tool 6: read_source ─────────────────────────────────────────────────
  server.registerTool("read_source", {
    title: "Read a Fufuni source file",
    description:
      "Read a whitelisted source file from the Fufuni monorepo. " +
      "Use this when the user asks for the *current* implementation of a route, schema, or migration. " +
      "Prefer `retrieve_knowledge` for conceptual questions.",
    inputSchema: z.object({
      path: z.string().describe("Repo-relative path (e.g. apps/merchant/src/do.ts)."),
      start_line: z.number().int().min(1).optional().describe("Start line number (1-based)."),
      end_line: z.number().int().min(1).optional().describe("End line number (1-based, inclusive)."),
    }),
  }, async ({ path, start_line, end_line }) => {
    if (!READABLE_SOURCES.includes(path)) {
      return {
        content: [
          {
            type: "text",
            text: `Path "${path}" is not in the read-source whitelist. Available paths: ${READABLE_SOURCES.slice(0, 5).join(", ")} ...`,
          },
        ],
        isError: true,
      };
    }

    const content = SOURCES[path];
    if (content === undefined) {
      return {
        content: [
          {
            type: "text",
            text: `Source "${path}" not found in bundle. Rebuild required: npm run build:sources`,
          },
        ],
        isError: true,
      };
    }

    const cacheKey = makeCacheKey("read_source", { path, start_line: start_line ?? null, end_line: end_line ?? null });
    return withKvCache(env.KV_CACHE, cacheKey, 86_400, async () => {
      const lines = content.split("\n");
      const from = Math.max(0, (start_line ?? 1) - 1);
      const to = Math.min(lines.length, end_line ?? lines.length);
      const slice = lines.slice(from, to).join("\n");
      const commit = SOURCE_COMMITS[path] ?? "unknown";
      const header = `// File: ${path} (commit ${commit}), lines ${from + 1}-${to}\n`;

      return { content: [{ type: "text" as const, text: header + slice }] };
    });
  });

  // ── Tool 7: inspect_schema ──────────────────────────────────────────────
  const schemaSource = SOURCES["apps/merchant/src/do.ts"] ?? "";
  const schema = parseSchema(schemaSource);

  server.registerTool("inspect_schema", {
    title: "Inspect the Fufuni SQL schema",
    description:
      "Return the Durable Object SQL schema — every table, column and type — parsed live from apps/merchant/src/do.ts. " +
      "Always reflects the current build; prefer this over db-schema documentation when accuracy matters.",
    inputSchema: z.object({
      table: z.string().optional().describe("Optional table name; when omitted, returns every table."),
    }),
  }, async ({ table }) => {
    const cacheKey = makeCacheKey("inspect_schema", { table: table ?? null });
    return withKvCache(env.KV_CACHE, cacheKey, 86_400, async () => {
      if (table) {
        const t = schema[table];
        if (!t) {
          const available = Object.keys(schema).join(", ");
          return {
            content: [{ type: "text" as const, text: `Table "${table}" not found. Available: ${available}` }],
            isError: true,
          };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(t, null, 2) }] };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(schema, null, 2) }] };
    });
  });

  // ── Tool 8: list_routes ────────────────────────────────────────────────
  // ROUTES is pre-built from openapi.json at build time (npm run build:sources).
  // It contains the complete API surface — all routes registered by OpenAPIHono.doc31.

  server.registerTool("list_routes", {
    title: "List Fufuni API routes",
    description:
      "Return all API routes from the Fufuni OpenAPI 3.1 specification (generated by OpenAPIHono). " +
      "Includes HTTP method, path, summary, tags and operationId for every endpoint. " +
      "Use this when the user asks 'what endpoints are available?' or 'which routes handle X?'",
    inputSchema: z.object({
      method_filter: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]).optional()
        .describe("Optional HTTP method filter (e.g. POST)."),
      tag_filter: z.string().optional()
        .describe("Optional tag filter (e.g. 'orders', 'products')."),
    }),
  }, async ({ method_filter, tag_filter }) => {
    const cacheKey = makeCacheKey("list_routes", { method_filter: method_filter ?? null, tag_filter: tag_filter ?? null });
    return withKvCache(env.KV_CACHE, cacheKey, 86_400, async () => {
      let filtered = ROUTES;

      if (method_filter) {
        filtered = filtered.filter((r) => r.method === method_filter);
      }
      if (tag_filter) {
        filtered = filtered.filter((r) => r.tags?.includes(tag_filter));
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                count: filtered.length,
                routes: filtered,
              },
              null,
              2
            ),
          },
        ],
      };
    });
  });

  // ── Tool 9: list_migrations ────────────────────────────────────────────
  const migrationFiles = READABLE_SOURCES
    .filter((p) => p.match(/migrations\/\d{3}-.+\.sql$/))
    .map((path) => ({
      path,
      content: SOURCES[path] ?? "",
    }))
    .filter((f) => f.content.length > 0);
  const migrations = extractMigrations(migrationFiles);

  server.registerTool("list_migrations", {
    title: "List database migrations",
    description:
      "Return all database migrations in chronological order (newest first). " +
      "Use this when the user asks 'what migrations have been applied?' or 'what changed in the schema recently?'",
    inputSchema: z.object({}),
  }, async () => {
    const cacheKey = makeCacheKey("list_migrations", {});
    return withKvCache(env.KV_CACHE, cacheKey, 86_400, async () => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                count: migrations.length,
                migrations,
              },
              null,
              2
            ),
          },
        ],
      };
    });
  });

  // ── Phase 7: Observability + telemetry ─────────────────────────────────
  // TODO Phase 7: Observability + telemetry
}
