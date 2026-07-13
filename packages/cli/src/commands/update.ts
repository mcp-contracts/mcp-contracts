import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Command } from "commander";
import {
  DEFAULT_BASELINE_PATH,
  loadProjectConfig,
  resolveBaselinePath,
  resolveTransportOrProject,
} from "../project-config.js";
import { addTransportOptions } from "../transport.js";
import { getRootOpts, handleErrors, writeOutput } from "../utils.js";
import { captureSnapshot } from "./capture.js";

/**
 * Creates the `update` subcommand for the mcpdiff CLI.
 *
 * Captures a snapshot from the live server and writes it as the baseline.
 * The path comes from --baseline, then the global --output option, then the
 * project config's "baseline", then contracts/baseline.mcpc.json. For ad-hoc
 * snapshots that are not baselines, use `snapshot -o <file>`.
 *
 * @returns A Commander Command instance for the update subcommand.
 */
export function createUpdateCommand(): Command {
  const cmd = new Command("update").description("Capture the live server and write the baseline");

  addTransportOptions(cmd);

  cmd
    .option("--baseline <path>", `Path to write the baseline (default: "${DEFAULT_BASELINE_PATH}")`)
    .action(
      handleErrors(async (options: Record<string, unknown>) => {
        const rootOpts = getRootOpts(cmd);
        const quiet = rootOpts["quiet"] === true;
        const project = loadProjectConfig(rootOpts["project"] as string | undefined);

        const flagPath =
          (options["baseline"] as string | undefined) ?? (rootOpts["output"] as string | undefined);
        const outputPath = resolveBaselinePath(flagPath, project) ?? DEFAULT_BASELINE_PATH;

        const transport = resolveTransportOrProject(options, project);

        const { snapshot } = await captureSnapshot({ transport, quiet });

        mkdirSync(dirname(outputPath), { recursive: true });
        writeOutput(`${JSON.stringify(snapshot, null, 2)}\n`, outputPath);

        if (!quiet) {
          process.stderr.write(`Baseline written to ${outputPath}\n`);
        }
      }),
    );

  return cmd;
}
