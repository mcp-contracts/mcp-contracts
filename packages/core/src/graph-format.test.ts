import { describe, expect, it } from "vitest";
import type { DependencyGraph } from "./composition-types.js";
import {
  formatGraphDot,
  formatGraphJson,
  formatGraphMermaid,
  formatGraphTerminal,
} from "./graph-format.js";

const graph: DependencyGraph = {
  servers: [
    {
      name: "github",
      version: "1.2.0",
      tools: ["create_issue", "search"],
      resourceCount: 1,
      promptCount: 0,
    },
    {
      name: "slack",
      version: "0.9.0",
      tools: ["search", "send_message"],
      resourceCount: 0,
      promptCount: 2,
    },
  ],
  overlaps: [{ toolName: "search", servers: ["github", "slack"], identical: false }],
};

const emptyGraph: DependencyGraph = { servers: [], overlaps: [] };

describe("formatGraphTerminal", () => {
  it("renders servers with their tools as a tree", () => {
    const output = formatGraphTerminal(graph);
    expect(output).toContain("github (v1.2.0) — 2 tools, 1 resources, 0 prompts");
    expect(output).toContain("├── create_issue");
    expect(output).toContain("└── search");
  });

  it("annotates overlapping tools", () => {
    const output = formatGraphTerminal(graph);
    expect(output).toContain("⚠ also on slack (conflicting schema)");
    expect(output).toContain("search — github, slack (conflicting schemas)");
  });

  it("renders an empty composition without shared tools section", () => {
    const output = formatGraphTerminal(emptyGraph);
    expect(output).toContain("0 servers, 0 shared tool names");
    expect(output).not.toContain("Shared tool names:");
  });
});

describe("formatGraphMermaid", () => {
  it("emits a graph TD header and server nodes", () => {
    const output = formatGraphMermaid(graph);
    expect(output.startsWith("graph TD")).toBe(true);
    expect(output).toContain('s0["github v1.2.0 (2 tools)"]');
    expect(output).toContain('s1["slack v0.9.0 (2 tools)"]');
  });

  it("links overlapping servers through a shared tool node", () => {
    const output = formatGraphMermaid(graph);
    expect(output).toContain('t0(["search"])');
    expect(output).toContain("s0 -. conflict .- t0");
    expect(output).toContain("s1 -. conflict .- t0");
  });

  it("uses a plain edge for identical overlaps", () => {
    const identical: DependencyGraph = {
      ...graph,
      overlaps: [{ toolName: "search", servers: ["github", "slack"], identical: true }],
    };
    expect(formatGraphMermaid(identical)).toContain("s0 --- t0");
  });

  it("escapes quotes in labels", () => {
    const quoted: DependencyGraph = {
      servers: [{ name: 'we"ird', version: "1.0.0", tools: [], resourceCount: 0, promptCount: 0 }],
      overlaps: [],
    };
    expect(formatGraphMermaid(quoted)).toContain('\\"');
  });
});

describe("formatGraphDot", () => {
  it("emits a valid graph block with box server nodes", () => {
    const output = formatGraphDot(graph);
    expect(output.startsWith("graph mcp_composition {")).toBe(true);
    expect(output.trimEnd().endsWith("}")).toBe(true);
    expect(output).toContain('"github" [shape=box');
  });

  it("connects overlapping servers to a shared tool node", () => {
    const output = formatGraphDot(graph);
    expect(output).toContain('"tool:search" [shape=ellipse, label="search", color=red];');
    expect(output).toContain('"github" -- "tool:search";');
    expect(output).toContain('"slack" -- "tool:search";');
  });
});

describe("formatGraphJson", () => {
  it("round-trips the graph structure", () => {
    const output = formatGraphJson(graph);
    expect(JSON.parse(output)).toEqual(graph);
  });
});
