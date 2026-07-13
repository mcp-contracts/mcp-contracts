import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSnapshot } from "@mcp-contracts/core";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { buildServerFromFlags, createInitCommand } from "./init.js";

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

import { captureSnapshot } from "./capture.js";

const TMP_DIR = resolve(import.meta.dirname, "__tmp_init_test");

function createProgram(): Command {
  const program = new Command();
  program
    .option("--format <format>", "Output format")
    .option("--no-color", "Disable colored output")
    .option("-o, --output <path>", "Output file path")
    .option("--quiet", "Suppress non-essential output")
    .option("--verbose", "Show detailed information")
    .option("--project <path>", "Path to mcpcontracts.json");
  program.addCommand(createInitCommand());
  return program;
}

describe("buildServerFromFlags", () => {
  it("builds a command block with args and env", () => {
    expect(buildServerFromFlags({ command: "node", args: ["server.js"], env: ["A=b"] })).toEqual({
      command: "node",
      args: ["server.js"],
      env: { A: "b" },
    });
  });

  it("builds a url block with sse and headers", () => {
    expect(
      buildServerFromFlags({ url: "http://localhost:3000", sse: true, header: ["X: y"] }),
    ).toEqual({ url: "http://localhost:3000", sse: true, headers: { X: "y" } });
  });

  it("builds a config reference block", () => {
    expect(buildServerFromFlags({ config: "./mcp.json", server: "alpha" })).toEqual({
      config: "./mcp.json",
      name: "alpha",
    });
  });

  it("rejects zero or multiple transports", () => {
    expect(() => buildServerFromFlags({ args: ["x"] })).toThrow(/Specify one of/);
    expect(() => buildServerFromFlags({ command: "node", url: "http://x" })).toThrow(
      /Specify only one of/,
    );
  });
});

describe("init command", () => {
  let stderrData: string;
  let exitCode: number | undefined;
  let stderrSpy: MockInstance;
  let exitSpy: MockInstance;
  let stdoutSpy: MockInstance;
  let cwdSpy: MockInstance;

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
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(TMP_DIR);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    exitSpy.mockRestore();
    cwdSpy.mockRestore();
    if (existsSync(TMP_DIR)) {
      rmSync(TMP_DIR, { recursive: true, force: true });
    }
  });

  it("writes config and baseline, prints next steps with CI snippet", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "mcpdiff", "init", "--command", "node", "--args", "srv.js"]);

    const config = JSON.parse(readFileSync(resolve(TMP_DIR, "mcpcontracts.json"), "utf-8"));
    expect(config).toEqual({
      server: { command: "node", args: ["srv.js"] },
      baseline: "contracts/baseline.mcpc.json",
      failOn: "breaking",
    });

    const baseline = JSON.parse(
      readFileSync(resolve(TMP_DIR, "contracts/baseline.mcpc.json"), "utf-8"),
    );
    expect(baseline.server.name).toBe("test-server");
    expect(baseline.contentHash).toMatch(/^sha256:/);

    expect(stderrData).toContain("Wrote mcpcontracts.json");
    expect(stderrData).toContain("1 tools");
    expect(stderrData).toContain("mcpdiff check");
    expect(stderrData).toContain("mcp-contract.yml");
    expect(exitCode).toBeUndefined();
  });

  it("writes a url server block", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "mcpdiff", "init", "--url", "http://localhost:3000/mcp"]);
    const config = JSON.parse(readFileSync(resolve(TMP_DIR, "mcpcontracts.json"), "utf-8"));
    expect(config.server).toEqual({ url: "http://localhost:3000/mcp" });
  });

  it("writes a config reference block", async () => {
    writeFileSync(
      resolve(TMP_DIR, "mcp.json"),
      JSON.stringify({ mcpServers: { alpha: { command: "node", args: ["a.js"] } } }),
      "utf-8",
    );
    const program = createProgram();
    await program.parseAsync([
      "node",
      "mcpdiff",
      "init",
      "--config",
      "./mcp.json",
      "--server",
      "alpha",
    ]);
    const config = JSON.parse(readFileSync(resolve(TMP_DIR, "mcpcontracts.json"), "utf-8"));
    expect(config.server).toEqual({ config: "./mcp.json", name: "alpha" });
  });

  it("refuses to overwrite an existing config without --force", async () => {
    writeFileSync(resolve(TMP_DIR, "mcpcontracts.json"), "{}", "utf-8");
    const program = createProgram();
    try {
      await program.parseAsync(["node", "mcpdiff", "init", "--command", "node"]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(2);
    expect(stderrData).toContain("--force");
    expect(readFileSync(resolve(TMP_DIR, "mcpcontracts.json"), "utf-8")).toBe("{}");
  });

  it("overwrites with --force", async () => {
    writeFileSync(resolve(TMP_DIR, "mcpcontracts.json"), "{}", "utf-8");
    const program = createProgram();
    await program.parseAsync(["node", "mcpdiff", "init", "--command", "node", "--force"]);
    const config = JSON.parse(readFileSync(resolve(TMP_DIR, "mcpcontracts.json"), "utf-8"));
    expect(config.server).toEqual({ command: "node" });
    expect(exitCode).toBeUndefined();
  });

  it("exits 2 without flags when stdin is not a TTY", async () => {
    const program = createProgram();
    try {
      await program.parseAsync(["node", "mcpdiff", "init"]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(2);
    expect(stderrData).toContain("--command");
    expect(existsSync(resolve(TMP_DIR, "mcpcontracts.json"))).toBe(false);
  });

  it("writes nothing when the capture fails", async () => {
    vi.mocked(captureSnapshot).mockRejectedValueOnce(new Error("connection refused"));
    const program = createProgram();
    try {
      await program.parseAsync(["node", "mcpdiff", "init", "--command", "node"]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(2);
    expect(existsSync(resolve(TMP_DIR, "mcpcontracts.json"))).toBe(false);
    expect(existsSync(resolve(TMP_DIR, "contracts"))).toBe(false);
  });
});
