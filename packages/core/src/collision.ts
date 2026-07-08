/**
 * Tool namespace collision detection.
 *
 * Detects tool names that appear on more than one server in a composition.
 * Collisions are classified as "exact" (schema-identical duplicates) or
 * "conflicting" (same name, different schemas) — the latter is dangerous
 * for agents and clients that route tool calls by bare tool name.
 */

import type {
  CollisionKind,
  CollisionReport,
  ServerSnapshotEntry,
  ToolCollision,
} from "./composition-types.js";
import { sortKeys } from "./hash.js";
import type { ToolContract } from "./types.js";

/**
 * Computes a canonical string for the schema-relevant parts of a tool contract.
 *
 * Only `inputSchema` and `outputSchema` participate — descriptions and
 * annotations may legitimately differ between servers without making the
 * duplicate tools behaviorally incompatible.
 *
 * @param tool - The tool contract to canonicalize.
 * @returns A canonical JSON string of the tool's schemas.
 */
function canonicalSchema(tool: ToolContract): string {
  return JSON.stringify(
    sortKeys({
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema ?? null,
    }),
  );
}

/**
 * Builds a namespacing suggestion for a colliding tool name.
 *
 * @param toolName - The colliding tool name.
 * @param servers - The servers exposing the tool.
 * @returns A human-readable resolution suggestion.
 */
function buildSuggestion(toolName: string, servers: string[]): string {
  const namespaced = servers.map((s) => `${s}_${toolName}`).join(", ");
  return `Namespace the tool per server (e.g., ${namespaced}) or expose it from a single server.`;
}

/**
 * Detects tool name collisions across the servers of a composition.
 *
 * A collision is any tool name exposed by two or more servers. Collisions
 * where every definition has identical input/output schemas are classified
 * as "exact"; any schema difference makes the collision "conflicting".
 *
 * @param entries - The composition's server snapshots.
 * @returns A collision report with conflicting collisions first, then alphabetical by tool name.
 */
export function detectToolCollisions(entries: ServerSnapshotEntry[]): CollisionReport {
  const byToolName = new Map<string, Array<{ serverName: string; canonical: string }>>();
  let toolsScanned = 0;

  for (const entry of entries) {
    for (const [toolName, tool] of Object.entries(entry.snapshot.tools)) {
      toolsScanned += 1;
      const holders = byToolName.get(toolName) ?? [];
      holders.push({ serverName: entry.serverName, canonical: canonicalSchema(tool) });
      byToolName.set(toolName, holders);
    }
  }

  const collisions: ToolCollision[] = [];
  for (const [toolName, holders] of byToolName) {
    if (holders.length < 2) continue;

    const firstCanonical = holders[0]?.canonical;
    const identical = holders.every((h) => h.canonical === firstCanonical);
    const kind: CollisionKind = identical ? "exact" : "conflicting";
    const servers = holders.map((h) => h.serverName);

    collisions.push({
      toolName,
      servers,
      kind,
      suggestion: buildSuggestion(toolName, servers),
    });
  }

  collisions.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "conflicting" ? -1 : 1;
    }
    return a.toolName.localeCompare(b.toolName);
  });

  const exact = collisions.filter((c) => c.kind === "exact").length;
  const conflicting = collisions.length - exact;

  return {
    serversScanned: entries.length,
    toolsScanned,
    collisions,
    summary: { exact, conflicting, total: collisions.length },
  };
}
