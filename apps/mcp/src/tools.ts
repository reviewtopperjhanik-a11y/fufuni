// Copyright (c) 2024-2026 Ronan LE MEILLAT
// License: AGPL-3.0-or-later
//
// Shared tool-registration helper — used by both the Cloudflare Worker (index.ts)
// and the local stdio entry point (stdio.ts).  No Cloudflare-specific imports.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Register all Fufuni knowledge-base tools on the given McpServer instance.
 * Works in both Cloudflare Workers (via McpAgent) and plain Node.js (via StdioServerTransport).
 */
export function registerFufuniTools(
  server: McpServer,
  knowledge: Record<string, string>,
): void {
  // ── Meta tools ────────────────────────────────────────────────────────────

  // list_topics: returns the available topic slugs so the AI knows what to ask for.
  server.registerTool("list_topics", {
    title: "List all available Fufuni knowledge topics",
    description:
      "List all available Fufuni knowledge topics (slugs). Call this first to discover what topics exist, then use get_topic or the dedicated per-topic tools to read the content.",
  }, async () => ({
    content: [
      {
        type: "text",
        text: `Available topics (${Object.keys(knowledge).length}):\n${Object.keys(knowledge)
          .map((k) => `- ${k}`)
          .join("\n")}`,
      },
    ],
  }));

  // get_topic: generic tool — fetch any topic by slug.
  server.registerTool("get_topic", {
    title: "Get a Fufuni knowledge topic",
    description:
      "Get the full documentation for a Fufuni knowledge topic by slug. Use list_topics first to discover available slugs.",
    inputSchema: z.object({
      slug: z.string().describe("Topic slug (e.g. api-error-patterns, auth0-tenant-setup)"),
    }),
  }, async ({ slug }) => {
    const content = knowledge[slug];
    if (!content) {
      return {
        content: [
          {
            type: "text",
            text: `Topic "${slug}" not found. Available topics: ${Object.keys(knowledge).join(", ")}`,
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

  for (const [slug, content] of Object.entries(knowledge)) {
    const toolName = slug.replace(/-/g, "_");
    const headerDesc = content.match(/<!--[\s\S]*?description:\s*(.+?)(?:\n|-->)/)?.[1]?.trim();
    const body = content.replace(/^<!--[\s\S]*?-->\s*/m, '');
    const title = body.match(/^#{1,2}\s+(.+)/m)?.[1]?.trim() ?? slug;
    const afterHeading = body.replace(/^#{1,2}\s+.+\n?/m, '').trim();
    const firstPara = afterHeading.split(/\n\n/)[0].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const description = headerDesc ?? (firstPara.slice(0, 250) || `Fufuni knowledge: ${slug}`);

    server.registerTool(toolName, {
      title: `Fufuni knowledge: ${title}`,
      description,
    }, async () => ({ content: [{ type: "text", text: content }] }));
  }
}
