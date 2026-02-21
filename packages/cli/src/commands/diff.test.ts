import { readFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDiffCommand } from "./diff.js";

const FIXTURES_DIR = resolve(import.meta.dirname, "../../../core/src/__fixtures__");
const V1 = resolve(FIXTURES_DIR, "server-v1.mcpc.json");
const V2_SAFE = resolve(FIXTURES_DIR, "server-v2-safe.mcpc.json");
const V2_BREAKING = resolve(FIXTURES_DIR, "server-v2-breaking.mcpc.json");
const V2_WARNING = resolve(FIXTURES_DIR, "server-v2-warning.mcpc.json");

function createProgram(): Command {
  const program = new Command();
  program
    .option("--format <format>", "Output format")
    .option("--no-color", "Disable colored output")
    .option("-o, --output <path>", "Output file path");
  program.addCommand(createDiffCommand());
  return program;
}

describe("diff command", () => {
  let stdoutData: string;
  let stderrData: string;
  let exitCode: number | undefined;

  beforeEach(() => {
    stdoutData = "";
    stderrData = "";
    exitCode = undefined;
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
    vi.restoreAllMocks();
  });

  it("reports no changes for identical snapshots (exit 0)", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "mcpdiff", "diff", V1, V1, "--format", "json"]);
    const output = JSON.parse(stdoutData);
    expect(output.changes).toHaveLength(0);
    expect(output.summary.total).toBe(0);
    expect(exitCode).toBeUndefined();
  });

  it("detects breaking changes and exits 1 (v1 vs v2-breaking)", async () => {
    const program = createProgram();
    try {
      await program.parseAsync(["node", "mcpdiff", "diff", V1, V2_BREAKING, "--format", "json"]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(1);
    const output = JSON.parse(stdoutData);
    expect(output.summary.breaking).toBeGreaterThan(0);
  });

  it("safe changes do not trigger exit 1 with default --fail-on", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "mcpdiff", "diff", V1, V2_SAFE, "--format", "json"]);
    const output = JSON.parse(stdoutData);
    expect(output.summary.safe).toBeGreaterThan(0);
    expect(exitCode).toBeUndefined();
  });

  it("--fail-on warning exits 1 when warning changes exist", async () => {
    const program = createProgram();
    try {
      await program.parseAsync([
        "node",
        "mcpdiff",
        "diff",
        V1,
        V2_WARNING,
        "--fail-on",
        "warning",
        "--format",
        "json",
      ]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(1);
  });

  it("--severity warning filters out safe changes from output", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "mcpdiff",
      "diff",
      V1,
      V2_SAFE,
      "--severity",
      "warning",
      "--format",
      "json",
    ]);
    const output = JSON.parse(stdoutData);
    expect(output.changes).toHaveLength(0);
    expect(output.summary.total).toBe(0);
  });

  it("produces valid JSON with --format json", async () => {
    const program = createProgram();
    try {
      await program.parseAsync(["node", "mcpdiff", "diff", V1, V2_BREAKING, "--format", "json"]);
    } catch {
      // may exit 1
    }
    const output = JSON.parse(stdoutData);
    expect(output.meta).toBeDefined();
    expect(output.summary).toBeDefined();
    expect(output.changes).toBeDefined();
  });

  it("writes to file with --output", async () => {
    const outPath = resolve(import.meta.dirname, "__tmp_diff_output.json");
    const program = createProgram();
    await program.parseAsync([
      "node",
      "mcpdiff",
      "diff",
      V1,
      V1,
      "--format",
      "json",
      "-o",
      outPath,
    ]);
    try {
      const content = readFileSync(outPath, "utf-8");
      const output = JSON.parse(content);
      expect(output.changes).toHaveLength(0);
    } finally {
      unlinkSync(outPath);
    }
  });

  it("errors on invalid file path (exit 2)", async () => {
    const program = createProgram();
    try {
      await program.parseAsync([
        "node",
        "mcpdiff",
        "diff",
        "/nonexistent.json",
        V1,
        "--format",
        "json",
      ]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(2);
    expect(stderrData).toContain("Failed to read snapshot file");
  });

  it("produces terminal output", async () => {
    const program = createProgram();
    try {
      await program.parseAsync([
        "node",
        "mcpdiff",
        "diff",
        V1,
        V2_BREAKING,
        "--format",
        "terminal",
      ]);
    } catch {
      // may exit 1
    }
    expect(stdoutData).toContain("MCP Contract Diff");
  });

  it("produces markdown output", async () => {
    const program = createProgram();
    try {
      await program.parseAsync([
        "node",
        "mcpdiff",
        "diff",
        V1,
        V2_BREAKING,
        "--format",
        "markdown",
      ]);
    } catch {
      // may exit 1
    }
    expect(stdoutData).toContain("## MCP Contract Diff");
  });
});
