/**
 * Dependency graph formatters.
 *
 * Renders a DependencyGraph as terminal (ASCII), Mermaid, DOT (Graphviz),
 * or JSON output.
 */

import type { DependencyGraph, GraphOverlap } from "./composition-types.js";
import { sanitizeText } from "./sanitize.js";

/** Output formats supported by the graph command. */
export type GraphFormat = "terminal" | "mermaid" | "dot" | "json";

/**
 * Escapes a label for safe embedding in a double-quoted DOT string.
 *
 * @param label - The raw label text.
 * @returns The escaped label, with control sequences removed.
 */
function escapeDot(label: string): string {
  return sanitizeText(label)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, " ");
}

/**
 * Escapes a label for a Mermaid node. Mermaid does not honour backslash
 * escapes inside quoted labels; it uses HTML-style entities instead.
 *
 * @param label - The raw label text.
 * @returns The escaped label, with control sequences removed.
 */
function escapeMermaid(label: string): string {
  return sanitizeText(label)
    .replace(/#/g, "#35;")
    .replace(/"/g, "#quot;")
    .replace(/</g, "#lt;")
    .replace(/>/g, "#gt;")
    .replace(/[[\]{}()|]/g, (c) => `#${c.charCodeAt(0)};`)
    .replace(/[\r\n]+/g, " ");
}

/**
 * Describes an overlap's other servers from one server's perspective.
 *
 * @param overlap - The overlap to describe.
 * @param serverName - The server whose perspective to take.
 * @returns A short annotation string.
 */
function overlapNote(overlap: GraphOverlap, serverName: string): string {
  const others = overlap.servers.filter((s) => s !== serverName).join(", ");
  const kind = overlap.identical ? "identical schema" : "conflicting schema";
  return `also on ${others} (${kind})`;
}

/**
 * Formats a dependency graph as an ASCII tree for terminal display.
 *
 * @param graph - The dependency graph.
 * @returns A plain-text tree representation.
 */
export function formatGraphTerminal(graph: DependencyGraph): string {
  const lines: string[] = [];
  const overlapByTool = new Map(graph.overlaps.map((o) => [o.toolName, o]));

  lines.push("MCP Composition Graph");
  const serverWord = graph.servers.length === 1 ? "server" : "servers";
  const overlapWord = graph.overlaps.length === 1 ? "shared tool name" : "shared tool names";
  lines.push(`${graph.servers.length} ${serverWord}, ${graph.overlaps.length} ${overlapWord}`);
  lines.push("");

  for (const server of graph.servers) {
    const counts = `${server.tools.length} tools, ${server.resourceCount} resources, ${server.promptCount} prompts`;
    lines.push(`${server.name} (v${server.version}) — ${counts}`);
    server.tools.forEach((toolName, index) => {
      const connector = index === server.tools.length - 1 ? "└──" : "├──";
      const overlap = overlapByTool.get(toolName);
      let note = "";
      if (overlap?.servers.includes(server.name)) {
        note = ` ⚠ ${overlapNote(overlap, server.name)}`;
      }
      lines.push(`${connector} ${toolName}${note}`);
    });
    lines.push("");
  }

  if (graph.overlaps.length > 0) {
    lines.push("Shared tool names:");
    for (const overlap of graph.overlaps) {
      const kind = overlap.identical ? "identical schemas" : "conflicting schemas";
      lines.push(`  ${overlap.toolName} — ${overlap.servers.join(", ")} (${kind})`);
    }
  }

  return lines.join("\n").trimEnd();
}

/**
 * Formats a dependency graph as a Mermaid `graph TD` diagram.
 *
 * Servers become box nodes; tool names shared between servers become rounded
 * nodes with an edge from every exposing server.
 *
 * @param graph - The dependency graph.
 * @returns Mermaid diagram source.
 */
export function formatGraphMermaid(graph: DependencyGraph): string {
  const lines: string[] = ["graph TD"];
  const serverIds = new Map(graph.servers.map((s, i) => [s.name, `s${i}`]));

  for (const server of graph.servers) {
    const id = serverIds.get(server.name);
    lines.push(
      `  ${id}["${escapeMermaid(server.name)} v${escapeMermaid(server.version)} (${server.tools.length} tools)"]`,
    );
  }

  graph.overlaps.forEach((overlap, index) => {
    const toolId = `t${index}`;
    lines.push(`  ${toolId}(["${escapeMermaid(overlap.toolName)}"])`);
    for (const serverName of overlap.servers) {
      const serverId = serverIds.get(serverName);
      const edge = overlap.identical ? "---" : "-. conflict .-";
      lines.push(`  ${serverId} ${edge} ${toolId}`);
    }
  });

  return lines.join("\n");
}

/**
 * Formats a dependency graph as a DOT (Graphviz) undirected graph.
 *
 * @param graph - The dependency graph.
 * @returns DOT source.
 */
export function formatGraphDot(graph: DependencyGraph): string {
  const lines: string[] = ["graph mcp_composition {"];
  lines.push("  node [fontname=Helvetica];");

  for (const server of graph.servers) {
    const label = `${escapeDot(server.name)}\\nv${escapeDot(server.version)} (${server.tools.length} tools)`;
    lines.push(`  "${escapeDot(server.name)}" [shape=box, label="${label}"];`);
  }

  for (const overlap of graph.overlaps) {
    const toolNode = `tool:${overlap.toolName}`;
    const style = overlap.identical ? "" : ", color=red";
    lines.push(
      `  "${escapeDot(toolNode)}" [shape=ellipse, label="${escapeDot(overlap.toolName)}"${style}];`,
    );
    for (const serverName of overlap.servers) {
      lines.push(`  "${escapeDot(serverName)}" -- "${escapeDot(toolNode)}";`);
    }
  }

  lines.push("}");
  return lines.join("\n");
}

/**
 * Formats a dependency graph as pretty-printed JSON.
 *
 * @param graph - The dependency graph.
 * @returns Pretty-printed JSON string.
 */
export function formatGraphJson(graph: DependencyGraph): string {
  return JSON.stringify(graph, null, 2);
}
