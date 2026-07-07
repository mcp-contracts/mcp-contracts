import { describe, expect, it } from "vitest";
import { entry, makeSnapshot, tool } from "./__fixtures__/composition-helpers.js";
import { detectToolCollisions } from "./collision.js";
import {
  formatCollisionsJson,
  formatCollisionsMarkdown,
  formatCollisionsTerminal,
} from "./collision-format.js";

const searchSchema = { query: { type: "string" } };

function sampleReport() {
  return detectToolCollisions([
    entry(
      "github",
      makeSnapshot("github", {
        search: tool("Search GitHub", searchSchema),
        ping: tool("Ping"),
      }),
    ),
    entry(
      "slack",
      makeSnapshot("slack", {
        search: tool("Search Slack", { channel: { type: "string" } }),
        ping: tool("Ping"),
      }),
    ),
  ]);
}

function cleanReport() {
  return detectToolCollisions([
    entry("a", makeSnapshot("a", { one: tool("One") })),
    entry("b", makeSnapshot("b", { two: tool("Two") })),
  ]);
}

describe("formatCollisionsTerminal", () => {
  it("lists collisions with kind, servers, and suggestion", () => {
    const output = formatCollisionsTerminal(sampleReport());
    expect(output).toContain("conflicting");
    expect(output).toContain("search");
    expect(output).toContain("github, slack");
    expect(output).toContain("schemas differ");
    expect(output).toContain("github_search");
  });

  it("shows scan counts and summary", () => {
    const output = formatCollisionsTerminal(sampleReport());
    expect(output).toContain("2 servers scanned, 4 tools");
    expect(output).toContain("2 collisions:");
    expect(output).toContain("1 conflicting, 1 exact");
  });

  it("reports a clean scan", () => {
    const output = formatCollisionsTerminal(cleanReport());
    expect(output).toContain("No tool name collisions detected.");
  });
});

describe("formatCollisionsMarkdown", () => {
  it("renders collisions as a markdown list", () => {
    const output = formatCollisionsMarkdown(sampleReport());
    expect(output).toContain("## MCP Tool Collision Check");
    expect(output).toContain("**conflicting** — `search`");
    expect(output).toContain("`github`, `slack`");
  });

  it("reports a clean scan", () => {
    const output = formatCollisionsMarkdown(cleanReport());
    expect(output).toContain("No tool name collisions detected. :white_check_mark:");
  });
});

describe("formatCollisionsJson", () => {
  it("round-trips the report", () => {
    const report = sampleReport();
    expect(JSON.parse(formatCollisionsJson(report))).toEqual(report);
  });
});
