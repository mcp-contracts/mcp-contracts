import { describe, expect, it } from "vitest";
import { entry, makeSnapshot, tool } from "./__fixtures__/composition-helpers.js";
import { detectToolCollisions } from "./collision.js";

const searchSchema = { query: { type: "string" } };

describe("detectToolCollisions", () => {
  it("reports no collisions for disjoint tool names", () => {
    const report = detectToolCollisions([
      entry("github", makeSnapshot("github", { create_issue: tool("Create an issue") })),
      entry("slack", makeSnapshot("slack", { send_message: tool("Send a message") })),
    ]);
    expect(report.collisions).toHaveLength(0);
    expect(report.summary).toEqual({ exact: 0, conflicting: 0, total: 0 });
    expect(report.serversScanned).toBe(2);
    expect(report.toolsScanned).toBe(2);
  });

  it("classifies schema-identical duplicates as exact", () => {
    const report = detectToolCollisions([
      entry("github", makeSnapshot("github", { search: tool("Search GitHub", searchSchema) })),
      entry("slack", makeSnapshot("slack", { search: tool("Search Slack", searchSchema) })),
    ]);
    expect(report.collisions).toHaveLength(1);
    expect(report.collisions[0]?.toolName).toBe("search");
    expect(report.collisions[0]?.kind).toBe("exact");
    expect(report.collisions[0]?.servers).toEqual(["github", "slack"]);
  });

  it("ignores description differences when schemas match", () => {
    const report = detectToolCollisions([
      entry("a", makeSnapshot("a", { search: tool("Description A", searchSchema) })),
      entry("b", makeSnapshot("b", { search: tool("Description B", searchSchema) })),
    ]);
    expect(report.collisions[0]?.kind).toBe("exact");
  });

  it("classifies schema differences as conflicting", () => {
    const report = detectToolCollisions([
      entry("a", makeSnapshot("a", { search: tool("Search", searchSchema) })),
      entry("b", makeSnapshot("b", { search: tool("Search", { q: { type: "string" } }) })),
    ]);
    expect(report.collisions).toHaveLength(1);
    expect(report.collisions[0]?.kind).toBe("conflicting");
    expect(report.summary).toEqual({ exact: 0, conflicting: 1, total: 1 });
  });

  it("treats outputSchema differences as conflicting", () => {
    const base = tool("Search", searchSchema);
    const withOutput = { ...base, outputSchema: { type: "object" } };
    const report = detectToolCollisions([
      entry("a", makeSnapshot("a", { search: base })),
      entry("b", makeSnapshot("b", { search: withOutput })),
    ]);
    expect(report.collisions[0]?.kind).toBe("conflicting");
  });

  it("is insensitive to schema key ordering", () => {
    const report = detectToolCollisions([
      entry(
        "a",
        makeSnapshot("a", { t: tool("T", { x: { type: "string" }, y: { type: "number" } }) }),
      ),
      entry(
        "b",
        makeSnapshot("b", { t: tool("T", { y: { type: "number" }, x: { type: "string" } }) }),
      ),
    ]);
    expect(report.collisions[0]?.kind).toBe("exact");
  });

  it("detects collisions across three or more servers", () => {
    const report = detectToolCollisions([
      entry("a", makeSnapshot("a", { search: tool("S", searchSchema) })),
      entry("b", makeSnapshot("b", { search: tool("S", searchSchema) })),
      entry("c", makeSnapshot("c", { search: tool("S", { other: { type: "string" } }) })),
    ]);
    expect(report.collisions[0]?.servers).toEqual(["a", "b", "c"]);
    expect(report.collisions[0]?.kind).toBe("conflicting");
  });

  it("sorts conflicting collisions before exact ones, then alphabetically", () => {
    const report = detectToolCollisions([
      entry(
        "a",
        makeSnapshot("a", {
          alpha: tool("A", searchSchema),
          zeta: tool("Z", searchSchema),
          mid: tool("M", searchSchema),
        }),
      ),
      entry(
        "b",
        makeSnapshot("b", {
          alpha: tool("A", searchSchema),
          zeta: tool("Z", { different: { type: "boolean" } }),
          mid: tool("M", { different: { type: "boolean" } }),
        }),
      ),
    ]);
    expect(report.collisions.map((c) => c.toolName)).toEqual(["mid", "zeta", "alpha"]);
    expect(report.collisions.map((c) => c.kind)).toEqual(["conflicting", "conflicting", "exact"]);
  });

  it("includes a namespacing suggestion", () => {
    const report = detectToolCollisions([
      entry("github", makeSnapshot("github", { search: tool("S", searchSchema) })),
      entry("slack", makeSnapshot("slack", { search: tool("S", searchSchema) })),
    ]);
    expect(report.collisions[0]?.suggestion).toContain("github_search");
    expect(report.collisions[0]?.suggestion).toContain("slack_search");
  });

  it("handles an empty composition", () => {
    const report = detectToolCollisions([]);
    expect(report.serversScanned).toBe(0);
    expect(report.toolsScanned).toBe(0);
    expect(report.collisions).toHaveLength(0);
  });
});
