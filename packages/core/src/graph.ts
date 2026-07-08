/**
 * Dependency graph builder.
 *
 * Builds a graph of a multi-server composition: one node per server with its
 * exposed tools, plus overlap edges for tool names shared between servers.
 */

import { detectToolCollisions } from "./collision.js";
import type {
  DependencyGraph,
  GraphOverlap,
  GraphServer,
  ServerSnapshotEntry,
} from "./composition-types.js";

/**
 * Builds a dependency graph from a composition of server snapshots.
 *
 * Overlaps are derived from tool name collisions: each tool name exposed by
 * two or more servers becomes an overlap edge, marked identical when all
 * definitions share the same input/output schemas.
 *
 * @param entries - The composition's server snapshots.
 * @returns The dependency graph, servers ordered by name.
 */
export function buildDependencyGraph(entries: ServerSnapshotEntry[]): DependencyGraph {
  const servers: GraphServer[] = entries
    .map((entry) => ({
      name: entry.serverName,
      version: entry.snapshot.server.version,
      tools: Object.keys(entry.snapshot.tools).sort((a, b) => a.localeCompare(b)),
      resourceCount: Object.keys(entry.snapshot.resources).length,
      promptCount: Object.keys(entry.snapshot.prompts).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const collisions = detectToolCollisions(entries).collisions;
  const overlaps: GraphOverlap[] = collisions
    .map((c) => ({
      toolName: c.toolName,
      servers: [...c.servers].sort((a, b) => a.localeCompare(b)),
      identical: c.kind === "exact",
    }))
    .sort((a, b) => a.toolName.localeCompare(b.toolName));

  return { servers, overlaps };
}
