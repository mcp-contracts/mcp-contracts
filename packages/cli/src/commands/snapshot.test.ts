import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSnapshotCommand } from "./snapshot.js";

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

function createProgram(): Command {
  const program = new Command();
  program
    .option("--format <format>", "Output format")
    .option("--no-color", "Disable colored output")
    .option("-o, --output <path>", "Output file path")
    .option("--quiet", "Suppress non-essential output");
  program.addCommand(createSnapshotCommand());
  return program;
}

describe("snapshot command", () => {
  let stdoutData: string;
  let stderrData: string;
  let exitCode: number | undefined;
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;
  let exitSpy: MockInstance;

  beforeEach(() => {
    stdoutData = "";
    stderrData = "";
    exitCode = undefined;
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
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("produces valid snapshot JSON with --command", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "mcpdiff",
      "snapshot",
      "--command",
      "node",
      "--args",
      "server.js",
    ]);
    const snapshot = JSON.parse(stdoutData);
    expect(snapshot.snapshotVersion).toBe("1.0.0");
    expect(snapshot.server.name).toBe("test-server");
    expect(snapshot.server.version).toBe("1.0.0");
    expect(snapshot.server.protocolVersion).toBe("2025-03-26");
    expect(snapshot.contentHash).toMatch(/^sha256:/);
    expect(snapshot.capture.transport).toBe("stdio");
    expect(Object.keys(snapshot.tools)).toContain("test_tool");
  });

  it("produces valid snapshot JSON with --url", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "mcpdiff", "snapshot", "--url", "http://localhost:3000/mcp"]);
    const snapshot = JSON.parse(stdoutData);
    expect(snapshot.capture.transport).toBe("streamable-http");
    expect(snapshot.capture.source).toBe("http://localhost:3000/mcp");
  });

  it("writes to file with --output", async () => {
    const outPath = resolve(import.meta.dirname, "__tmp_snapshot_output.json");
    const program = createProgram();
    await program.parseAsync(["node", "mcpdiff", "snapshot", "--command", "node", "-o", outPath]);
    try {
      const content = readFileSync(outPath, "utf-8");
      const snapshot = JSON.parse(content);
      expect(snapshot.snapshotVersion).toBe("1.0.0");
    } finally {
      unlinkSync(outPath);
    }
  });

  it("shows progress messages to stderr", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "mcpdiff", "snapshot", "--command", "node"]);
    expect(stderrData).toContain("Connecting to MCP server");
    expect(stderrData).toContain("Connected to test-server v1.0.0");
  });

  it("suppresses progress with --quiet", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "mcpdiff", "snapshot", "--command", "node", "--quiet"]);
    expect(stderrData).toBe("");
  });

  it("errors when no transport specified", async () => {
    const program = createProgram();
    try {
      await program.parseAsync(["node", "mcpdiff", "snapshot"]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(2);
    expect(stderrData).toContain("Specify one of");
  });

  it("errors when multiple transports specified", async () => {
    const program = createProgram();
    try {
      await program.parseAsync([
        "node",
        "mcpdiff",
        "snapshot",
        "--command",
        "node",
        "--url",
        "http://localhost:3000/mcp",
      ]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(2);
    expect(stderrData).toContain("Specify only one of");
  });

  it("resolves --config from mcp.json", async () => {
    const configPath = resolve(import.meta.dirname, "__tmp_mcp_config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          testserver: { command: "node", args: ["test.js"] },
        },
      }),
      "utf-8",
    );
    try {
      const program = createProgram();
      await program.parseAsync(["node", "mcpdiff", "snapshot", "--config", configPath]);
      const snapshot = JSON.parse(stdoutData);
      expect(snapshot.snapshotVersion).toBe("1.0.0");
    } finally {
      unlinkSync(configPath);
    }
  });

  it("errors when config file not found", async () => {
    const program = createProgram();
    try {
      await program.parseAsync([
        "node",
        "mcpdiff",
        "snapshot",
        "--config",
        "/nonexistent/mcp.json",
      ]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(2);
    expect(stderrData).toContain("Failed to read config file");
  });

  it("parses --env KEY=VALUE pairs", async () => {
    const { connectToServer } = await import("./mcp-client.js");
    const program = createProgram();
    await program.parseAsync([
      "node",
      "mcpdiff",
      "snapshot",
      "--command",
      "node",
      "--env",
      "API_KEY=secret",
      "DEBUG=true",
    ]);
    expect(connectToServer).toHaveBeenCalledWith(
      expect.objectContaining({
        env: { API_KEY: "secret", DEBUG: "true" },
      }),
    );
  });
});
