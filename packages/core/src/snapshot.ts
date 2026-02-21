import { computeContentHash } from "./hash.js";
import type {
  JSONSchema,
  MCPContractSnapshot,
  PromptArgument,
  PromptContract,
  ResourceContract,
  SnapshotCapture,
  SnapshotServer,
  ToolContract,
} from "./types.js";
import { SNAPSHOT_VERSION } from "./types.js";

/**
 * A raw MCP tool definition as returned by tools/list.
 * Mirrors the Tool type from @modelcontextprotocol/sdk.
 */
export interface RawTool {
  name: string;
  description?: string;
  inputSchema: JSONSchema & { type: "object" };
  outputSchema?: JSONSchema;
  annotations?: Record<string, unknown>;
}

/**
 * A raw MCP resource definition as returned by resources/list.
 * Mirrors the Resource type from @modelcontextprotocol/sdk.
 */
export interface RawResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * A raw MCP resource template as returned by resourceTemplates/list.
 * Mirrors the ResourceTemplate type from @modelcontextprotocol/sdk.
 */
export interface RawResourceTemplate {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * A raw MCP prompt definition as returned by prompts/list.
 * Mirrors the Prompt type from @modelcontextprotocol/sdk.
 */
export interface RawPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

/** Parameters for creating a snapshot. */
export interface CreateSnapshotParams {
  /** Server information from the initialization handshake. */
  server: SnapshotServer;
  /** Raw tool definitions from tools/list. */
  tools: RawTool[];
  /** Raw resource definitions from resources/list. */
  resources: RawResource[];
  /** Raw resource template definitions from resourceTemplates/list. */
  resourceTemplates: RawResourceTemplate[];
  /** Raw prompt definitions from prompts/list. */
  prompts: RawPrompt[];
  /** Capture metadata. */
  capture: SnapshotCapture;
}

/**
 * Transforms an array of raw MCP tool definitions into a keyed record of ToolContracts.
 *
 * @param tools - Raw tool definitions from tools/list.
 * @returns Record keyed by tool name.
 */
export function normalizeTools(tools: RawTool[]): Record<string, ToolContract> {
  const result: Record<string, ToolContract> = {};
  for (const tool of tools) {
    const contract: ToolContract = {
      description: tool.description ?? "",
      inputSchema: tool.inputSchema,
    };
    if (tool.outputSchema !== undefined) {
      contract.outputSchema = tool.outputSchema;
    }
    if (tool.annotations !== undefined) {
      contract.annotations = tool.annotations;
    }
    result[tool.name] = contract;
  }
  return result;
}

/**
 * Transforms arrays of raw MCP resources and resource templates into a keyed record.
 *
 * Resources are keyed by URI, resource templates by URI template.
 *
 * @param resources - Raw resource definitions from resources/list.
 * @param resourceTemplates - Raw resource template definitions from resourceTemplates/list.
 * @returns Record keyed by resource URI or template URI.
 */
export function normalizeResources(
  resources: RawResource[],
  resourceTemplates: RawResourceTemplate[],
): Record<string, ResourceContract> {
  const result: Record<string, ResourceContract> = {};
  for (const resource of resources) {
    result[resource.uri] = {
      description: resource.description ?? "",
      isTemplate: false,
      ...(resource.mimeType !== undefined && { mimeType: resource.mimeType }),
    };
  }
  for (const template of resourceTemplates) {
    result[template.uriTemplate] = {
      description: template.description ?? "",
      isTemplate: true,
      ...(template.mimeType !== undefined && { mimeType: template.mimeType }),
    };
  }
  return result;
}

/**
 * Transforms an array of raw MCP prompt definitions into a keyed record.
 *
 * @param prompts - Raw prompt definitions from prompts/list.
 * @returns Record keyed by prompt name.
 */
export function normalizePrompts(prompts: RawPrompt[]): Record<string, PromptContract> {
  const result: Record<string, PromptContract> = {};
  for (const prompt of prompts) {
    const args: PromptArgument[] = (prompt.arguments ?? []).map((arg) => {
      const normalized: PromptArgument = { name: arg.name };
      if (arg.description !== undefined) {
        normalized.description = arg.description;
      }
      if (arg.required !== undefined) {
        normalized.required = arg.required;
      }
      return normalized;
    });
    result[prompt.name] = {
      description: prompt.description ?? "",
      arguments: args,
    };
  }
  return result;
}

/**
 * Creates a complete MCP Contract Snapshot from raw MCP server data.
 *
 * This is the adapter layer between the MCP SDK types and the snapshot format.
 * It normalizes arrays into keyed records, computes the content hash, and
 * sets all required metadata fields.
 *
 * @param params - The raw server data and capture metadata.
 * @returns A complete MCPContractSnapshot ready for serialization.
 */
export function createSnapshot(params: CreateSnapshotParams): MCPContractSnapshot {
  const tools = normalizeTools(params.tools);
  const resources = normalizeResources(params.resources, params.resourceTemplates);
  const prompts = normalizePrompts(params.prompts);
  const contentHash = computeContentHash(tools, resources, prompts);

  return {
    snapshotVersion: SNAPSHOT_VERSION,
    capturedAt: new Date().toISOString(),
    contentHash,
    server: params.server,
    capture: params.capture,
    tools,
    resources,
    prompts,
  };
}
