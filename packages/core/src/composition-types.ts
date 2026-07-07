/**
 * Multi-server composition types.
 *
 * These types describe collections of MCP server snapshots ("compositions"),
 * tool namespace collisions across servers, composition-wide diff reports,
 * and the server/tool dependency graph.
 *
 * @see SPEC.md section 7 for the multi-server specification.
 */

import type { DiffReport } from "./diff-types.js";
import type { MCPContractSnapshot } from "./types.js";

/** A named snapshot within a multi-server composition. */
export interface ServerSnapshotEntry {
  /**
   * The server's name within the composition. This is the key from the
   * mcp.json `mcpServers` object, which is stable across captures even if
   * the server renames itself.
   */
  serverName: string;
  /** The server's contract snapshot. */
  snapshot: MCPContractSnapshot;
}

/**
 * How two same-named tools relate across servers.
 *
 * - `exact`: identical input/output schemas — redundant but compatible.
 * - `conflicting`: different schemas — ambiguous for agents and dangerous
 *   when a client routes by bare tool name.
 */
export type CollisionKind = "exact" | "conflicting";

/** A single tool name that appears on more than one server. */
export interface ToolCollision {
  /** The colliding tool name. */
  toolName: string;
  /** Names of all servers exposing a tool with this name. */
  servers: string[];
  /** Whether the duplicate definitions are identical or conflicting. */
  kind: CollisionKind;
  /** A human-readable resolution suggestion (e.g., namespaced names). */
  suggestion: string;
}

/** Summary counts for a collision report. */
export interface CollisionSummary {
  /** Number of exact (same-schema) duplicates. */
  exact: number;
  /** Number of conflicting (different-schema) duplicates. */
  conflicting: number;
  /** Total collisions. */
  total: number;
}

/** The result of scanning a composition for tool name collisions. */
export interface CollisionReport {
  /** Number of servers scanned. */
  serversScanned: number;
  /** Total number of tools across all servers. */
  toolsScanned: number;
  /** All detected collisions, conflicting first, then alphabetical. */
  collisions: ToolCollision[];
  /** Summary counts. */
  summary: CollisionSummary;
}

/**
 * Per-server outcome within a composition diff.
 *
 * - `diffed`: a baseline was found and compared.
 * - `missing-baseline`: the server is configured but has no baseline.
 * - `missing-server`: a baseline exists but the server is gone from the composition.
 */
export type ServerDiffStatus = "diffed" | "missing-baseline" | "missing-server";

/** The diff outcome for a single server within a composition. */
export interface ServerDiffEntry {
  /** The server's composition name. */
  serverName: string;
  /** Outcome of matching this server against the baselines. */
  status: ServerDiffStatus;
  /** The diff report. Only present when status is "diffed". */
  report?: DiffReport;
}

/** Aggregated summary across all servers in a composition diff. */
export interface CompositionSummary {
  /** Number of servers considered (union of baselines and current servers). */
  servers: number;
  /** Servers that were successfully diffed against a baseline. */
  diffed: number;
  /** Servers with no matching baseline. */
  missingBaselines: number;
  /** Baselines with no matching server. */
  missingServers: number;
  /** Total breaking changes across all servers. */
  breaking: number;
  /** Total warning changes across all servers. */
  warning: number;
  /** Total safe changes across all servers. */
  safe: number;
  /** Total changes across all servers. */
  total: number;
}

/** A unified diff report across all servers in a composition. */
export interface CompositionDiffReport {
  /** ISO 8601 timestamp of when this report was generated. */
  generatedAt: string;
  /** Name and version of the tool that generated the report. */
  tool: string;
  /** Per-server entries, ordered by server name. */
  servers: ServerDiffEntry[];
  /** Aggregated summary. */
  summary: CompositionSummary;
}

/** A single server node in the dependency graph. */
export interface GraphServer {
  /** The server's composition name. */
  name: string;
  /** The server's self-reported version. */
  version: string;
  /** Names of all tools the server exposes. */
  tools: string[];
  /** Number of resources (including templates) the server exposes. */
  resourceCount: number;
  /** Number of prompts the server exposes. */
  promptCount: number;
}

/** A tool name shared between two or more servers. */
export interface GraphOverlap {
  /** The shared tool name. */
  toolName: string;
  /** Names of the servers exposing this tool. */
  servers: string[];
  /** Whether all definitions are schema-identical. */
  identical: boolean;
}

/** A dependency graph of a multi-server composition. */
export interface DependencyGraph {
  /** All servers in the composition, ordered by name. */
  servers: GraphServer[];
  /** Tool name overlaps between servers. */
  overlaps: GraphOverlap[];
}
