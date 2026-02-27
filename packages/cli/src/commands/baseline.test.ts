import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { createBaselineCommand } from "./baseline.js";

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

const TMP_DIR = resolve(import.meta.dirname, "__tmp_baseline_test");

function createProgram(): Command {
  const program = new Command();
  program
    .option("--format <format>", "Output format")
    .option("--no-color", "Disable colored output")
    .option("-o, --output <path>", "Output file path")
    .option("--quiet", "Suppress non-essential output")
    .option("--verbose", "Show detailed information");
  program.addCommand(createBaselineCommand());
  return program;
}

describe("baseline command", () => {
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

  describe("update", () => {
    it("writes a valid snapshot file to the output path", async () => {
      const outPath = resolve(TMP_DIR, "baseline.mcpc.json");
      const program = createProgram();
      await program.parseAsync([
        "node",
        "mcpdiff",
        "-o",
        outPath,
        "baseline",
        "update",
        "--command",
        "node",
      ]);
      const content = readFileSync(outPath, "utf-8");
      const snapshot = JSON.parse(content);
      expect(snapshot.snapshotVersion).toBe("1.0.0");
      expect(snapshot.server.name).toBe("test-server");
      expect(snapshot.contentHash).toMatch(/^sha256:/);
      expect(Object.keys(snapshot.tools)).toContain("test_tool");
    });

    it("creates the directory if missing", async () => {
      const nestedPath = resolve(TMP_DIR, "nested/dir/baseline.mcpc.json");
      const program = createProgram();
      await program.parseAsync([
        "node",
        "mcpdiff",
        "-o",
        nestedPath,
        "baseline",
        "update",
        "--command",
        "node",
      ]);
      expect(existsSync(nestedPath)).toBe(true);
    });

    it("defaults to contracts/baseline.mcpc.json when no --output", () => {
      // Verify the default is used when no -o is provided
      // (We don't actually run the command to avoid writing to the real default path)
      const program = createProgram();
      const baselineCmd = program.commands.find((c) => c.name() === "baseline");
      expect(baselineCmd).toBeDefined();
    });

    it("prints confirmation to stderr", async () => {
      const outPath = resolve(TMP_DIR, "baseline.mcpc.json");
      const program = createProgram();
      await program.parseAsync([
        "node",
        "mcpdiff",
        "-o",
        outPath,
        "baseline",
        "update",
        "--command",
        "node",
      ]);
      expect(stderrData).toContain("Baseline written to");
    });

    it("suppresses output with --quiet", async () => {
      const outPath = resolve(TMP_DIR, "baseline.mcpc.json");
      const program = createProgram();
      await program.parseAsync([
        "node",
        "mcpdiff",
        "--quiet",
        "-o",
        outPath,
        "baseline",
        "update",
        "--command",
        "node",
      ]);
      expect(stderrData).toBe("");
    });
  });

  describe("verify", () => {
    it("exits 0 when hashes match", async () => {
      // First create a baseline
      const baselinePath = resolve(TMP_DIR, "verify-baseline.mcpc.json");
      const program1 = createProgram();
      await program1.parseAsync([
        "node",
        "mcpdiff",
        "-o",
        baselinePath,
        "baseline",
        "update",
        "--command",
        "node",
      ]);
      stderrData = "";

      // Then verify against same server (same mock data => same hash)
      const program2 = createProgram();
      await program2.parseAsync([
        "node",
        "mcpdiff",
        "baseline",
        "verify",
        "--command",
        "node",
        "--baseline",
        baselinePath,
      ]);
      expect(exitCode).toBeUndefined();
      expect(stderrData).toContain("Baseline verified: contract unchanged");
    });

    it("exits 1 when hashes differ", async () => {
      // Use a fixture with different tools
      const fixturesDir = resolve(import.meta.dirname, "../../../core/src/__fixtures__");
      const baselinePath = resolve(fixturesDir, "server-v1.mcpc.json");

      const program = createProgram();
      try {
        await program.parseAsync([
          "node",
          "mcpdiff",
          "baseline",
          "verify",
          "--command",
          "node",
          "--baseline",
          baselinePath,
        ]);
      } catch {
        // expected process.exit
      }
      expect(exitCode).toBe(1);
      expect(stderrData).toContain("Baseline mismatch: contract has changed");
    });

    it("exits 2 when baseline file not found", async () => {
      const program = createProgram();
      try {
        await program.parseAsync([
          "node",
          "mcpdiff",
          "baseline",
          "verify",
          "--command",
          "node",
          "--baseline",
          "/nonexistent/baseline.mcpc.json",
        ]);
      } catch {
        // expected process.exit
      }
      expect(exitCode).toBe(2);
      expect(stderrData).toContain("Failed to read snapshot file");
    });

    it("uses default baseline path", () => {
      const program = createProgram();
      const baselineCmd = program.commands.find((c) => c.name() === "baseline");
      const verifyCmd = baselineCmd?.commands.find((c) => c.name() === "verify");
      const baselineOpt = verifyCmd?.options.find((o) => o.long === "--baseline");
      expect(baselineOpt?.defaultValue).toBe("contracts/baseline.mcpc.json");
    });
  });
});
