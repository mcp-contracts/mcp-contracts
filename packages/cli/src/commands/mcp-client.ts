import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { RawPrompt, RawResource, RawResourceTemplate, RawTool } from "@mcp-contracts/core";

/** Resolved transport configuration for connecting to an MCP server. */
export interface ResolvedTransport {
  transport: "stdio" | "streamable-http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
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
  } else {
    if (!config.url) {
      throw new Error("streamable-http transport requires a URL");
    }
    transport = new StreamableHTTPClientTransport(new URL(config.url));
  }

  await client.connect(transport, { signal: AbortSignal.timeout(30_000) });

  return { client, transport, protocolVersion: LATEST_PROTOCOL_VERSION };
}

/**
 * Captures all available data from a connected MCP server.
 *
 * Lists tools, resources, resource templates, and prompts based on server capabilities.
 * Each list call is wrapped in try/catch to handle partial failures gracefully.
 * Handles pagination via nextCursor loop.
 *
 * @param client - The connected MCP client.
 * @returns All captured server data.
 */
export async function captureServerData(client: Client): Promise<CapturedData> {
  const capabilities = client.getServerCapabilities() ?? {};

  const tools: RawTool[] = [];
  const resources: RawResource[] = [];
  const resourceTemplates: RawResourceTemplate[] = [];
  const prompts: RawPrompt[] = [];

  if (capabilities.tools) {
    try {
      let cursor: string | undefined;
      do {
        const result = await client.listTools(cursor ? { cursor } : undefined);
        for (const tool of result.tools) {
          tools.push({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema as RawTool["inputSchema"],
            ...(tool.outputSchema && { outputSchema: tool.outputSchema as Record<string, unknown> }),
            ...(tool.annotations && { annotations: tool.annotations as Record<string, unknown> }),
          });
        }
        cursor = result.nextCursor;
      } while (cursor);
    } catch (err) {
      process.stderr.write(`Warning: Failed to list tools: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }

  if (capabilities.resources) {
    try {
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
    } catch (err) {
      process.stderr.write(`Warning: Failed to list resources: ${err instanceof Error ? err.message : String(err)}\n`);
    }

    try {
      let cursor: string | undefined;
      do {
        const result = await client.listResourceTemplates(cursor ? { cursor } : undefined);
        for (const template of result.resourceTemplates) {
          resourceTemplates.push({
            uriTemplate: template.uriTemplate,
            name: template.name,
            description: template.description,
            mimeType: template.mimeType,
          });
        }
        cursor = result.nextCursor;
      } while (cursor);
    } catch (err) {
      process.stderr.write(`Warning: Failed to list resource templates: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }

  if (capabilities.prompts) {
    try {
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
    } catch (err) {
      process.stderr.write(`Warning: Failed to list prompts: ${err instanceof Error ? err.message : String(err)}\n`);
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
export function readMcpConfig(configPath: string, serverName: string | undefined): ResolvedTransport {
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
  const servers = obj.mcpServers as Record<string, McpServerConfig> | undefined;

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
      throw new Error(`Server "${serverName}" not found in config. Available: ${serverNames.join(", ")}`);
    }
    selectedName = serverName;
  } else if (serverNames.length === 1) {
    selectedName = serverNames[0]!;
  } else {
    throw new Error(`Multiple servers in config. Use --server to select one: ${serverNames.join(", ")}`);
  }

  const entry = servers[selectedName]!;

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
