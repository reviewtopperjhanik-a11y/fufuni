// Copyright (c) 2024-2026 Ronan LE MEILLAT
// License: AGPL-3.0-or-later
//
// Local stdio entry point for the Fufuni MCP server.
// Allows Claude for VS Code (and other stdio-only MCP clients) to run
// this server as a local subprocess instead of connecting over HTTP.
//
// Usage:
//   npx tsx src/stdio.ts          (direct)
//   npm run stdio                 (via package.json script)
//
// VS Code mcp.json:
//   { "type": "stdio", "command": "npm", "args": ["--prefix", "apps/mcp", "run", "stdio"] }

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { KNOWLEDGE } from "./knowledge.js";
import { registerFufuniTools } from "./tools.js";

const server = new McpServer({
  name: "Fufuni Knowledge Base",
  version: "1.0.0",
});

registerFufuniTools(server, KNOWLEDGE);

const transport = new StdioServerTransport();
await server.connect(transport);
