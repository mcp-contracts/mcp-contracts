import { verifyContentHash } from "@mcp-contracts/core";
import { Command } from "commander";
import {
  CliExitError,
  getRootOpts,
  handleErrors,
  printDeprecationNotice,
  readSnapshotFile,
  resolveFormat,
  writeOutput,
} from "../utils.js";

/**
 * Creates the `verify-hash` subcommand for the mcpdiff CLI.
 *
 * Recomputes the content hash of a snapshot and compares it to the stored value.
 * Quick integrity check without needing keys or signatures.
 *
 * @returns A Commander Command instance for the verify-hash subcommand.
 */
export function createVerifyHashCommand(): Command {
  const cmd = new Command("verify-hash")
    .description("Verify a snapshot's content hash integrity")
    .argument("<snapshot>", "Path to the snapshot file (.mcpc.json)")
    .action(
      handleErrors(async (snapshotPath: string) => {
        const rootOpts = getRootOpts(cmd);
        if (rootOpts["quiet"] !== true) {
          printDeprecationNotice("mcpdiff verify-hash", "mcpdiff verify");
        }
        const format = resolveFormat(rootOpts["format"] as string | undefined);
        const outputPath = rootOpts["output"] as string | undefined;

        const snapshot = readSnapshotFile(snapshotPath);
        const result = verifyContentHash(snapshot);

        if (format === "json") {
          writeOutput(`${JSON.stringify(result, null, 2)}\n`, outputPath);
        } else if (result.valid) {
          writeOutput(`Content hash verified: ${result.actual}\n`, outputPath);
        } else {
          process.stderr.write(
            `Content hash mismatch!\n  Expected: ${result.expected}\n  Actual:   ${result.actual}\n`,
          );
        }

        if (!result.valid) {
          throw new CliExitError(1);
        }
      }),
    );

  return cmd;
}
