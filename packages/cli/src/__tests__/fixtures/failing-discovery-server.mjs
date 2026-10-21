/**
 * Stdio MCP server whose discovery fails on purpose.
 *
 * Advertises the tools capability, then answers tools/list with a JSON-RPC
 * internal error (-32603). Two modes:
 *
 *   fail-first   every tools/list call fails
 *   fail-second  the first page succeeds, the second page fails
 *
 * Used by the CLI integration tests to verify that a failed discovery never
 * produces an empty snapshot or a clean check. No tools are ever callable.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ErrorCode, ListToolsRequestSchema, McpError } from "@modelcontextprotocol/sdk/types.js";

const mode = process.argv[2];
if (!["fail-first", "fail-second"].includes(mode)) {
  throw new Error("Expected fixture mode: fail-first | fail-second");
}

const tools = ["fixture_alpha", "fixture_beta"].map((name) => ({
  name,
  description: "Inert discovery fixture; not callable",
  inputSchema: { type: "object", properties: {} },
}));

const server = new Server(
  { name: "failing-discovery-fixture", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async (request) => {
  const second = request.params?.cursor === "second-page";
  if (mode === "fail-first" || (mode === "fail-second" && second)) {
    throw new McpError(ErrorCode.InternalError, "Controlled fixture discovery failure");
  }
  return second ? { tools: [tools[1]] } : { tools: [tools[0]], nextCursor: "second-page" };
});

await server.connect(new StdioServerTransport());
