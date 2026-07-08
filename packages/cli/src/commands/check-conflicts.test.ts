import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RawTool, ServerSnapshotEntry } from "@mcp-contracts/core";
import { createSnapshot, detectToolCollisions } from "@mcp-contracts/core";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collisionsHaveFailure, formatCollisionReport } from "./check-conflicts.js";

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

const searchA: RawTool = {
  name: "search",
  description: "Search A",
  inputSchema: { type: "object", properties: { query: { type: "string" } } },
};

const searchB: RawTool = {
  name: "search",
  description: "Search B",
  inputSchema: { type: "object", properties: { channel: { type: "string" } } },
};

const pingTool: RawTool = {
  name: "ping",
  description: "Ping",
  inputSchema: { type: "object", properties: {} },
};

describe("collisionsHaveFailure", () => {
  it("fails on any collision with fail-on any", () => {
    const report = detectToolCollisions([makeEntry("a", [pingTool]), makeEntry("b", [pingTool])]);
    expect(collisionsHaveFailure(report, "any")).toBe(true);
    expect(collisionsHaveFailure(report, "conflicting")).toBe(false);
  });

  it("fails on schema conflicts with fail-on conflicting", () => {
    const report = detectToolCollisions([makeEntry("a", [searchA]), makeEntry("b", [searchB])]);
    expect(collisionsHaveFailure(report, "conflicting")).toBe(true);
  });

  it("passes a clean composition", () => {
    const report = detectToolCollisions([makeEntry("a", [pingTool]), makeEntry("b", [searchA])]);
    expect(collisionsHaveFailure(report, "any")).toBe(false);
  });
});

describe("formatCollisionReport", () => {
  const report = detectToolCollisions([makeEntry("a", [searchA]), makeEntry("b", [searchB])]);

  it("dispatches to the json formatter", () => {
    expect(JSON.parse(formatCollisionReport(report, "json"))).toEqual(report);
  });

  it("dispatches to the markdown formatter", () => {
    expect(formatCollisionReport(report, "markdown")).toContain("## MCP Tool Collision Check");
  });

  it("dispatches to the terminal formatter", () => {
    expect(formatCollisionReport(report, "terminal")).toContain("MCP Tool Collision Check");
  });
});

describe("check-conflicts command", () => {
  const configPath = resolve(import.meta.dirname, "__tmp_conflicts_config.json");
  let stdoutData: string;
  let stderrData: string;
  let exitCode: number | undefined;

  beforeEach(() => {
    stdoutData = "";
    stderrData = "";
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
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrData += String(chunk);
      return true;
    });
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

  /**
   * Imports a fresh check-conflicts command with captureAllServers mocked.
   *
   * @param entries - The entries the mocked capture should return.
   * @returns A commander program with the command registered.
   */
  async function programWithMockedCapture(entries: ServerSnapshotEntry[]): Promise<Command> {
    vi.doMock("./capture-all.js", () => ({
      captureAllServers: vi.fn().mockResolvedValue({ entries, failures: [] }),
    }));
    vi.resetModules();
    const { createCheckConflictsCommand } = await import("./check-conflicts.js");
    const program = new Command();
    program.option("--format <format>", "Output format").option("--quiet", "Quiet");
    program.addCommand(createCheckConflictsCommand());
    return program;
  }

  it("exits 1 and reports collisions when tool names clash", async () => {
    const program = await programWithMockedCapture([
      makeEntry("github", [searchA]),
      makeEntry("slack", [searchB]),
    ]);
    try {
      await program.parseAsync([
        "node",
        "mcpdiff",
        "--format",
        "json",
        "check-conflicts",
        "--config",
        configPath,
      ]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(1);
    const report = JSON.parse(stdoutData);
    expect(report.summary.conflicting).toBe(1);
  });

  it("exits 0 for a clean composition", async () => {
    const program = await programWithMockedCapture([
      makeEntry("github", [searchA]),
      makeEntry("slack", [pingTool]),
    ]);
    await program.parseAsync([
      "node",
      "mcpdiff",
      "--format",
      "json",
      "check-conflicts",
      "--config",
      configPath,
    ]);
    expect(exitCode).toBeUndefined();
    const report = JSON.parse(stdoutData);
    expect(report.summary.total).toBe(0);
  });

  it("tolerates exact duplicates with --fail-on conflicting", async () => {
    const program = await programWithMockedCapture([
      makeEntry("github", [pingTool]),
      makeEntry("slack", [pingTool]),
    ]);
    await program.parseAsync([
      "node",
      "mcpdiff",
      "--format",
      "json",
      "check-conflicts",
      "--config",
      configPath,
      "--fail-on",
      "conflicting",
    ]);
    expect(exitCode).toBeUndefined();
  });

  it("errors on an invalid --fail-on value", async () => {
    const program = await programWithMockedCapture([]);
    try {
      await program.parseAsync([
        "node",
        "mcpdiff",
        "check-conflicts",
        "--config",
        configPath,
        "--fail-on",
        "bogus",
      ]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(2);
    expect(stderrData).toContain('Invalid --fail-on value "bogus"');
  });
});
