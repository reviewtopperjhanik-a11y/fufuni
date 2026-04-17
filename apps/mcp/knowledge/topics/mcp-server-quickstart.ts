/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'mcp-server-quickstart',
  description: 'MCP server setup, adding new topics, running gen-knowledge, configuration',
  sources: [],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'The MCP server lives in apps/mcp/. It exposes knowledge-base tools to AI assistants via Cloudflare Workers or stdio (for local Claude Desktop use).',
    'Topic files live in apps/mcp/knowledge/topics/. Each file exports a default Topic object. The generator auto-discovers them alphabetically.',
    'To add a new topic: create apps/mcp/knowledge/topics/<topic-name>.ts exporting a default Topic. Import Topic type from "../base.js". Import BASE_SYSTEM and appendFacts from "../base.js".',
    'Topic required fields: name (string, matches filename without .ts), description (one sentence), sources (paths from repo root), systemPrompt, buildPrompt (function receiving concatenated source files).',
    'To regenerate the knowledge base: npm run mcp:generate (dry-run uses cache), npm run mcp:generate:force (forces regeneration of all topics).',
    'mcp:auto command: runs generate then gen-knowledge to publish to the MCP server. It requires AI_MODEL, AI_API_KEY, AI_API_URL environment variables.',
    'gen-knowledge.ts (apps/mcp/scripts/gen-knowledge.ts) reads generated .md files from the mcp/ directory at repo root and builds the knowledge.ts module used by the MCP server at runtime.',
    'The knowledge base output directory is <repo-root>/mcp/. One .md file is generated per topic.',
    'Running the MCP server locally (stdio mode): npx tsx apps/mcp/src/stdio.ts — compatible with Claude Desktop via the MCP config.',
    'Adding a topic file is the ONLY way to add new knowledge to the MCP server. Do not edit apps/mcp/src/knowledge.ts directly — it is auto-generated.',
    'The generate.ts script (apps/mcp/knowledge/generate.ts) is the generator. It reads all topic .ts files, calls buildPrompt with the concatenated source files, sends to an LLM, and writes the response as a .md file.',
    'Copyright header required in every new topic file: "Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development / License: AGPL-3.0-or-later".',
  ],
  buildPrompt: (src) => appendFacts(`
Task: Write a "MCP Server Quickstart" guide for contributors who want to extend the knowledge base.
Include:
1. What the MCP server is and how AI assistants consume it.
2. Directory layout: apps/mcp/knowledge/topics/ (one .ts per topic), apps/mcp/knowledge/generate.ts (generator), apps/mcp/knowledge/base.ts (shared types).
3. Step-by-step: how to add a new topic file (with full template including copyright header).
4. The Topic interface fields: name, description, sources, systemPrompt, manualFacts, buildPrompt, maxSourceChars.
5. The generate commands: mcp:generate, mcp:generate:force, mcp:auto. What each does.
6. How gen-knowledge.ts publishes the .md files to the runtime knowledge.ts.
7. Local stdio mode: how to run the MCP server for Claude Desktop testing.
8. Do NOT edit knowledge.ts directly — the warning and why.
`, topic.manualFacts),
};

export default topic;
