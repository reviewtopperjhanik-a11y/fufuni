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
import { MANIFEST } from "./manifest.js";
import { registerFufuniTools } from "./tools.js";

const VERBOSE_LOGGING = true; // set to true for debugging MCP server issues

class LoggingStdioServerTransport {
  readonly transport = new StdioServerTransport();

  get onmessage() {
    return this.transport.onmessage;
  }
  set onmessage(handler) {
    if (!handler) {
      this.transport.onmessage = handler;
      return;
    }
    this.transport.onmessage = (message) => {
      if (VERBOSE_LOGGING) {
        console.log('[MCP] recv', JSON.stringify(message));
      }
      return handler(message);
    };
  }

  get onerror() {
    return this.transport.onerror;
  }
  set onerror(handler) {
    this.transport.onerror = handler;
  }

  get onclose() {
    return this.transport.onclose;
  }
  set onclose(handler) {
    this.transport.onclose = handler;
  }

  async start() {
    if (VERBOSE_LOGGING) {
      console.log('[MCP] transport start');
    }
    return this.transport.start();
  }

  async close() {
    if (VERBOSE_LOGGING) {
      console.log('[MCP] transport close');
    }
    return this.transport.close();
  }

  async send(message: any) {
    if (VERBOSE_LOGGING) {
      console.log('[MCP] send', JSON.stringify(message));
    }
    return this.transport.send(message);
  }
}

const server = new McpServer({
  name: "Fufuni Knowledge Base",
  version: "2.0.0",
});

registerFufuniTools(server, { manifest: MANIFEST, knowledge: KNOWLEDGE });

const transport = new LoggingStdioServerTransport();
await server.connect(transport);
