import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RawTool, ServerSnapshotEntry } from "@mcp-contracts/core";
import { buildDependencyGraph, createSnapshot } from "@mcp-contracts/core";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatGraph, resolveGraphFormat } from "./graph.js";

/**
 * Builds a snapshot entry with the given tools.
 *
 * @param serverName - The composition name.
 * @param tools - Raw tool definitions.
 * @returns A ServerSnapshotEntry.
 */
function makeEntry(serverName: string, tools: RawTool[]): ServerSnapshotEntry {
  return {
    serverName,
    snapshot: createSnapshot({
      server: {
        name: serverName,
        version: "1.0.0",
        protocolVersion: "2025-03-26",
        capabilities: {},
      },
      tools,
      resources: [],
      resourceTemplates: [],
      prompts: [],
      capture: { transport: "stdio", source: "node", tool: "mcpdiff/test" },
    }),
  };
}

const searchTool: RawTool = {
  name: "search",
  description: "Search",
  inputSchema: { type: "object", properties: { query: { type: "string" } } },
};

describe("resolveGraphFormat", () => {
  it("accepts graph-specific formats", () => {
    expect(resolveGraphFormat("mermaid")).toBe("mermaid");
    expect(resolveGraphFormat("dot")).toBe("dot");
    expect(resolveGraphFormat("json")).toBe("json");
  });

  it("defaults to terminal", () => {
    expect(resolveGraphFormat(undefined)).toBe("terminal");
  });

  it("rejects unknown formats", () => {
    expect(() => resolveGraphFormat("markdown")).toThrow('Invalid --format value "markdown"');
  });
});

describe("formatGraph", () => {
  const graph = buildDependencyGraph([
    makeEntry("github", [searchTool]),
    makeEntry("slack", [searchTool]),
  ]);

  it("dispatches to each formatter", () => {
    expect(formatGraph(graph, "terminal")).toContain("MCP Composition Graph");
    expect(formatGraph(graph, "mermaid")).toContain("graph TD");
    expect(formatGraph(graph, "dot")).toContain("graph mcp_composition {");
    expect(JSON.parse(formatGraph(graph, "json"))).toEqual(graph);
  });
});

describe("graph command", () => {
  const configPath = resolve(import.meta.dirname, "__tmp_graph_config.json");
  let stdoutData: string;
  let exitCode: number | undefined;

  beforeEach(() => {
    stdoutData = "";
    exitCode = undefined;
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          github: { command: "node", args: ["github.js"] },
          slack: { command: "node", args: ["slack.js"] },
        },
      }),
      "utf-8",
    );
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutData += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(process, "exit").mockImplementation((code) => {
      exitCode = code as number;
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    rmSync(configPath, { force: true });
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock("./capture-all.js");
  });

  it("renders the composition graph from live captures", async () => {
    vi.doMock("./capture-all.js", () => ({
      captureAllServers: vi.fn().mockResolvedValue({
        entries: [makeEntry("github", [searchTool]), makeEntry("slack", [searchTool])],
        failures: [],
      }),
    }));
    vi.resetModules();
    const { createGraphCommand } = await import("./graph.js");
    const program = new Command();
    program.option("--format <format>", "Output format").option("--quiet", "Quiet");
    program.addCommand(createGraphCommand());

    await program.parseAsync([
      "node",
      "mcpdiff",
      "--format",
      "mermaid",
      "graph",
      "--config",
      configPath,
    ]);

    expect(exitCode).toBeUndefined();
    expect(stdoutData).toContain("graph TD");
    expect(stdoutData).toContain("github");
    expect(stdoutData).toContain("slack");
  });

  it("exits 2 when a server cannot be captured", async () => {
    vi.doMock("./capture-all.js", () => ({
      captureAllServers: vi.fn().mockResolvedValue({
        entries: [makeEntry("github", [searchTool])],
        failures: [{ serverName: "slack", error: "connection refused" }],
      }),
    }));
    vi.resetModules();
    const { createGraphCommand } = await import("./graph.js");
    const program = new Command();
    program.option("--format <format>", "Output format").option("--quiet", "Quiet");
    program.addCommand(createGraphCommand());

    try {
      await program.parseAsync(["node", "mcpdiff", "graph", "--config", configPath]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(2);
  });
});
