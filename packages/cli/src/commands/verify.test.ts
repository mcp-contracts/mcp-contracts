import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { MCPContractSnapshot } from "@mcp-contracts/core";
import { computeContentHash, signContentHash } from "@mcp-contracts/core";
import { Command } from "commander";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createVerifyCommand } from "./verify.js";

const FIXTURES_DIR = resolve(import.meta.dirname, "../../../core/src/__fixtures__");
const V1_PATH = resolve(FIXTURES_DIR, "server-v1.mcpc.json");

let ed25519PublicPath: string;
let sigPath: string;
let validSnapshotPath: string;
let tmpDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "mcpdiff-verify-test-"));

  const ed = generateKeyPairSync("ed25519");
  const privatePem = ed.privateKey.export({ type: "pkcs8", format: "pem" }) as string;
  const publicPem = ed.publicKey.export({ type: "spki", format: "pem" }) as string;

  ed25519PublicPath = join(tmpDir, "public.pem");
  writeFileSync(ed25519PublicPath, publicPem);

  // Create a snapshot with a valid content hash
  const snapshot = JSON.parse(readFileSync(V1_PATH, "utf-8")) as MCPContractSnapshot;
  snapshot.contentHash = computeContentHash(snapshot.tools, snapshot.resources, snapshot.prompts);
  validSnapshotPath = join(tmpDir, "valid.mcpc.json");
  writeFileSync(validSnapshotPath, JSON.stringify(snapshot, null, 2));

  // Create a signature for the snapshot with correct hash
  const sig = signContentHash(snapshot.contentHash, privatePem);
  sigPath = join(tmpDir, "valid.mcpc.sig");
  writeFileSync(sigPath, JSON.stringify(sig, null, 2));
});

function createProgram(): Command {
  const program = new Command();
  program
    .option("--format <format>", "Output format")
    .option("--no-color", "Disable colored output")
    .option("-o, --output <path>", "Output file");
  program.addCommand(createVerifyCommand());
  return program;
}

describe("verify command", () => {
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

  it("succeeds with valid signature and explicit --signature path", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "mcpdiff",
      "--format",
      "terminal",
      "verify",
      validSnapshotPath,
      "--key",
      ed25519PublicPath,
      "--signature",
      sigPath,
    ]);
    expect(stderrData).toContain("Signature verified");
    expect(exitCode).toBeUndefined();
  });

  it("fails with wrong public key", async () => {
    const wrongEd = generateKeyPairSync("ed25519");
    const wrongPublicPath = join(tmpDir, "wrong-public.pem");
    writeFileSync(
      wrongPublicPath,
      wrongEd.publicKey.export({ type: "spki", format: "pem" }) as string,
    );

    const program = createProgram();
    try {
      await program.parseAsync([
        "node",
        "mcpdiff",
        "--format",
        "terminal",
        "verify",
        validSnapshotPath,
        "--key",
        wrongPublicPath,
        "--signature",
        sigPath,
      ]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(1);
    expect(stderrData).toContain("Signature verification failed");
  });

  it("errors when signature file is missing", async () => {
    const program = createProgram();
    try {
      await program.parseAsync([
        "node",
        "mcpdiff",
        "verify",
        validSnapshotPath,
        "--key",
        ed25519PublicPath,
        "--signature",
        "/nonexistent/file.sig",
      ]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(2);
    expect(stderrData).toContain("Failed to read signature file");
  });

  it("errors when key file is missing", async () => {
    const program = createProgram();
    try {
      await program.parseAsync([
        "node",
        "mcpdiff",
        "verify",
        validSnapshotPath,
        "--key",
        "/nonexistent/key.pem",
        "--signature",
        sigPath,
      ]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(2);
    expect(stderrData).toContain("Failed to read key file");
  });
});

describe("verify command — hash-only mode (no --key)", () => {
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

  it("verifies the content hash and notes the signature was not checked", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "mcpdiff",
      "--format",
      "terminal",
      "verify",
      validSnapshotPath,
    ]);
    expect(stdoutData).toContain("Content hash verified");
    expect(stderrData).toContain("only the content hash was checked");
    expect(stderrData).toContain("--key");
    expect(exitCode).toBeUndefined();
  });

  it("exits 1 on a tampered snapshot", async () => {
    const snapshot = JSON.parse(readFileSync(validSnapshotPath, "utf-8"));
    snapshot.contentHash =
      "sha256:0000000000000000000000000000000000000000000000000000000000000000";
    const tamperedPath = join(tmpDir, "tampered.mcpc.json");
    writeFileSync(tamperedPath, JSON.stringify(snapshot, null, 2));

    const program = createProgram();
    try {
      await program.parseAsync(["node", "mcpdiff", "--format", "terminal", "verify", tamperedPath]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(1);
    expect(stderrData).toContain("Content hash mismatch");
  });

  it("reports checks: [hash] in JSON output", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "mcpdiff", "--format", "json", "verify", validSnapshotPath]);
    const result = JSON.parse(stdoutData);
    expect(result.valid).toBe(true);
    expect(result.checks).toEqual(["hash"]);
  });

  it("reports checks: [hash, binding, signature] in JSON output with --key", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "mcpdiff",
      "--format",
      "json",
      "verify",
      validSnapshotPath,
      "--key",
      ed25519PublicPath,
      "--signature",
      sigPath,
    ]);
    const result = JSON.parse(stdoutData);
    expect(result.valid).toBe(true);
    expect(result.checks).toEqual(["hash", "binding", "signature"]);
  });
});
