import type {
  PaginationLimits,
  RawPrompt,
  RawResource,
  RawResourceTemplate,
  RawTool,
} from "@mcp-contracts/core";
import { collectPages, DEFAULT_PAGINATION_LIMITS } from "@mcp-contracts/core";
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
  /** Working directory for the spawned stdio server (defaults to the CWD). */
  cwd?: string;
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
      cwd: config.cwd,
    });
  } else if (config.transport === "sse") {
    if (!config.url) {
      throw new Error("sse transport requires a URL");
    }
    const sseOpts = config.headers ? { requestInit: { headers: config.headers } } : {};
    transport = new SSEClientTransport(new URL(config.url), sseOpts);
  } else {
    if (!config.url) {
      throw new Error("streamable-http transport requires a URL");
    }
    const httpOpts = config.headers ? { requestInit: { headers: config.headers } } : undefined;
    transport = httpOpts
      ? new StreamableHTTPClientTransport(new URL(config.url), httpOpts)
      : new StreamableHTTPClientTransport(new URL(config.url));
  }

  // The SDK reports the negotiated protocol version to the transport (when the
  // transport exposes the hook) and nowhere else; record it so the snapshot
  // carries the version actually in use rather than the SDK's latest constant.
  let negotiated: string | undefined;
  const forward = transport.setProtocolVersion?.bind(transport);
  transport.setProtocolVersion = (version: string) => {
    negotiated = version;
    forward?.(version);
  };

  await client.connect(transport, { signal: AbortSignal.timeout(30_000) });

  return { client, transport, protocolVersion: negotiated ?? LATEST_PROTOCOL_VERSION };
}

/** A list call that failed for a capability the server advertises. */
interface DiscoveryFailure {
  label: string;
  message: string;
}

/**
 * Runs a list call for an advertised capability, recording the failure
 * instead of letting it escape so that every failing call is reported.
 *
 * @param label - What is being listed (e.g., "tools").
 * @param list - The list call to run.
 * @param failures - Accumulator for failed calls.
 * @returns The listed items, or an empty array when the call failed.
 */
async function listOrRecord<T>(
  label: string,
  list: () => Promise<T[]>,
  failures: DiscoveryFailure[],
): Promise<T[]> {
  try {
    return await list();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push({ label, message });
    return [];
  }
}

/** Overall time budget for one capture, across all list calls. */
const CAPTURE_DEADLINE_MS = 5 * 60 * 1000;

/**
 * Lists all tools from the server, paginating within bounds.
 *
 * @param client - The connected MCP client.
 * @param limits - Pagination bounds.
 * @returns Array of raw tool data.
 */
async function listAllTools(client: Client, limits: PaginationLimits): Promise<RawTool[]> {
  return collectPages(
    "tools",
    async (cursor) => {
      const result = await client.listTools(cursor ? { cursor } : undefined);
      return {
        items: result.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema as RawTool["inputSchema"],
          ...(tool.outputSchema && {
            outputSchema: tool.outputSchema as Record<string, unknown>,
          }),
          ...(tool.annotations && { annotations: tool.annotations as Record<string, unknown> }),
        })),
        nextCursor: result.nextCursor,
      };
    },
    limits,
  );
}

/**
 * Lists all resources from the server, paginating within bounds.
 *
 * @param client - The connected MCP client.
 * @param limits - Pagination bounds.
 * @returns Array of raw resource data.
 */
async function listAllResources(client: Client, limits: PaginationLimits): Promise<RawResource[]> {
  return collectPages(
    "resources",
    async (cursor) => {
      const result = await client.listResources(cursor ? { cursor } : undefined);
      return {
        items: result.resources.map((resource) => ({
          uri: resource.uri,
          name: resource.name,
          description: resource.description,
          mimeType: resource.mimeType,
        })),
        nextCursor: result.nextCursor,
      };
    },
    limits,
  );
}

/**
 * Lists all resource templates from the server, paginating within bounds.
 *
 * @param client - The connected MCP client.
 * @param limits - Pagination bounds.
 * @returns Array of raw resource template data.
 */
async function listAllResourceTemplates(
  client: Client,
  limits: PaginationLimits,
): Promise<RawResourceTemplate[]> {
  return collectPages(
    "resource templates",
    async (cursor) => {
      const result = await client.listResourceTemplates(cursor ? { cursor } : undefined);
      return {
        items: result.resourceTemplates.map((template) => ({
          uriTemplate: template.uriTemplate,
          name: template.name,
          description: template.description,
          mimeType: template.mimeType,
        })),
        nextCursor: result.nextCursor,
      };
    },
    limits,
  );
}

/**
 * Lists all prompts from the server, paginating within bounds.
 *
 * @param client - The connected MCP client.
 * @param limits - Pagination bounds.
 * @returns Array of raw prompt data.
 */
async function listAllPrompts(client: Client, limits: PaginationLimits): Promise<RawPrompt[]> {
  return collectPages(
    "prompts",
    async (cursor) => {
      const result = await client.listPrompts(cursor ? { cursor } : undefined);
      return {
        items: result.prompts.map((prompt) => ({
          name: prompt.name,
          description: prompt.description,
          arguments: prompt.arguments as RawPrompt["arguments"],
        })),
        nextCursor: result.nextCursor,
      };
    },
    limits,
  );
}

/**
 * Captures all available data from a connected MCP server.
 *
 * Lists tools, resources, resource templates, and prompts based on server
 * capabilities. Discovery fails closed: if any list call for an advertised
 * capability fails, the whole capture is rejected rather than producing a
 * snapshot that is indistinguishable from a genuinely empty interface.
 *
 * @param client - The connected MCP client.
 * @returns All captured server data.
 * @throws Error when any advertised capability cannot be listed.
 */
export async function captureServerData(client: Client): Promise<CapturedData> {
  const capabilities = client.getServerCapabilities() ?? {};
  const failures: DiscoveryFailure[] = [];
  const limits: PaginationLimits = {
    ...DEFAULT_PAGINATION_LIMITS,
    deadline: Date.now() + CAPTURE_DEADLINE_MS,
  };

  let tools: RawTool[] = [];
  let resources: RawResource[] = [];
  let resourceTemplates: RawResourceTemplate[] = [];
  let prompts: RawPrompt[] = [];

  if (capabilities.tools) {
    tools = await listOrRecord("tools", () => listAllTools(client, limits), failures);
  }

  if (capabilities.resources) {
    resources = await listOrRecord("resources", () => listAllResources(client, limits), failures);
    resourceTemplates = await listOrRecord(
      "resource templates",
      () => listAllResourceTemplates(client, limits),
      failures,
    );
  }

  if (capabilities.prompts) {
    prompts = await listOrRecord("prompts", () => listAllPrompts(client, limits), failures);
  }

  if (failures.length > 0) {
    const detail = failures.map((f) => `${f.label}: ${f.message}`).join("; ");
    throw new Error(`Discovery incomplete — failed to list ${detail}`);
  }

  return { tools, resources, resourceTemplates, prompts };
}
