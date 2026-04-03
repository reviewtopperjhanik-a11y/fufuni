// Copyright (c) 2024-2026 Ronan LE MEILLAT
// License: AGPL-3.0-or-later
//
// Fufuni MCP Server — serves the static knowledge-base files from mcp/ as MCP tools.
//
// Usage:
//   GET /mcp           — Streamable HTTP MCP endpoint (MCP clients)
//   GET /sse           — SSE MCP endpoint (legacy Claude Desktop / older clients)
//   GET /              — Health-check (returns 200 "Fufuni MCP Server")
//
// Knowledge files are pre-bundled at build time by scripts/gen-knowledge.ts into
// src/knowledge.ts (gitignored). Run `npm run gen-knowledge` before deploying.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { KNOWLEDGE } from "./knowledge.js";

async function checkRateLimit(request: Request, env: Env): Promise<Response | null> {
  const limiter = env.MCP_RATE_LIMITER;
  if (!limiter) return null;

  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    'unknown';

  const url = new URL(request.url);
  const key = `mcp:${ip}:${url.pathname}`;

  const { success } = await limiter.limit({ key });
  if (success) return null;

  return new Response('Rate limit exceeded', {
    status: 429,
    headers: {
      'Content-Type': 'text/plain',
      'Retry-After': '60',
    },
  });
}

export class FufuniMCP extends McpAgent {
  server = new McpServer({
    name: "Fufuni Knowledge Base",
    version: "1.0.0",
  });

  async init() {
    // ── Meta tools ────────────────────────────────────────────────────────────

    // list_topics: returns the available topic slugs so the AI knows what to ask for.
    this.server.registerTool("list_topics", {
      title: "List all available Fufuni knowledge topics",
      description: "List all available Fufuni knowledge topics (slugs). Call this first to discover what topics exist, then use get_topic or the dedicated per-topic tools to read the content.",
    }, async () => ({
      content: [
        {
          type: "text",
          text: `Available topics (${Object.keys(KNOWLEDGE).length}):\n${Object.keys(KNOWLEDGE)
            .map((k) => `- ${k}`)
            .join("\n")}`,
        },
      ],
    }));

    // get_topic: generic tool — fetch any topic by slug.
    this.server.registerTool("get_topic", {
      title: "Get a Fufuni knowledge topic",
      description: "Get the full documentation for a Fufuni knowledge topic by slug. Use list_topics first to discover available slugs.",
      inputSchema: z.object({
        slug: z.string().describe("Topic slug (e.g. api-error-patterns, auth0-tenant-setup)"),
      }),
    }, async ({ slug }) => {
      const content = KNOWLEDGE[slug];
      if (!content) {
        return {
          content: [
            {
              type: "text",
              text: `Topic "${slug}" not found. Available topics: ${Object.keys(KNOWLEDGE).join(", ")}`,
            },
          ],
          isError: true,
        };
      }
      return { content: [{ type: "text", text: content }] };
    });

    // ── Per-topic dedicated tools ─────────────────────────────────────────────
    // One tool per knowledge file so AI assistants can directly invoke the relevant
    // topic without a list_topics + get_topic round-trip.

    for (const [slug, content] of Object.entries(KNOWLEDGE)) {
      const toolName = slug.replace(/-/g, "_");
      // Prefer the AI-generated description embedded in the header comment.
      // Fallback: first prose paragraph after the heading.
      const headerDesc = content.match(/<!--[\s\S]*?description:\s*(.+?)(?:\n|-->)/)?.[1]?.trim();
      const body = content.replace(/^<!--[\s\S]*?-->\s*/m, '');
      const title = body.match(/^#{1,2}\s+(.+)/m)?.[1]?.trim() ?? slug;
      const afterHeading = body.replace(/^#{1,2}\s+.+\n?/m, '').trim();
      const firstPara = afterHeading.split(/\n\n/)[0].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      const description = headerDesc ?? (firstPara.slice(0, 250) || `Fufuni knowledge: ${slug}`);

      this.server.registerTool(toolName, {
        title: `Fufuni knowledge: ${title}`,
        description,
      }, async () => ({ content: [{ type: "text", text: content }] }));
    }
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const rateLimitResponse = await checkRateLimit(request, env);
    if (rateLimitResponse) return rateLimitResponse;

    const url = new URL(request.url);

    if (url.pathname === "/mcp") {
      return FufuniMCP.serve("/mcp").fetch(request, env, ctx);
    }

    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      return FufuniMCP.serveSSE("/sse").fetch(request, env, ctx);
    }

    return new Response("Fufuni MCP Server for https://github.com/sctg-development/fufuni — connect via /mcp (Streamable HTTP) or /sse (SSE)", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  },
};
