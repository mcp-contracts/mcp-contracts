import { readFileSync } from "node:fs";
import { parseSignatureFile, verifySignature } from "@mcp-contracts/core";
import { Command } from "commander";
import { CliExitError, handleErrors, readSnapshotFile } from "../utils.js";
import { deriveSignaturePath } from "./sign.js";

/**
 * Creates the `verify` subcommand for the mcpdiff CLI.
 *
 * Verifies a snapshot's detached signature using a public key.
 * Checks content hash integrity, hash binding, and cryptographic signature.
 *
 * @returns A Commander Command instance for the verify subcommand.
 */
export function createVerifyCommand(): Command {
  const cmd = new Command("verify")
    .description("Verify a snapshot's signature with a public key")
    .argument("<snapshot>", "Path to the snapshot file (.mcpc.json)")
    .requiredOption("--key <path>", "Path to public key (PEM format, Ed25519 or RSA)")
    .option("--signature <path>", "Path to signature file (default: <snapshot>.mcpc.sig)")
    .action(
      handleErrors(async (snapshotPath: string, options: Record<string, unknown>) => {
        const snapshot = readSnapshotFile(snapshotPath);

        let keyPem: string;
        try {
          keyPem = readFileSync(options["key"] as string, "utf-8");
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(`Failed to read key file: ${message}`);
        }

        const sigPath =
          (options["signature"] as string | undefined) ?? deriveSignaturePath(snapshotPath);

        let sigJson: string;
        try {
          sigJson = readFileSync(sigPath, "utf-8");
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(`Failed to read signature file "${sigPath}": ${message}`);
        }

        const sig = parseSignatureFile(sigJson);
        const result = verifySignature(snapshot, sig, keyPem);

        if (result.valid) {
          process.stderr.write(`Signature verified: ${sig.algorithm} signature is valid\n`);
          return;
        }

        process.stderr.write(`Signature verification failed: ${result.error}\n`);
        throw new CliExitError(1);
      }),
    );

  return cmd;
}
