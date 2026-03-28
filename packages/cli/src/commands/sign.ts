import { readFileSync } from "node:fs";
import { signContentHash, verifyContentHash } from "@mcp-contracts/core";
import { Command } from "commander";
import { handleErrors, readSnapshotFile, writeOutput } from "../utils.js";

/**
 * Derives the `.mcpc.sig` path from a snapshot file path.
 *
 * @param snapshotPath - Path to the `.mcpc.json` file.
 * @returns The corresponding `.mcpc.sig` path.
 */
export function deriveSignaturePath(snapshotPath: string): string {
  if (snapshotPath.endsWith(".mcpc.json")) {
    return `${snapshotPath.slice(0, -".mcpc.json".length)}.mcpc.sig`;
  }
  return `${snapshotPath}.sig`;
}

/**
 * Creates the `sign` subcommand for the mcpdiff CLI.
 *
 * Signs a snapshot's content hash with a private key and produces a detached
 * `.mcpc.sig` file alongside the snapshot.
 *
 * @returns A Commander Command instance for the sign subcommand.
 */
export function createSignCommand(): Command {
  const cmd = new Command("sign")
    .description("Sign a snapshot with a private key")
    .argument("<snapshot>", "Path to the snapshot file (.mcpc.json)")
    .requiredOption("--key <path>", "Path to private key (PEM format, Ed25519 or RSA)")
    .action(
      handleErrors(async (snapshotPath: string, options: Record<string, unknown>) => {
        const rootOpts = getRootOpts(cmd);
        const outputPath =
          (rootOpts["output"] as string | undefined) ?? deriveSignaturePath(snapshotPath);

        const snapshot = readSnapshotFile(snapshotPath);

        const hashCheck = verifyContentHash(snapshot);
        if (!hashCheck.valid) {
          throw new Error(
            `Content hash mismatch: stored "${hashCheck.expected}" but recomputed "${hashCheck.actual}". ` +
              "Refusing to sign a snapshot with an invalid content hash.",
          );
        }

        let keyPem: string;
        try {
          keyPem = readFileSync(options["key"] as string, "utf-8");
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(`Failed to read key file: ${message}`);
        }

        const sig = signContentHash(snapshot.contentHash, keyPem);
        const json = JSON.stringify(sig, null, 2);

        writeOutput(`${json}\n`, outputPath);
        process.stderr.write(`Signature written to ${outputPath}\n`);
      }),
    );

  return cmd;
}

/**
 * Resolves the root program options from a deeply nested subcommand.
 *
 * @param cmd - The current Command instance.
 * @returns The root program's parsed options.
 */
function getRootOpts(cmd: Command): Record<string, unknown> {
  let current: Command | null = cmd;
  while (current.parent) {
    current = current.parent;
  }
  return current.opts();
}
