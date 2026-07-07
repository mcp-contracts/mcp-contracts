import { describe, expect, it } from "vitest";
import { entry, makeSnapshot, tool } from "./__fixtures__/composition-helpers.js";
import { diffComposition } from "./composition.js";
import {
  formatCompositionJson,
  formatCompositionMarkdown,
  formatCompositionTerminal,
} from "./composition-format.js";

function sampleReport() {
  const githubBefore = makeSnapshot("github", {
    search: tool("Search"),
    delete_repo: tool("Delete a repo"),
  });
  const githubAfter = makeSnapshot("github", { search: tool("Search") });
  const slack = makeSnapshot("slack", { send: tool("Send") });
  const fresh = makeSnapshot("fresh", { ping: tool("Ping") });

  return diffComposition(
    [entry("github", githubBefore), entry("slack", slack), entry("gone", slack)],
    [entry("github", githubAfter), entry("slack", slack), entry("fresh", fresh)],
  );
}

describe("formatCompositionTerminal", () => {
  it("shows per-server status lines", () => {
    const output = formatCompositionTerminal(sampleReport());
    expect(output).toContain("github");
    expect(output).toContain("1 breaking");
    expect(output).toContain("slack");
    expect(output).toContain("no changes");
    expect(output).toContain("no baseline found");
    expect(output).toContain("baseline exists but server is not in the composition");
  });

  it("includes individual changes under their server", () => {
    const output = formatCompositionTerminal(sampleReport());
    expect(output).toContain("delete_repo");
  });

  it("shows an aggregated summary", () => {
    const output = formatCompositionTerminal(sampleReport());
    expect(output).toContain("4 servers: 2 diffed, 1 missing baseline, 1 missing server");
    expect(output).toContain("1 breaking across 4 servers");
  });
});

describe("formatCompositionMarkdown", () => {
  it("renders a section per server with status markers", () => {
    const output = formatCompositionMarkdown(sampleReport());
    expect(output).toContain("## MCP Composition Diff");
    expect(output).toContain("### github :x:");
    expect(output).toContain("### slack :white_check_mark:");
    expect(output).toContain("### fresh :warning:");
  });

  it("lists changes under the server section", () => {
    const output = formatCompositionMarkdown(sampleReport());
    expect(output).toContain("**breaking**");
    expect(output).toContain("delete_repo");
  });
});

describe("formatCompositionJson", () => {
  it("round-trips the report", () => {
    const report = sampleReport();
    expect(JSON.parse(formatCompositionJson(report))).toEqual(report);
  });
});
