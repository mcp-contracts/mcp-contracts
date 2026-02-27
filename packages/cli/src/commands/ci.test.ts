import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSnapshot } from "@mcp-contracts/core";
import { Command } from "commander";
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCiCommand } from "./ci.js";

vi.mock("./mcp-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./mcp-client.js")>();
  return {
    ...actual,
    connectToServer: vi.fn().mockResolvedValue({
      client: {
        getServerVersion: () => ({ name: "test-server", version: "1.0.0" }),
        getServerCapabilities: () => ({ tools: {}, resources: {}, prompts: {} }),
      },
      transport: {
        close: vi.fn().mockResolvedValue(undefined),
      },
      protocolVersion: "2025-03-26",
    }),
    captureServerData: vi.fn().mockResolvedValue({
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
    }),
  };
});

const TMP_DIR = resolve(import.meta.dirname, "__tmp_ci_test");
const FIXTURES_DIR = resolve(import.meta.dirname, "../../../core/src/__fixtures__");

function createProgram(): Command {
  const program = new Command();
  program
    .option("--format <format>", "Output format")
    .option("--no-color", "Disable colored output")
    .option("-o, --output <path>", "Output file path")
    .option("--quiet", "Suppress non-essential output")
    .option("--verbose", "Show detailed information");
  program.addCommand(createCiCommand());
  return program;
}

/** Creates a baseline snapshot from the mock server data for testing. */
function createMockBaseline(): string {
  const snapshot = createSnapshot({
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
  const filePath = resolve(TMP_DIR, "baseline.mcpc.json");
  writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf-8");
  return filePath;
}

describe("ci command", () => {
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

  it("produces correct diff report with matching baseline", async () => {
    const baselinePath = createMockBaseline();
    const program = createProgram();
    await program.parseAsync([
      "node",
      "mcpdiff",
      "--format",
      "json",
      "ci",
      "--baseline",
      baselinePath,
      "--command",
      "node",
    ]);
    const report = JSON.parse(stdoutData);
    expect(report.changes).toHaveLength(0);
    expect(report.summary.breaking).toBe(0);
    expect(exitCode).toBeUndefined();
  });

  it("exits 1 when breaking changes detected with --fail-on breaking", async () => {
    const baselinePath = resolve(FIXTURES_DIR, "server-v1.mcpc.json");
    const program = createProgram();
    try {
      await program.parseAsync([
        "node",
        "mcpdiff",
        "--format",
        "json",
        "ci",
        "--baseline",
        baselinePath,
        "--command",
        "node",
        "--fail-on",
        "breaking",
      ]);
    } catch {
      // expected process.exit
    }
    // The mock server has different tools than v1 fixture → breaking changes
    expect(exitCode).toBe(1);
  });

  it("uses CI-suggested format when no explicit --format", async () => {
    const baselinePath = createMockBaseline();
    // Simulate GitHub Actions environment
    process.env.GITHUB_ACTIONS = "true";
    process.env.GITHUB_STEP_SUMMARY = "";

    const program = createProgram();
    await program.parseAsync([
      "node",
      "mcpdiff",
      "ci",
      "--baseline",
      baselinePath,
      "--command",
      "node",
    ]);
    // GitHub Actions suggests markdown format
    // Markdown output contains headers like "## MCP Contract Diff"
    expect(stdoutData).toContain("#");
  });

  it("falls back to TTY detection when not in CI", async () => {
    const baselinePath = createMockBaseline();
    // Ensure no CI env vars
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITLAB_CI;
    delete process.env.CIRCLECI;

    const program = createProgram();
    await program.parseAsync([
      "node",
      "mcpdiff",
      "ci",
      "--baseline",
      baselinePath,
      "--command",
      "node",
    ]);
    // When not CI and stdout is not TTY (mocked), should use JSON
    // stdoutData should be parseable as JSON
    expect(() => JSON.parse(stdoutData)).not.toThrow();
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
      "ci",
      "--baseline",
      baselinePath,
      "--command",
      "node",
    ]);
    const summaryContent = readFileSync(summaryPath, "utf-8");
    expect(summaryContent.length).toBeGreaterThan(0);
    expect(summaryContent).toContain("#");
  });

  it("respects --fail-on for exit codes", async () => {
    const baselinePath = createMockBaseline();
    const program = createProgram();
    // With matching baseline, no changes → exit 0 regardless of --fail-on
    await program.parseAsync([
      "node",
      "mcpdiff",
      "--format",
      "json",
      "ci",
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
        "ci",
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
    // All displayed changes should be breaking severity
    for (const change of report.changes) {
      expect(change.severity).toBe("breaking");
    }
  });

  it("errors if --baseline is missing", async () => {
    const program = createProgram();
    try {
      await program.parseAsync([
        "node",
        "mcpdiff",
        "ci",
        "--command",
        "node",
      ]);
    } catch {
      // Commander exits on missing required option
    }
    // Commander reports missing required option
    expect(exitCode).toBeDefined();
  });

  it("errors if no transport specified", async () => {
    const baselinePath = createMockBaseline();
    const program = createProgram();
    try {
      await program.parseAsync([
        "node",
        "mcpdiff",
        "ci",
        "--baseline",
        baselinePath,
      ]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(2);
    expect(stderrData).toContain("Specify one of");
  });
});
