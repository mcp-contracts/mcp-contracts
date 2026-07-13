import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSnapshot } from "@mcp-contracts/core";
import type { TestReport } from "@mcp-contracts/test";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { createTestCommand } from "./test.js";

vi.mock("@mcp-contracts/test", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mcp-contracts/test")>();
  return { ...actual, runContractTests: vi.fn() };
});

import { runContractTests } from "@mcp-contracts/test";

const TMP_DIR = resolve(import.meta.dirname, "__tmp_test_cmd_test");

function makeReport(overrides?: Partial<TestReport["summary"]>): TestReport {
  return {
    meta: {
      contractPath: "contract.mcpc.json",
      serverName: "test-server",
      serverVersion: "1.0.0",
      runAt: new Date().toISOString(),
      tool: "mcp-test",
    },
    summary: {
      total: 3,
      passed: 3,
      failed: 0,
      skipped: 0,
      errors: 0,
      durationMs: 12,
      ...overrides,
    },
    results: [],
  };
}

function writeContract(): string {
  const snapshot = createSnapshot({
    server: {
      name: "test-server",
      version: "1.0.0",
      protocolVersion: "2025-03-26",
      capabilities: {},
    },
    tools: [
      { name: "test_tool", description: "A tool", inputSchema: { type: "object", properties: {} } },
    ],
    resources: [],
    resourceTemplates: [],
    prompts: [],
    capture: { transport: "stdio", source: "node", tool: "mcpdiff/0.1.0" },
  });
  const path = resolve(TMP_DIR, "contract.mcpc.json");
  writeFileSync(path, JSON.stringify(snapshot, null, 2), "utf-8");
  return path;
}

function createProgram(): Command {
  const program = new Command();
  program
    .option("--format <format>", "Output format")
    .option("--no-color", "Disable colored output")
    .option("-o, --output <path>", "Output file path")
    .option("--quiet", "Suppress non-essential output")
    .option("--verbose", "Show detailed information")
    .option("--project <path>", "Path to mcpcontracts.json");
  program.addCommand(createTestCommand());
  return program;
}

describe("test command", () => {
  let stdoutData: string;
  let stderrData: string;
  let exitCode: number | undefined;
  let spies: MockInstance[];

  beforeEach(() => {
    stdoutData = "";
    stderrData = "";
    exitCode = undefined;
    spies = [
      vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
        stdoutData += String(chunk);
        return true;
      }),
      vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
        stderrData += String(chunk);
        return true;
      }),
      vi.spyOn(process, "exit").mockImplementation((code) => {
        exitCode = code as number;
        throw new Error(`process.exit(${code})`);
      }),
    ];
    mkdirSync(TMP_DIR, { recursive: true });
    vi.mocked(runContractTests).mockClear();
    vi.mocked(runContractTests).mockResolvedValue(makeReport());
  });

  afterEach(() => {
    for (const spy of spies) spy.mockRestore();
    if (existsSync(TMP_DIR)) {
      rmSync(TMP_DIR, { recursive: true, force: true });
    }
  });

  it("registers with the mcp-test run flag surface plus transport options", () => {
    const program = createProgram();
    const testCmd = program.commands.find((c) => c.name() === "test");
    const optionNames = testCmd?.options.map((o) => o.long) ?? [];
    for (const opt of [
      "--no-conformance",
      "--no-boundary",
      "--allow-extra-tools",
      "--ignore-descriptions",
      "--skip-tools",
      "--timeout",
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

  it("runs the suite and exits 0 when everything passes", async () => {
    const contractPath = writeContract();
    const program = createProgram();
    await program.parseAsync([
      "node",
      "mcpdiff",
      "--format",
      "json",
      "test",
      contractPath,
      "--command",
      "node",
      "--args",
      "srv.js",
    ]);

    expect(exitCode).toBeUndefined();
    const report = JSON.parse(stdoutData);
    expect(report.summary.passed).toBe(3);

    const runOptions = vi.mocked(runContractTests).mock.calls[0]?.[0];
    expect(runOptions?.server).toMatchObject({
      transport: "stdio",
      command: "node",
      args: ["srv.js"],
    });
    expect(runOptions?.contractPath).toBe(contractPath);
    expect(runOptions?.conformance).toEqual({
      allowExtraTools: false,
      ignoreDescriptions: false,
      skipTools: undefined,
    });
    expect(runOptions?.boundary).toEqual({ skipTools: undefined });
    expect(runOptions?.timeoutMs).toBe(120000);
  });

  it("exits 1 on failures", async () => {
    vi.mocked(runContractTests).mockResolvedValue(makeReport({ failed: 1, passed: 2 }));
    const contractPath = writeContract();
    const program = createProgram();
    try {
      await program.parseAsync([
        "node",
        "mcpdiff",
        "--format",
        "json",
        "test",
        contractPath,
        "--command",
        "node",
      ]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(1);
  });

  it("passes through --no-conformance, --allow-extra-tools, and --skip-tools", async () => {
    const contractPath = writeContract();
    const program = createProgram();
    await program.parseAsync([
      "node",
      "mcpdiff",
      "--format",
      "json",
      "test",
      contractPath,
      "--command",
      "node",
      "--no-conformance",
      "--skip-tools",
      "alpha",
      "beta",
      "--timeout",
      "5000",
    ]);
    const runOptions = vi.mocked(runContractTests).mock.calls[0]?.[0];
    expect(runOptions?.conformance).toBe(false);
    expect(runOptions?.boundary).toEqual({ skipTools: ["alpha", "beta"] });
    expect(runOptions?.timeoutMs).toBe(5000);
  });

  it("resolves contract and server from the project config with no arguments", async () => {
    writeContract();
    writeFileSync(
      resolve(TMP_DIR, "mcpcontracts.json"),
      JSON.stringify({
        server: { command: "node", args: ["srv.js"] },
        baseline: "contract.mcpc.json",
      }),
      "utf-8",
    );
    const program = createProgram();
    await program.parseAsync([
      "node",
      "mcpdiff",
      "--format",
      "json",
      "--project",
      resolve(TMP_DIR, "mcpcontracts.json"),
      "test",
    ]);
    expect(exitCode).toBeUndefined();
    const runOptions = vi.mocked(runContractTests).mock.calls[0]?.[0];
    expect(runOptions?.contractPath).toBe(resolve(TMP_DIR, "contract.mcpc.json"));
    expect(runOptions?.server).toMatchObject({ transport: "stdio", command: "node" });
  });

  it("errors with exit 2 when no transport is available", async () => {
    const contractPath = writeContract();
    const program = createProgram();
    try {
      await program.parseAsync(["node", "mcpdiff", "test", contractPath]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(2);
    expect(stderrData).toContain("Specify one of");
  });
});
