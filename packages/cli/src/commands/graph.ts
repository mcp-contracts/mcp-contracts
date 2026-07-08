/**
 * The `graph` command.
 *
 * Connects to every server in an mcp.json composition and renders a
 * dependency graph of servers, their tools, and tool name overlaps.
 */

import type { DependencyGraph, GraphFormat } from "@mcp-contracts/core";
import {
  buildDependencyGraph,
  formatGraphDot,
  formatGraphJson,
  formatGraphMermaid,
  formatGraphTerminal,
} from "@mcp-contracts/core";
import { Command } from "commander";
import { listConfigServers } from "../mcp-config.js";
import { handleErrors, writeOutput } from "../utils.js";
import { captureAllServers } from "./capture-all.js";

/** Valid values for the graph --format option. */
const GRAPH_FORMATS = new Set<string>(["terminal", "mermaid", "dot", "json"]);

/**
 * Formats a dependency graph in the requested output format.
 *
 * @param graph - The dependency graph.
 * @param format - The graph output format.
 * @returns The formatted graph string.
 */
export function formatGraph(graph: DependencyGraph, format: GraphFormat): string {
  if (format === "mermaid") {
    return formatGraphMermaid(graph);
  }
  if (format === "dot") {
    return formatGraphDot(graph);
  }
  if (format === "json") {
    return formatGraphJson(graph);
  }
  return formatGraphTerminal(graph);
}

/**
 * Resolves the graph output format from the global --format option.
 *
 * The graph command reuses the global --format flag but supports its own
 * set of formats (terminal, mermaid, dot, json) instead of the usual
 * terminal/json/markdown.
 *
 * @param format - The global --format value, if provided.
 * @returns The resolved graph format, defaulting to terminal.
 */
export function resolveGraphFormat(format: string | undefined): GraphFormat {
  if (!format) {
    return "terminal";
  }
  if (!GRAPH_FORMATS.has(format)) {
    throw new Error(
      `Invalid --format value "${format}" for graph. Must be one of: terminal, mermaid, dot, json`,
    );
  }
  return format as GraphFormat;
}

/**
 * Creates the `graph` subcommand for the mcpdiff CLI.
 *
 * @returns A Commander Command instance for the graph subcommand.
 */
export function createGraphCommand(): Command {
  const cmd = new Command("graph")
    .description(
      "Render a dependency graph of all servers in an mcp.json config " +
        "(--format terminal | mermaid | dot | json)",
    )
    .requiredOption("--config <path>", "Path to mcp.json config file");

  cmd.action(
    handleErrors(async (options: Record<string, unknown>) => {
      const parentOpts = cmd.parent?.opts() ?? {};
      const quiet = parentOpts["quiet"] === true;
      const outputPath = parentOpts["output"] as string | undefined;
      const format = resolveGraphFormat(parentOpts["format"] as string | undefined);

      const servers = listConfigServers(options["config"] as string);
      const { entries, failures } = await captureAllServers(servers, quiet);

      const graph = buildDependencyGraph(entries);
      writeOutput(`${formatGraph(graph, format)}\n`, outputPath);

      if (failures.length > 0) {
        const failed = failures.map((f) => `${f.serverName} (${f.error})`).join(", ");
        throw new Error(
          `Graph incomplete — failed to capture ${failures.length} server(s): ${failed}`,
        );
      }
    }),
  );

  return cmd;
}
