import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { MCPContractSnapshot } from "@mcp-contracts/core";
import { computeContentHash } from "@mcp-contracts/core";
import { Command } from "commander";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createVerifyHashCommand } from "./verify-hash.js";

const FIXTURES_DIR = resolve(import.meta.dirname, "../../../core/src/__fixtures__");
const V1_PATH = resolve(FIXTURES_DIR, "server-v1.mcpc.json");

let tmpDir: string;
let validPath: string;
let tamperedPath: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "mcpdiff-verify-hash-test-"));

  // Create a snapshot with a valid content hash
  const snapshot = JSON.parse(readFileSync(V1_PATH, "utf-8")) as MCPContractSnapshot;
  snapshot.contentHash = computeContentHash(snapshot.tools, snapshot.resources, snapshot.prompts);
  validPath = join(tmpDir, "valid.mcpc.json");
  writeFileSync(validPath, JSON.stringify(snapshot, null, 2));

  // Create a tampered snapshot where the contentHash no longer matches
  const tampered = JSON.parse(readFileSync(V1_PATH, "utf-8")) as MCPContractSnapshot;
  tampered.contentHash = computeContentHash(tampered.tools, tampered.resources, tampered.prompts);
  const tool = tampered.tools["create_contact"];
  if (tool) tool.description = "TAMPERED";
  // contentHash now stale — no longer matches tools
  tamperedPath = join(tmpDir, "tampered.mcpc.json");
  writeFileSync(tamperedPath, JSON.stringify(tampered, null, 2));
});

function createProgram(): Command {
  const program = new Command();
  program
    .option("--format <format>", "Output format")
    .option("--no-color", "Disable colored output")
    .option("-o, --output <path>", "Output file");
  program.addCommand(createVerifyHashCommand());
  return program;
}

describe("verify-hash command", () => {
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

  it("passes for a valid snapshot (terminal)", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "mcpdiff", "verify-hash", validPath, "--format", "terminal"]);
    expect(stdoutData).toContain("Content hash verified");
    expect(exitCode).toBeUndefined();
  });

  it("passes for a valid snapshot (json)", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "mcpdiff", "verify-hash", validPath, "--format", "json"]);
    const output = JSON.parse(stdoutData);
    expect(output.valid).toBe(true);
    expect(output.expected).toBe(output.actual);
  });

  it("fails for a tampered snapshot (terminal)", async () => {
    const program = createProgram();
    try {
      await program.parseAsync([
        "node",
        "mcpdiff",
        "verify-hash",
        tamperedPath,
        "--format",
        "terminal",
      ]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(1);
    expect(stderrData).toContain("Content hash mismatch");
    expect(stderrData).toContain("Expected:");
    expect(stderrData).toContain("Actual:");
  });

  it("fails for a tampered snapshot (json)", async () => {
    const program = createProgram();
    try {
      await program.parseAsync([
        "node",
        "mcpdiff",
        "verify-hash",
        tamperedPath,
        "--format",
        "json",
      ]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(1);
    const output = JSON.parse(stdoutData);
    expect(output.valid).toBe(false);
    expect(output.expected).not.toBe(output.actual);
  });

  it("errors on invalid file path", async () => {
    const program = createProgram();
    try {
      await program.parseAsync(["node", "mcpdiff", "verify-hash", "/nonexistent/path.json"]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(2);
    expect(stderrData).toContain("Failed to read snapshot file");
  });
});
