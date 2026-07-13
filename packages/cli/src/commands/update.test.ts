import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSnapshot } from "@mcp-contracts/core";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { createUpdateCommand } from "./update.js";

/** Creates a snapshot matching the mock captureSnapshot output. */
function makeMockSnapshot() {
  return createSnapshot({
    server: {
      name: "test-server",
      version: "1.0.0",
      protocolVersion: "2025-03-26",
      capabilities: {},
    },
    tools: [
      {
        name: "test_tool",
        description: "A test tool",
        inputSchema: { type: "object", properties: {} },
      },
    ],
    resources: [],
    resourceTemplates: [],
    prompts: [],
    capture: { transport: "stdio", source: "node", tool: "mcpdiff/0.1.0" },
  });
}

vi.mock("./capture.js", () => ({
  captureSnapshot: vi.fn().mockImplementation(async () => ({
    snapshot: makeMockSnapshot(),
    serverName: "test-server",
    serverVersion: "1.0.0",
  })),
}));

const TMP_DIR = resolve(import.meta.dirname, "__tmp_update_test");

function createProgram(): Command {
  const program = new Command();
  program
    .option("--format <format>", "Output format")
    .option("--no-color", "Disable colored output")
    .option("-o, --output <path>", "Output file path")
    .option("--quiet", "Suppress non-essential output")
    .option("--verbose", "Show detailed information")
    .option("--project <path>", "Path to mcpcontracts.json");
  program.addCommand(createUpdateCommand());
  return program;
}

describe("update command", () => {
  let stderrData: string;
  let exitCode: number | undefined;
  let stderrSpy: MockInstance;
  let exitSpy: MockInstance;
  let stdoutSpy: MockInstance;

  beforeEach(() => {
    stderrData = "";
    exitCode = undefined;
    stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrData += String(chunk);
      return true;
    });
    exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      exitCode = code as number;
      throw new Error(`process.exit(${code})`);
    });
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    exitSpy.mockRestore();
    if (existsSync(TMP_DIR)) {
      rmSync(TMP_DIR, { recursive: true, force: true });
    }
  });

  it("writes a valid snapshot to the --baseline path", async () => {
    const outPath = resolve(TMP_DIR, "baseline.mcpc.json");
    const program = createProgram();
    await program.parseAsync([
      "node",
      "mcpdiff",
      "update",
      "--baseline",
      outPath,
      "--command",
      "node",
    ]);
    const snapshot = JSON.parse(readFileSync(outPath, "utf-8"));
    expect(snapshot.snapshotVersion).toBe("1.0.0");
    expect(snapshot.server.name).toBe("test-server");
    expect(snapshot.contentHash).toMatch(/^sha256:/);
    expect(Object.keys(snapshot.tools)).toContain("test_tool");
    expect(stderrData).toContain(`Baseline written to ${outPath}`);
    expect(exitCode).toBeUndefined();
  });

  it("accepts the global -o option for the output path", async () => {
    const outPath = resolve(TMP_DIR, "via-output.mcpc.json");
    const program = createProgram();
    await program.parseAsync(["node", "mcpdiff", "-o", outPath, "update", "--command", "node"]);
    expect(existsSync(outPath)).toBe(true);
  });

  it("prefers --baseline over the global -o option", async () => {
    const baselinePath = resolve(TMP_DIR, "from-baseline.mcpc.json");
    const outputPath = resolve(TMP_DIR, "from-output.mcpc.json");
    const program = createProgram();
    await program.parseAsync([
      "node",
      "mcpdiff",
      "-o",
      outputPath,
      "update",
      "--baseline",
      baselinePath,
      "--command",
      "node",
    ]);
    expect(existsSync(baselinePath)).toBe(true);
    expect(existsSync(outputPath)).toBe(false);
  });

  it("creates missing directories", async () => {
    const nestedPath = resolve(TMP_DIR, "nested/dir/baseline.mcpc.json");
    const program = createProgram();
    await program.parseAsync([
      "node",
      "mcpdiff",
      "update",
      "--baseline",
      nestedPath,
      "--command",
      "node",
    ]);
    expect(existsSync(nestedPath)).toBe(true);
  });

  it("resolves the baseline path from the project config", async () => {
    const projectPath = resolve(TMP_DIR, "mcpcontracts.json");
    writeFileSync(
      projectPath,
      JSON.stringify({ baseline: "contracts/config-baseline.mcpc.json" }),
      "utf-8",
    );
    const program = createProgram();
    await program.parseAsync([
      "node",
      "mcpdiff",
      "--project",
      projectPath,
      "update",
      "--command",
      "node",
    ]);
    expect(existsSync(resolve(TMP_DIR, "contracts/config-baseline.mcpc.json"))).toBe(true);
  });

  it("errors with exit 2 when no transport is available", async () => {
    const program = createProgram();
    try {
      await program.parseAsync([
        "node",
        "mcpdiff",
        "update",
        "--baseline",
        resolve(TMP_DIR, "x.mcpc.json"),
      ]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(2);
    expect(stderrData).toContain("Specify one of");
  });
});
