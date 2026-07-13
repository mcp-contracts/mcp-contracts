import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSnapshot } from "@mcp-contracts/core";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { createCheckCommand } from "./check.js";

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

const TMP_DIR = resolve(import.meta.dirname, "__tmp_check_test");
const FIXTURES_DIR = resolve(import.meta.dirname, "../../../core/src/__fixtures__");

function createProgram(): Command {
  const program = new Command();
  program
    .option("--format <format>", "Output format")
    .option("--no-color", "Disable colored output")
    .option("-o, --output <path>", "Output file path")
    .option("--quiet", "Suppress non-essential output")
    .option("--verbose", "Show detailed information")
    .option("--project <path>", "Path to mcpcontracts.json");
  program.addCommand(createCheckCommand());
  return program;
}

/** Creates a baseline snapshot from the mock server data for testing. */
function createMockBaseline(): string {
  const snapshot = makeMockSnapshot();
  const filePath = resolve(TMP_DIR, "baseline.mcpc.json");
  writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf-8");
  return filePath;
}

describe("check command", () => {
  let stdoutData: string;
  let stderrData: string;
  let exitCode: number | undefined;
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;
  let exitSpy: MockInstance;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    stdoutData = "";
    stderrData = "";
    exitCode = undefined;
    originalEnv = { ...process.env };
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutData += String(chunk);
      return true;
    });
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
    process.env = originalEnv;
    if (existsSync(TMP_DIR)) {
      rmSync(TMP_DIR, { recursive: true, force: true });
    }
  });

  it("registers with all expected options", () => {
    const program = createProgram();
    const checkCmd = program.commands.find((c) => c.name() === "check");
    expect(checkCmd).toBeDefined();

    const optionNames = checkCmd?.options.map((o) => o.long) ?? [];
    for (const opt of [
      "--baseline",
      "--fail-on",
      "--severity",
      "--webhook",
      "--verify-signature",
      "--signature-key",
      "--watch",
      "--watch-paths",
      "--debounce",
      "--clear",
      "--command",
      "--args",
      "--url",
      "--sse",
      "--header",
      "--config",
      "--server",
      "--env",
    ]) {
      expect(optionNames).toContain(opt);
    }
  });

  it("exits 0 and reports no changes with a matching baseline", async () => {
    const baselinePath = createMockBaseline();
    const program = createProgram();
    await program.parseAsync([
      "node",
      "mcpdiff",
      "--format",
      "json",
      "check",
      "--baseline",
      baselinePath,
      "--command",
      "node",
    ]);
    const report = JSON.parse(stdoutData);
    expect(report.changes).toHaveLength(0);
    expect(report.summary.breaking).toBe(0);
    expect(exitCode).toBeUndefined();
    expect(stderrData).toContain("Contract unchanged");
  });

  it("exits 1 when breaking changes exceed the default threshold", async () => {
    const baselinePath = resolve(FIXTURES_DIR, "server-v1.mcpc.json");
    const program = createProgram();
    try {
      await program.parseAsync([
        "node",
        "mcpdiff",
        "--format",
        "json",
        "check",
        "--baseline",
        baselinePath,
        "--command",
        "node",
      ]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(1);
  });

  it("exits 0 with matching baseline even with --fail-on safe", async () => {
    const baselinePath = createMockBaseline();
    const program = createProgram();
    await program.parseAsync([
      "node",
      "mcpdiff",
      "--format",
      "json",
      "check",
      "--baseline",
      baselinePath,
      "--command",
      "node",
      "--fail-on",
      "safe",
    ]);
    expect(exitCode).toBeUndefined();
  });

  it("respects --severity for display filtering", async () => {
    const baselinePath = resolve(FIXTURES_DIR, "server-v1.mcpc.json");
    const program = createProgram();
    try {
      await program.parseAsync([
        "node",
        "mcpdiff",
        "--format",
        "json",
        "check",
        "--baseline",
        baselinePath,
        "--command",
        "node",
        "--severity",
        "breaking",
      ]);
    } catch {
      // expected process.exit
    }
    const report = JSON.parse(stdoutData);
    expect(report.changes.length).toBeGreaterThan(0);
    for (const change of report.changes) {
      expect(change.severity).toBe("breaking");
    }
  });

  it("uses CI-suggested format when no explicit --format", async () => {
    const baselinePath = createMockBaseline();
    process.env.GITHUB_ACTIONS = "true";
    process.env.GITHUB_STEP_SUMMARY = "";

    const program = createProgram();
    await program.parseAsync([
      "node",
      "mcpdiff",
      "check",
      "--baseline",
      baselinePath,
      "--command",
      "node",
    ]);
    // GitHub Actions suggests markdown format
    expect(stdoutData).toContain("#");
  });

  it("writes to GITHUB_STEP_SUMMARY when in GitHub Actions", async () => {
    const baselinePath = createMockBaseline();
    const summaryPath = resolve(TMP_DIR, "step-summary.md");
    writeFileSync(summaryPath, "", "utf-8");

    process.env.GITHUB_ACTIONS = "true";
    process.env.GITHUB_STEP_SUMMARY = summaryPath;

    const program = createProgram();
    await program.parseAsync([
      "node",
      "mcpdiff",
      "--format",
      "json",
      "check",
      "--baseline",
      baselinePath,
      "--command",
      "node",
    ]);
    const summaryContent = readFileSync(summaryPath, "utf-8");
    expect(summaryContent.length).toBeGreaterThan(0);
    expect(summaryContent).toContain("#");
  });

  it("defaults to contracts/baseline.mcpc.json when no baseline is given", async () => {
    const program = createProgram();
    try {
      await program.parseAsync(["node", "mcpdiff", "check", "--command", "node"]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(2);
    expect(stderrData).toContain("contracts/baseline.mcpc.json");
  });

  it("errors if no transport specified", async () => {
    const baselinePath = createMockBaseline();
    const program = createProgram();
    try {
      await program.parseAsync(["node", "mcpdiff", "check", "--baseline", baselinePath]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(2);
    expect(stderrData).toContain("Specify one of");
  });

  it("warns on webhook failure without affecting exit code", async () => {
    const baselinePath = createMockBaseline();
    const program = createProgram();
    await program.parseAsync([
      "node",
      "mcpdiff",
      "--format",
      "json",
      "check",
      "--baseline",
      baselinePath,
      "--command",
      "node",
      "--webhook",
      "http://localhost:1/unreachable",
    ]);
    expect(exitCode).toBeUndefined();
    expect(stderrData).toContain("Warning: Webhook failed");
  });

  it("requires a key for --verify-signature", async () => {
    const baselinePath = createMockBaseline();
    delete process.env.MCP_SIGNATURE_KEY;
    const program = createProgram();
    try {
      await program.parseAsync([
        "node",
        "mcpdiff",
        "check",
        "--baseline",
        baselinePath,
        "--command",
        "node",
        "--verify-signature",
      ]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(2);
    expect(stderrData).toContain("--signature-key");
  });
});
