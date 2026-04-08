/**
 * MCP SDK wrapper for the test package.
 *
 * Handles connecting to MCP servers, listing tools/resources/prompts,
 * and calling tools — the operations needed for contract testing.
 */

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
import type { TestConnection, TestServerConfig, ToolCallResult } from "./types.js";

/** Data captured from a live MCP server. */
export interface CapturedServerData {
  tools: RawTool[];
  resources: RawResource[];
  resourceTemplates: RawResourceTemplate[];
  prompts: RawPrompt[];
}

/**
 * Connects to an MCP server using the given configuration.
 *
 * @param config - Server connection configuration.
 * @returns An active TestConnection.
 */
export async function connectToServer(config: TestServerConfig): Promise<TestConnection> {
  const client = new Client({ name: "mcp-test", version: "0.5.0" });
  const timeoutMs = config.timeoutMs ?? 30_000;

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
    const opts = config.headers ? { requestInit: { headers: config.headers } } : {};
    transport = new SSEClientTransport(new URL(config.url), opts);
  } else {
    if (!config.url) {
      throw new Error("streamable-http transport requires a URL");
    }
    const opts = config.headers ? { requestInit: { headers: config.headers } } : undefined;
    transport = opts
      ? new StreamableHTTPClientTransport(new URL(config.url), opts)
      : new StreamableHTTPClientTransport(new URL(config.url));
  }

  await client.connect(transport, { signal: AbortSignal.timeout(timeoutMs) });

  const serverVersion = client.getServerVersion();

  return {
    client,
    transport,
    serverName: serverVersion?.name ?? "unknown",
    serverVersion: serverVersion?.version ?? "unknown",
    protocolVersion: LATEST_PROTOCOL_VERSION,
  };
}

/**
 * Lists all tools from the server, paginating through results.
 *
 * @param connection - The active server connection.
 * @returns Array of raw tool data.
 */
export async function listServerTools(connection: TestConnection): Promise<RawTool[]> {
  const tools: RawTool[] = [];
  let cursor: string | undefined;
  do {
    const result = await connection.client.listTools(cursor ? { cursor } : undefined);
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
  return tools;
}

/**
 * Lists all resources from the server, paginating through results.
 *
 * @param connection - The active server connection.
 * @returns Array of raw resource data.
 */
export async function listServerResources(connection: TestConnection): Promise<RawResource[]> {
  const resources: RawResource[] = [];
  let cursor: string | undefined;
  do {
    const result = await connection.client.listResources(cursor ? { cursor } : undefined);
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
 * @param connection - The active server connection.
 * @returns Array of raw resource template data.
 */
export async function listServerResourceTemplates(
  connection: TestConnection,
): Promise<RawResourceTemplate[]> {
  const templates: RawResourceTemplate[] = [];
  let cursor: string | undefined;
  do {
    const result = await connection.client.listResourceTemplates(cursor ? { cursor } : undefined);
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
 * @param connection - The active server connection.
 * @returns Array of raw prompt data.
 */
export async function listServerPrompts(connection: TestConnection): Promise<RawPrompt[]> {
  const prompts: RawPrompt[] = [];
  let cursor: string | undefined;
  do {
    const result = await connection.client.listPrompts(cursor ? { cursor } : undefined);
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
 * @param connection - The active server connection.
 * @returns All captured server data (tools, resources, templates, prompts).
 */
export async function captureServerData(connection: TestConnection): Promise<CapturedServerData> {
  const capabilities = connection.client.getServerCapabilities() ?? {};

  let tools: RawTool[] = [];
  let resources: RawResource[] = [];
  let resourceTemplates: RawResourceTemplate[] = [];
  let prompts: RawPrompt[] = [];

  if (capabilities.tools) {
    tools = await listServerTools(connection);
  }

  if (capabilities.resources) {
    resources = await listServerResources(connection);
    resourceTemplates = await listServerResourceTemplates(connection);
  }

  if (capabilities.prompts) {
    prompts = await listServerPrompts(connection);
  }

  return { tools, resources, resourceTemplates, prompts };
}

/**
 * Calls a tool on the MCP server and normalizes the result.
 *
 * @param connection - The active server connection.
 * @param toolName - The name of the tool to call.
 * @param args - Arguments to pass to the tool.
 * @param timeoutMs - Timeout for the call in ms. Default: 10000.
 * @returns Normalized tool call result.
 */
export async function callServerTool(
  connection: TestConnection,
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs = 10_000,
): Promise<ToolCallResult> {
  const result = await connection.client.callTool({ name: toolName, arguments: args }, undefined, {
    signal: AbortSignal.timeout(timeoutMs),
  });

  const content = (result.content ?? []) as Array<{
    type: string;
    text?: string;
    [key: string]: unknown;
  }>;

  const firstText = content.find((c) => c.type === "text")?.text;

  return {
    isError: result.isError === true,
    content,
    structuredContent: result.structuredContent as Record<string, unknown> | undefined,
    text: firstText,
  };
}

/**
 * Closes the connection to the MCP server.
 *
 * @param connection - The connection to close.
 */
export async function closeConnection(connection: TestConnection): Promise<void> {
  await connection.transport.close();
}
