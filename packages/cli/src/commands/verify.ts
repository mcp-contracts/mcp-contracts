import { readFileSync } from "node:fs";
import { parseSignatureFile, verifyContentHash, verifySignature } from "@mcp-contracts/core";
import { Command } from "commander";
import {
  CliExitError,
  getRootOpts,
  handleErrors,
  readSnapshotFile,
  resolveFormat,
  writeOutput,
} from "../utils.js";
import { deriveSignaturePath } from "./sign.js";

/** The checks performed by a verify run, in execution order. */
const HASH_ONLY_CHECKS = ["hash"] as const;
const SIGNATURE_CHECKS = ["hash", "binding", "signature"] as const;

/**
 * Runs the content-hash-only verification (no key given).
 *
 * @param snapshotPath - Path to the snapshot file.
 * @param format - Resolved output format.
 * @param outputPath - Output file path, or undefined for stdout.
 */
function verifyHashOnly(
  snapshotPath: string,
  format: string,
  outputPath: string | undefined,
): void {
  const snapshot = readSnapshotFile(snapshotPath);
  const result = verifyContentHash(snapshot);

  if (format === "json") {
    const output = { ...result, checks: [...HASH_ONLY_CHECKS] };
    writeOutput(`${JSON.stringify(output, null, 2)}\n`, outputPath);
  } else if (result.valid) {
    writeOutput(`Content hash verified: ${result.actual}\n`, outputPath);
    process.stderr.write(
      "Note: only the content hash was checked; pass --key to verify a signature\n",
    );
  } else {
    process.stderr.write(
      `Content hash mismatch!\n  Expected: ${result.expected}\n  Actual:   ${result.actual}\n`,
    );
  }

  if (!result.valid) {
    throw new CliExitError(1);
  }
}

/**
 * Runs the full signature verification (hash + binding + signature).
 *
 * @param snapshotPath - Path to the snapshot file.
 * @param keyPath - Path to the public key file.
 * @param signaturePath - Explicit signature path, or undefined to derive it.
 * @param format - Resolved output format.
 * @param outputPath - Output file path, or undefined for stdout.
 */
function verifyWithKey(
  snapshotPath: string,
  keyPath: string,
  signaturePath: string | undefined,
  format: string,
  outputPath: string | undefined,
): void {
  const snapshot = readSnapshotFile(snapshotPath);

  let keyPem: string;
  try {
    keyPem = readFileSync(keyPath, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read key file: ${message}`);
  }

  const sigPath = signaturePath ?? deriveSignaturePath(snapshotPath);

  let sigJson: string;
  try {
    sigJson = readFileSync(sigPath, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read signature file "${sigPath}": ${message}`);
  }

  const sig = parseSignatureFile(sigJson);
  const result = verifySignature(snapshot, sig, keyPem);

  if (format === "json") {
    const output = { ...result, checks: [...SIGNATURE_CHECKS] };
    writeOutput(`${JSON.stringify(output, null, 2)}\n`, outputPath);
  } else if (result.valid) {
    process.stderr.write(`Signature verified: ${sig.algorithm} signature is valid\n`);
  } else {
    process.stderr.write(`Signature verification failed: ${result.error}\n`);
  }

  if (!result.valid) {
    throw new CliExitError(1);
  }
}

/**
 * Creates the `verify` subcommand for the mcpdiff CLI.
 *
 * Verifies the integrity/authenticity of a snapshot file. Without --key,
 * checks the content hash only. With --key, additionally verifies the
 * detached signature (hash + binding + cryptographic check).
 *
 * @returns A Commander Command instance for the verify subcommand.
 */
export function createVerifyCommand(): Command {
  const cmd = new Command("verify")
    .description("Verify a snapshot's integrity (content hash, plus signature with --key)")
    .argument("<snapshot>", "Path to the snapshot file (.mcpc.json)")
    .option("--key <path>", "Path to public key (PEM format, Ed25519 or RSA)")
    .option("--signature <path>", "Path to signature file (default: <snapshot>.mcpc.sig)")
    .action(
      handleErrors(async (snapshotPath: string, options: Record<string, unknown>) => {
        const rootOpts = getRootOpts(cmd);
        const format = resolveFormat(rootOpts["format"] as string | undefined);
        const outputPath = rootOpts["output"] as string | undefined;

        const keyPath = options["key"] as string | undefined;
        if (!keyPath) {
          verifyHashOnly(snapshotPath, format, outputPath);
          return;
        }

        verifyWithKey(
          snapshotPath,
          keyPath,
          options["signature"] as string | undefined,
          format,
          outputPath,
        );
      }),
    );

  return cmd;
}
