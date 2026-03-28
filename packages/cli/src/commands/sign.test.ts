import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { MCPContractSnapshot } from "@mcp-contracts/core";
import { computeContentHash } from "@mcp-contracts/core";
import { Command } from "commander";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createSignCommand } from "./sign.js";

const FIXTURES_DIR = resolve(import.meta.dirname, "../../../core/src/__fixtures__");
const V1_PATH = resolve(FIXTURES_DIR, "server-v1.mcpc.json");

let ed25519PrivatePath: string;
let validSnapshotPath: string;
let tmpDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "mcpdiff-sign-test-"));
  const ed = generateKeyPairSync("ed25519");
  ed25519PrivatePath = join(tmpDir, "private.pem");
  writeFileSync(
    ed25519PrivatePath,
    ed.privateKey.export({ type: "pkcs8", format: "pem" }) as string,
  );

  // Create a snapshot with a valid content hash
  const snapshot = JSON.parse(readFileSync(V1_PATH, "utf-8")) as MCPContractSnapshot;
  snapshot.contentHash = computeContentHash(snapshot.tools, snapshot.resources, snapshot.prompts);
  validSnapshotPath = join(tmpDir, "valid.mcpc.json");
  writeFileSync(validSnapshotPath, JSON.stringify(snapshot, null, 2));
});

function createProgram(): Command {
  const program = new Command();
  program
    .option("--format <format>", "Output format")
    .option("--no-color", "Disable colored output")
    .option("-o, --output <path>", "Output file");
  program.addCommand(createSignCommand());
  return program;
}

describe("sign command", () => {
  let stderrData: string;
  let exitCode: number | undefined;

  beforeEach(() => {
    stderrData = "";
    exitCode = undefined;
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
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

  it("produces a .mcpc.sig file", async () => {
    const sigPath = join(tmpDir, "valid.mcpc.sig");
    const program = createProgram();
    await program.parseAsync([
      "node",
      "mcpdiff",
      "sign",
      validSnapshotPath,
      "--key",
      ed25519PrivatePath,
      "-o",
      sigPath,
    ]);

    const sig = JSON.parse(readFileSync(sigPath, "utf-8"));
    expect(sig.signatureVersion).toBe("1.0.0");
    expect(sig.algorithm).toBe("Ed25519");
    expect(sig.signature).toBeTruthy();
    expect(stderrData).toContain("Signature written to");
  });

  it("refuses to sign a snapshot with invalid content hash", async () => {
    const program = createProgram();
    try {
      await program.parseAsync(["node", "mcpdiff", "sign", V1_PATH, "--key", ed25519PrivatePath]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(2);
    expect(stderrData).toContain("Content hash mismatch");
    expect(stderrData).toContain("Refusing to sign");
  });

  it("errors when key file is missing", async () => {
    const program = createProgram();
    try {
      await program.parseAsync([
        "node",
        "mcpdiff",
        "sign",
        validSnapshotPath,
        "--key",
        "/nonexistent/key.pem",
      ]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(2);
    expect(stderrData).toContain("Failed to read key file");
  });

  it("errors on invalid snapshot file", async () => {
    const program = createProgram();
    try {
      await program.parseAsync([
        "node",
        "mcpdiff",
        "sign",
        "/nonexistent/snapshot.mcpc.json",
        "--key",
        ed25519PrivatePath,
      ]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(2);
    expect(stderrData).toContain("Failed to read snapshot file");
  });
});
