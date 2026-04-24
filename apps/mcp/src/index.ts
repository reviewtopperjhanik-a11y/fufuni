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
import { KNOWLEDGE } from "./knowledge.js";
import { MANIFEST } from "./manifest.js";
import { registerFufuniTools } from "./tools.js";
import aiJsonEnc from "./config/ai.json.enc" with { type:"text" };
import { serveIndex } from "./doc/index.js";
import { serve404 } from "./doc/404.js";

export interface TopicMeta {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  updated_at: string;
  word_count: number;
  sources_checksum: string;
}

export interface TopicManifest {
  generated_at: string;
  commit: string;
  manifest_version: string;
  topics: TopicMeta[];
}

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
    version: "2.0.0",
  });

  async init() {
    registerFufuniTools(this.server, { manifest: MANIFEST, knowledge: KNOWLEDGE, aiEncJson: aiJsonEnc, env: this.env });
  }
}

function serveRawMarkdown(slug: string) {
  const markdown = KNOWLEDGE[slug];
  if (!markdown) {
    return new Response('Topic not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return new Response(markdown, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
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

    if (url.pathname.startsWith("/topic/") && url.pathname.endsWith(".md")) {
      const slug = url.pathname.slice("/topic/".length, -3);
      return serveRawMarkdown(slug);
    }

    if (url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "/index.htm") {
      return serveIndex(env);
    }

    return serve404();
  },
};
