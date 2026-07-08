/**
 * Test helpers for building minimal multi-server compositions.
 */

import type { ServerSnapshotEntry } from "../composition-types.js";
import { computeContentHash } from "../hash.js";
import type {
  MCPContractSnapshot,
  PromptContract,
  ResourceContract,
  ToolContract,
} from "../types.js";

/** Optional collections for {@link makeSnapshot}. */
export interface MakeSnapshotExtras {
  resources?: Record<string, ResourceContract>;
  prompts?: Record<string, PromptContract>;
  version?: string;
}

/**
 * Builds a minimal, hash-consistent snapshot for tests.
 *
 * @param serverName - The server name to embed in the snapshot.
 * @param tools - Tools record, keyed by tool name.
 * @param extras - Optional resources, prompts, and server version.
 * @returns A complete MCPContractSnapshot.
 */
export function makeSnapshot(
  serverName: string,
  tools: Record<string, ToolContract> = {},
  extras: MakeSnapshotExtras = {},
): MCPContractSnapshot {
  const resources = extras.resources ?? {};
  const prompts = extras.prompts ?? {};
  return {
    snapshotVersion: "1.0.0",
    capturedAt: "2026-01-01T00:00:00.000Z",
    contentHash: computeContentHash(tools, resources, prompts),
    server: {
      name: serverName,
      version: extras.version ?? "1.0.0",
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
    },
    capture: { transport: "stdio", tool: "mcpdiff/test" },
    tools,
    resources,
    prompts,
  };
}

/**
 * Wraps a snapshot as a named composition entry.
 *
 * @param serverName - The composition name for the server.
 * @param snapshot - The server's snapshot.
 * @returns A ServerSnapshotEntry.
 */
export function entry(serverName: string, snapshot: MCPContractSnapshot): ServerSnapshotEntry {
  return { serverName, snapshot };
}

/**
 * Builds a simple tool contract for composition tests.
 *
 * @param description - The tool description.
 * @param properties - Input schema properties.
 * @returns A ToolContract with an object input schema.
 */
export function tool(description: string, properties: Record<string, unknown> = {}): ToolContract {
  return {
    description,
    inputSchema: { type: "object", properties: properties as ToolContract["inputSchema"] },
  };
}
