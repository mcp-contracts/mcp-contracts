import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RawTool, ServerSnapshotEntry } from "@mcp-contracts/core";
import { createSnapshot, diffComposition } from "@mcp-contracts/core";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  compositionHasFailure,
  formatCompositionReport,
  matchBaselineNames,
  readBaselineDir,
} from "./diff-composition.js";

/**
 * Builds a snapshot with the given tools.
 *
 * @param serverName - The server name.
 * @param tools - Raw tool definitions.
 * @returns A complete snapshot.
 */
function makeSnapshot(serverName: string, tools: RawTool[]) {
  return createSnapshot({
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
  });
}

const pingTool: RawTool = {
  name: "ping",
  description: "Ping",
  inputSchema: { type: "object", properties: {} },
};

const pongTool: RawTool = {
  name: "pong",
  description: "Pong",
  inputSchema: { type: "object", properties: {} },
};

describe("readBaselineDir", () => {
  const dir = resolve(import.meta.dirname, "__tmp_baseline_dir");

  beforeEach(() => {
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads all .mcpc.json files named by file stem", () => {
    writeFileSync(
      resolve(dir, "github.mcpc.json"),
      JSON.stringify(makeSnapshot("github-internal", [pingTool])),
      "utf-8",
    );
    writeFileSync(
      resolve(dir, "slack.mcpc.json"),
      JSON.stringify(makeSnapshot("slack-internal", [pongTool])),
      "utf-8",
    );
    writeFileSync(resolve(dir, "notes.txt"), "ignore me", "utf-8");

    const baselines = readBaselineDir(dir);
    expect(baselines.map((b) => b.serverName).sort()).toEqual(["github", "slack"]);
  });

  it("errors when the directory does not exist", () => {
    expect(() => readBaselineDir("/nonexistent/contracts")).toThrow(
      "Failed to read baseline directory",
    );
  });
});

describe("matchBaselineNames", () => {
  it("renames stems back to their config keys", () => {
    const baselines: ServerSnapshotEntry[] = [
      { serverName: "my-scope-server", snapshot: makeSnapshot("x", []) },
    ];
    const renamed = matchBaselineNames(baselines, ["my/scope server"]);
    expect(renamed[0]?.serverName).toBe("my/scope server");
  });

  it("keeps unmatched stems unchanged", () => {
    const baselines: ServerSnapshotEntry[] = [
      { serverName: "orphan", snapshot: makeSnapshot("x", []) },
    ];
    const renamed = matchBaselineNames(baselines, ["github"]);
    expect(renamed[0]?.serverName).toBe("orphan");
  });
});

describe("compositionHasFailure", () => {
  it("fails on breaking changes at the breaking threshold", () => {
    const before = makeSnapshot("s", [pingTool, pongTool]);
    const after = makeSnapshot("s", [pingTool]);
    const report = diffComposition(
      [{ serverName: "s", snapshot: before }],
      [{ serverName: "s", snapshot: after }],
    );
    expect(compositionHasFailure(report, "breaking")).toBe(true);
  });

  it("passes on safe changes at the breaking threshold", () => {
    const before = makeSnapshot("s", [pingTool]);
    const after = makeSnapshot("s", [pingTool, pongTool]);
    const report = diffComposition(
      [{ serverName: "s", snapshot: before }],
      [{ serverName: "s", snapshot: after }],
    );
    expect(compositionHasFailure(report, "breaking")).toBe(false);
    expect(compositionHasFailure(report, "safe")).toBe(true);
  });

  it("always fails when a baseline's server is missing", () => {
    const report = diffComposition(
      [{ serverName: "gone", snapshot: makeSnapshot("gone", []) }],
      [],
    );
    expect(compositionHasFailure(report, "breaking")).toBe(true);
  });

  it("fails on missing baselines only at warning threshold or below", () => {
    const report = diffComposition([], [{ serverName: "new", snapshot: makeSnapshot("new", []) }]);
    expect(compositionHasFailure(report, "breaking")).toBe(false);
    expect(compositionHasFailure(report, "warning")).toBe(true);
  });
});

describe("formatCompositionReport", () => {
  const report = diffComposition([], []);

  it("dispatches to the json formatter", () => {
    expect(JSON.parse(formatCompositionReport(report, "json"))).toEqual(report);
  });

  it("dispatches to the markdown formatter", () => {
    expect(formatCompositionReport(report, "markdown")).toContain("## MCP Composition Diff");
  });

  it("dispatches to the terminal formatter", () => {
    expect(formatCompositionReport(report, "terminal")).toContain("MCP Composition Diff");
  });
});

describe("diff --baseline command", () => {
  const dir = resolve(import.meta.dirname, "__tmp_baseline_cmd");
  const configPath = resolve(import.meta.dirname, "__tmp_baseline_cmd_config.json");
  let stdoutData: string;
  let stderrData: string;
  let exitCode: number | undefined;

  beforeEach(() => {
    stdoutData = "";
    stderrData = "";
    exitCode = undefined;
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({ mcpServers: { testserver: { command: "node", args: ["s.js"] } } }),
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
    rmSync(dir, { recursive: true, force: true });
    rmSync(configPath, { force: true });
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock("./capture-all.js");
  });

  /**
   * Imports a fresh diff command with captureAllServers mocked.
   *
   * @param entries - The entries the mocked capture should return.
   * @returns A commander program with the diff command registered.
   */
  async function programWithMockedCapture(entries: ServerSnapshotEntry[]): Promise<Command> {
    vi.doMock("./capture-all.js", () => ({
      captureAllServers: vi.fn().mockResolvedValue({ entries, failures: [] }),
    }));
    vi.resetModules();
    const { createDiffCommand } = await import("./diff.js");
    const program = new Command();
    program
      .option("--format <format>", "Output format")
      .option("--no-color", "Disable colored output")
      .option("-o, --output <path>", "Output file path")
      .option("--quiet", "Suppress non-essential output");
    program.addCommand(createDiffCommand());
    return program;
  }

  it("reports a passing composition with exit code 0", async () => {
    const snapshot = makeSnapshot("testserver", [pingTool]);
    writeFileSync(resolve(dir, "testserver.mcpc.json"), JSON.stringify(snapshot), "utf-8");
    const program = await programWithMockedCapture([{ serverName: "testserver", snapshot }]);

    await program.parseAsync([
      "node",
      "mcpdiff",
      "--format",
      "json",
      "diff",
      "--config",
      configPath,
      "--baseline",
      dir,
    ]);

    const report = JSON.parse(stdoutData);
    expect(report.summary.diffed).toBe(1);
    expect(report.summary.total).toBe(0);
    expect(exitCode).toBeUndefined();
  });

  it("exits 1 when a server has breaking changes", async () => {
    const baseline = makeSnapshot("testserver", [pingTool, pongTool]);
    const live = makeSnapshot("testserver", [pingTool]);
    writeFileSync(resolve(dir, "testserver.mcpc.json"), JSON.stringify(baseline), "utf-8");
    const program = await programWithMockedCapture([{ serverName: "testserver", snapshot: live }]);

    try {
      await program.parseAsync([
        "node",
        "mcpdiff",
        "--format",
        "json",
        "diff",
        "--config",
        configPath,
        "--baseline",
        dir,
      ]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(1);
  });

  it("errors when --baseline is used without --config", async () => {
    const { createDiffCommand } = await import("./diff.js");
    const program = new Command();
    program.option("--format <format>", "Output format");
    program.addCommand(createDiffCommand());
    try {
      await program.parseAsync(["node", "mcpdiff", "diff", "--baseline", dir]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(2);
    expect(stderrData).toContain("--baseline requires --config");
  });
});
