import { readFileSync } from "node:fs";
import type { RawPrompt, RawResource, RawResourceTemplate, RawTool } from "@mcp-contracts/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

/** Resolved transport configuration for connecting to an MCP server. */
export interface ResolvedTransport {
  transport: "stdio" | "streamable-http" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

/** Data captured from a live MCP server. */
export interface CapturedData {
  tools: RawTool[];
  resources: RawResource[];
  resourceTemplates: RawResourceTemplate[];
  prompts: RawPrompt[];
}

/** Result of connecting to an MCP server. */
export interface ConnectionResult {
  client: Client;
  transport: Transport;
  protocolVersion: string;
}

/**
 * Creates a Client and Transport, then connects to the MCP server.
 *
 * @param config - The resolved transport configuration.
 * @returns The connected client, transport, and negotiated protocol version.
 */
export async function connectToServer(config: ResolvedTransport): Promise<ConnectionResult> {
  const client = new Client({ name: "mcpdiff", version: "0.1.0" });

  let transport: Transport;
  if (config.transport === "stdio") {
    if (!config.command) {
      throw new Error("stdio transport requires a command");
    }
    transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { ...getDefaultEnvironment(), ...config.env },
    });
  } else if (config.transport === "sse") {
    if (!config.url) {
      throw new Error("sse transport requires a URL");
    }
    const sseOpts = config.headers
      ? { requestInit: { headers: config.headers } }
      : {};
    transport = new SSEClientTransport(new URL(config.url), sseOpts);
  } else {
    if (!config.url) {
      throw new Error("streamable-http transport requires a URL");
    }
    const httpOpts = config.headers
      ? { requestInit: { headers: config.headers } }
      : undefined;
    transport = httpOpts
      ? new StreamableHTTPClientTransport(new URL(config.url), httpOpts)
      : new StreamableHTTPClientTransport(new URL(config.url));
  }

  await client.connect(transport, { signal: AbortSignal.timeout(30_000) });

  return { client, transport, protocolVersion: LATEST_PROTOCOL_VERSION };
}

/**
 * Warns to stderr on partial capture failures.
 *
 * @param label - What was being listed (e.g., "tools").
 * @param err - The caught error.
 */
function warnCapture(label: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Warning: Failed to list ${label}: ${message}\n`);
}

/**
 * Lists all tools from the server, paginating through results.
 *
 * @param client - The connected MCP client.
 * @returns Array of raw tool data.
 */
async function listAllTools(client: Client): Promise<RawTool[]> {
  const tools: RawTool[] = [];
  let cursor: string | undefined;
  do {
    const result = await client.listTools(cursor ? { cursor } : undefined);
    for (const tool of result.tools) {
      tools.push({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as RawTool["inputSchema"],
        ...(tool.outputSchema && {
          outputSchema: tool.outputSchema as Record<string, unknown>,
        }),
        ...(tool.annotations && { annotations: tool.annotations as Record<string, unknown> }),
      });
    }
    cursor = result.nextCursor;
  } while (cursor);
  return tools;
}

/**
 * Lists all resources from the server, paginating through results.
 *
 * @param client - The connected MCP client.
 * @returns Array of raw resource data.
 */
async function listAllResources(client: Client): Promise<RawResource[]> {
  const resources: RawResource[] = [];
  let cursor: string | undefined;
  do {
    const result = await client.listResources(cursor ? { cursor } : undefined);
    for (const resource of result.resources) {
      resources.push({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
      });
    }
    cursor = result.nextCursor;
  } while (cursor);
  return resources;
}

/**
 * Lists all resource templates from the server, paginating through results.
 *
 * @param client - The connected MCP client.
 * @returns Array of raw resource template data.
 */
async function listAllResourceTemplates(client: Client): Promise<RawResourceTemplate[]> {
  const templates: RawResourceTemplate[] = [];
  let cursor: string | undefined;
  do {
    const result = await client.listResourceTemplates(cursor ? { cursor } : undefined);
    for (const template of result.resourceTemplates) {
      templates.push({
        uriTemplate: template.uriTemplate,
        name: template.name,
        description: template.description,
        mimeType: template.mimeType,
      });
    }
    cursor = result.nextCursor;
  } while (cursor);
  return templates;
}

/**
 * Lists all prompts from the server, paginating through results.
 *
 * @param client - The connected MCP client.
 * @returns Array of raw prompt data.
 */
async function listAllPrompts(client: Client): Promise<RawPrompt[]> {
  const prompts: RawPrompt[] = [];
  let cursor: string | undefined;
  do {
    const result = await client.listPrompts(cursor ? { cursor } : undefined);
    for (const prompt of result.prompts) {
      prompts.push({
        name: prompt.name,
        description: prompt.description,
        arguments: prompt.arguments,
      });
    }
    cursor = result.nextCursor;
  } while (cursor);
  return prompts;
}

/**
 * Captures all available data from a connected MCP server.
 *
 * Lists tools, resources, resource templates, and prompts based on server capabilities.
 * Each list call is wrapped in try/catch to handle partial failures gracefully.
 *
 * @param client - The connected MCP client.
 * @returns All captured server data.
 */
export async function captureServerData(client: Client): Promise<CapturedData> {
  const capabilities = client.getServerCapabilities() ?? {};

  let tools: RawTool[] = [];
  let resources: RawResource[] = [];
  let resourceTemplates: RawResourceTemplate[] = [];
  let prompts: RawPrompt[] = [];

  if (capabilities.tools) {
    try {
      tools = await listAllTools(client);
    } catch (err) {
      warnCapture("tools", err);
    }
  }

  if (capabilities.resources) {
    try {
      resources = await listAllResources(client);
    } catch (err) {
      warnCapture("resources", err);
    }
    try {
      resourceTemplates = await listAllResourceTemplates(client);
    } catch (err) {
      warnCapture("resource templates", err);
    }
  }

  if (capabilities.prompts) {
    try {
      prompts = await listAllPrompts(client);
    } catch (err) {
      warnCapture("prompts", err);
    }
  }

  return { tools, resources, resourceTemplates, prompts };
}

/** Shape of a single server entry in mcp.json. */
interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

/**
 * Reads and resolves a server configuration from an mcp.json file.
 *
 * If only one server is defined and no --server is given, it's auto-selected.
 * If multiple servers exist, --server must be specified.
 *
 * @param configPath - Path to the mcp.json config file.
 * @param serverName - Optional server name to select.
 * @returns The resolved transport configuration.
 */
export function readMcpConfig(
  configPath: string,
  serverName: string | undefined,
): ResolvedTransport {
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read config file "${configPath}": ${message}`);
  }

  let config: unknown;
  try {
    config = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in config file "${configPath}"`);
  }

  if (typeof config !== "object" || config === null) {
    throw new Error(`Config file "${configPath}" must contain a JSON object`);
  }

  const obj = config as Record<string, unknown>;
  const servers = obj["mcpServers"] as Record<string, McpServerConfig> | undefined;

  if (!servers || typeof servers !== "object") {
    throw new Error(`Config file "${configPath}" is missing "mcpServers" object`);
  }

  const serverNames = Object.keys(servers);
  if (serverNames.length === 0) {
    throw new Error(`Config file "${configPath}" has no server entries`);
  }

  let selectedName: string;
  if (serverName) {
    if (!servers[serverName]) {
      throw new Error(
        `Server "${serverName}" not found in config. Available: ${serverNames.join(", ")}`,
      );
    }
    selectedName = serverName;
  } else if (serverNames.length === 1) {
    selectedName = serverNames[0] as string;
  } else {
    throw new Error(
      `Multiple servers in config. Use --server to select one: ${serverNames.join(", ")}`,
    );
  }

  const entry = servers[selectedName];
  if (!entry) {
    throw new Error(`Server "${selectedName}" not found in config`);
  }

  if (entry.url) {
    return { transport: "streamable-http", url: entry.url };
  }

  if (entry.command) {
    return {
      transport: "stdio",
      command: entry.command,
      args: entry.args,
      env: entry.env,
    };
  }

  throw new Error(`Server "${selectedName}" has neither "command" nor "url" configured`);
}
