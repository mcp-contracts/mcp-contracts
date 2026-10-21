import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { diffSnapshots } from "./diff.js";
import type { SchemaChange } from "./diff-types.js";
import {
  formatChangeMarkdown,
  formatChangeTerminal,
  formatJson,
  formatMarkdown,
  formatTerminal,
} from "./format.js";
import type { MCPContractSnapshot } from "./types.js";

function loadFixture(name: string): MCPContractSnapshot {
  const path = resolve(import.meta.dirname, "__fixtures__", name);
  return JSON.parse(readFileSync(path, "utf-8")) as MCPContractSnapshot;
}

const v1 = loadFixture("server-v1.mcpc.json");
const v2Safe = loadFixture("server-v2-safe.mcpc.json");
const v2Breaking = loadFixture("server-v2-breaking.mcpc.json");
const v2Warning = loadFixture("server-v2-warning.mcpc.json");

describe("formatJson", () => {
  it("returns valid JSON", () => {
    const report = diffSnapshots(v1, v2Safe);
    const json = formatJson(report);
    const parsed = JSON.parse(json);
    expect(parsed.summary).toBeDefined();
    expect(parsed.changes).toBeDefined();
    expect(parsed.meta).toBeDefined();
  });

  it("is pretty-printed with 2-space indentation", () => {
    const report = diffSnapshots(v1, v2Safe);
    const json = formatJson(report);
    expect(json).toContain("  ");
    expect(json).toContain("\n");
  });

  it("roundtrips the report data", () => {
    const report = diffSnapshots(v1, v2Breaking);
    const json = formatJson(report);
    const parsed = JSON.parse(json);
    expect(parsed.summary.breaking).toBe(report.summary.breaking);
    expect(parsed.changes).toHaveLength(report.changes.length);
  });
});

describe("formatTerminal", () => {
  it("includes header with server info", () => {
    const report = diffSnapshots(v1, v2Safe);
    const output = formatTerminal(report);
    expect(output).toContain("MCP Contract Diff");
    expect(output).toContain("contacts-server");
  });

  it("shows no changes message for identical snapshots", () => {
    const report = diffSnapshots(v1, v1);
    const output = formatTerminal(report);
    expect(output).toContain("No changes detected");
  });

  it("shows breaking change with red severity icon", () => {
    const report = diffSnapshots(v1, v2Breaking);
    const output = formatTerminal(report);
    expect(output).toContain("\u{1F534}");
    expect(output).toContain("breaking");
    expect(output).toContain("delete_contact");
  });

  it("shows safe change with green severity icon", () => {
    const report = diffSnapshots(v1, v2Safe);
    const output = formatTerminal(report);
    expect(output).toContain("\u{1F7E2}");
    expect(output).toContain("safe");
    expect(output).toContain("update_contact");
  });

  it("shows warning with inline diff for description changes", () => {
    const report = diffSnapshots(v1, v2Warning);
    const output = formatTerminal(report);
    expect(output).toContain("\u{1F7E1}");
    expect(output).toContain("warning");
    expect(output).toContain("- Searches contacts by query string");
    expect(output).toContain("+ Search through all contacts");
  });

  it("includes summary counts", () => {
    const report = diffSnapshots(v1, v2Breaking);
    const output = formatTerminal(report);
    expect(output).toContain("1 changes:");
    expect(output).toContain("1 breaking");
  });

  it("groups changes by category", () => {
    const after: MCPContractSnapshot = {
      ...v2Breaking,
      prompts: {},
    };
    const report = diffSnapshots(v1, after);
    const output = formatTerminal(report);
    expect(output).toContain("Tools");
    expect(output).toContain("Prompts");
  });
});

describe("formatMarkdown", () => {
  it("includes markdown header", () => {
    const report = diffSnapshots(v1, v2Safe);
    const output = formatMarkdown(report);
    expect(output).toContain("## MCP Contract Diff");
  });

  it("shows server version transition", () => {
    const report = diffSnapshots(v1, v2Safe);
    const output = formatMarkdown(report);
    expect(output).toContain("`1.0.0`");
    expect(output).toContain("`1.1.0`");
  });

  it("shows no changes message for identical snapshots", () => {
    const report = diffSnapshots(v1, v1);
    const output = formatMarkdown(report);
    expect(output).toContain("No changes detected");
  });

  it("uses severity icons in change list", () => {
    const report = diffSnapshots(v1, v2Breaking);
    const output = formatMarkdown(report);
    expect(output).toContain("\u{1F534}");
    expect(output).toContain("**breaking**");
  });

  it("shows diff block for description changes", () => {
    const report = diffSnapshots(v1, v2Warning);
    const output = formatMarkdown(report);
    expect(output).toContain("```diff");
    expect(output).toContain("- Searches contacts by query string");
    expect(output).toContain("+ Search through all contacts");
  });

  it("includes summary counts", () => {
    const report = diffSnapshots(v1, v2Safe);
    const output = formatMarkdown(report);
    expect(output).toContain("**1 changes:**");
    expect(output).toContain("1 safe");
  });

  it("groups changes under category headings", () => {
    const after: MCPContractSnapshot = {
      ...v2Breaking,
      resources: {},
    };
    const report = diffSnapshots(v1, after);
    const output = formatMarkdown(report);
    expect(output).toContain("### Tools");
    expect(output).toContain("### Resources");
  });
});

describe("formatters neutralize server-controlled strings", () => {
  const hostile: SchemaChange = {
    id: "tool.x.description",
    category: "tool",
    name: "x",
    severity: "warning",
    type: "modified",
    message: 'Tool "<details><summary>x</summary>" description changed\u001b[2J',
    path: "description",
    before: "old",
    after: "new\n```\n\n## MCP Contract Diff\n\nNo changes detected. :white_check_mark:",
  };

  it("escapes HTML and markdown in the markdown message", () => {
    const md = formatChangeMarkdown(hostile);
    expect(md).not.toContain("<details>");
    expect(md).toContain("\\<details\\>");
    expect(md).not.toContain("\u001b");
  });

  it("sizes the diff fence past any backtick run in the content", () => {
    const md = formatChangeMarkdown(hostile);
    const lines = md.split("\n");
    expect(lines[1]).toBe("  ````diff");
    expect(lines[lines.length - 1]).toBe("  ````");
    // the injected heading stays inside the fence and indented
    expect(md).toContain("    ## MCP Contract Diff");
  });

  it("strips terminal control sequences from terminal output", () => {
    const term = formatChangeTerminal(hostile);
    expect(term).not.toContain("\u001b[2J");
    expect(term).toContain('Tool "<details><summary>x</summary>" description changed');
  });

  it("escapes server name and version in the markdown header", () => {
    const report = diffSnapshots(v1, v1);
    report.meta.before.serverName = "**bold**<img src=x>";
    report.meta.before.serverVersion = "1.0` [ok](https://evil)";
    const md = formatMarkdown(report);
    expect(md).toContain("\\<img src=x\\>");
    expect(md).not.toMatch(/[^\\]<img/);
    expect(md).toContain("``1.0` [ok](https://evil)``");
  });

  it("strips control sequences from the terminal header", () => {
    const report = diffSnapshots(v1, v1);
    report.meta.after.serverVersion = "2.0\u001b]0;pwned\u0007";
    expect(formatTerminal(report)).toContain("@2.0");
    expect(formatTerminal(report)).not.toContain("pwned");
  });
});
