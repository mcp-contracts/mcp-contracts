import { describe, expect, it } from "vitest";
import { entry, makeSnapshot, tool } from "./__fixtures__/composition-helpers.js";
import { buildDependencyGraph } from "./graph.js";

const searchSchema = { query: { type: "string" } };

function sampleGraph() {
  return buildDependencyGraph([
    entry(
      "github",
      makeSnapshot(
        "github",
        {
          search: tool("Search GitHub", searchSchema),
          create_issue: tool("Create an issue"),
        },
        {
          version: "1.2.0",
          resources: { "repo://readme": { description: "Readme", isTemplate: false } },
        },
      ),
    ),
    entry(
      "slack",
      makeSnapshot(
        "slack",
        {
          search: tool("Search Slack", { channel: { type: "string" } }),
          send_message: tool("Send a message"),
        },
        { version: "0.9.0" },
      ),
    ),
  ]);
}

describe("buildDependencyGraph", () => {
  it("creates one node per server, ordered by name", () => {
    const graph = sampleGraph();
    expect(graph.servers.map((s) => s.name)).toEqual(["github", "slack"]);
    expect(graph.servers[0]?.version).toBe("1.2.0");
  });

  it("lists each server's tools sorted", () => {
    const graph = sampleGraph();
    expect(graph.servers[0]?.tools).toEqual(["create_issue", "search"]);
  });

  it("counts resources and prompts", () => {
    const graph = sampleGraph();
    expect(graph.servers[0]?.resourceCount).toBe(1);
    expect(graph.servers[0]?.promptCount).toBe(0);
  });

  it("derives overlap edges from shared tool names", () => {
    const graph = sampleGraph();
    expect(graph.overlaps).toHaveLength(1);
    expect(graph.overlaps[0]).toEqual({
      toolName: "search",
      servers: ["github", "slack"],
      identical: false,
    });
  });

  it("marks schema-identical overlaps as identical", () => {
    const graph = buildDependencyGraph([
      entry("a", makeSnapshot("a", { ping: tool("Ping A") })),
      entry("b", makeSnapshot("b", { ping: tool("Ping B") })),
    ]);
    expect(graph.overlaps[0]?.identical).toBe(true);
  });

  it("handles an empty composition", () => {
    const graph = buildDependencyGraph([]);
    expect(graph.servers).toHaveLength(0);
    expect(graph.overlaps).toHaveLength(0);
  });
});
