/**
 * Minimal stdio MCP server used by the CLI integration tests.
 *
 * Uses the low-level Server API with raw JSON schemas so the fixture only
 * depends on @modelcontextprotocol/sdk (a direct dependency of the CLI).
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "fixture-server", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "echo",
      description: "Echo a message back",
      inputSchema: {
        type: "object",
        properties: { message: { type: "string", description: "Message to echo" } },
        required: ["message"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => ({
  content: [{ type: "text", text: String(request.params.arguments?.message ?? "") }],
}));

await server.connect(new StdioServerTransport());
