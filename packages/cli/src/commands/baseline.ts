import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { diffSnapshots } from "@mcp-contracts/core";
import { Command } from "commander";
import {
  DEFAULT_BASELINE_PATH,
  loadProjectConfig,
  resolveBaselinePath,
  resolveTransportOrProject,
} from "../project-config.js";
import { addTransportOptions } from "../transport.js";
import {
  CliExitError,
  getRootOpts,
  handleErrors,
  readSnapshotFile,
  writeOutput,
} from "../utils.js";
import { captureSnapshot } from "./capture.js";

/**
 * Creates the `baseline update` subcommand.
 *
 * Captures a snapshot from a live server and writes it to a baseline path.
 * The path comes from the global --output option, then the project config's
 * "baseline", then contracts/baseline.mcpc.json.
 *
 * @returns A Commander Command instance.
 */
export function createBaselineUpdateCommand(): Command {
  const cmd = new Command("update").description(
    "Capture a snapshot and write it as a baseline file",
  );

  addTransportOptions(cmd);

  cmd.action(
    handleErrors(async (options: Record<string, unknown>) => {
      const rootOpts = getRootOpts(cmd);
      const quiet = rootOpts["quiet"] === true;
      const project = loadProjectConfig(rootOpts["project"] as string | undefined);
      const outputPath =
        resolveBaselinePath(rootOpts["output"] as string | undefined, project) ??
        DEFAULT_BASELINE_PATH;

      const config = resolveTransportOrProject(options, project);

      const { snapshot } = await captureSnapshot({ transport: config, quiet });

      mkdirSync(dirname(outputPath), { recursive: true });
      const json = JSON.stringify(snapshot, null, 2);
      writeOutput(`${json}\n`, outputPath);

      if (!quiet) {
        process.stderr.write(`Baseline written to ${outputPath}\n`);
      }
    }),
  );

  return cmd;
}

/**
 * Creates the `baseline verify` subcommand.
 *
 * Verifies the current server matches a committed baseline by comparing content hashes.
 *
 * @returns A Commander Command instance.
 */
export function createBaselineVerifyCommand(): Command {
  const cmd = new Command("verify").description(
    "Verify the current server matches a committed baseline",
  );

  addTransportOptions(cmd);

  cmd
    .option("--baseline <path>", `Path to baseline file (default: "${DEFAULT_BASELINE_PATH}")`)
    .action(
      handleErrors(async (options: Record<string, unknown>) => {
        const rootOpts = getRootOpts(cmd);
        const quiet = rootOpts["quiet"] === true;
        const project = loadProjectConfig(rootOpts["project"] as string | undefined);
        const baselinePath =
          resolveBaselinePath(options["baseline"] as string | undefined, project) ??
          DEFAULT_BASELINE_PATH;

        const baseline = readSnapshotFile(baselinePath);

        const config = resolveTransportOrProject(options, project);

        const { snapshot: current } = await captureSnapshot({ transport: config, quiet });

        if (baseline.contentHash === current.contentHash) {
          if (!quiet) {
            process.stderr.write("Baseline verified: contract unchanged\n");
          }
          return;
        }

        const report = diffSnapshots(baseline, current);
        const { breaking, warning, safe } = report.summary;
        const parts: string[] = [];
        if (breaking > 0) parts.push(`${breaking} breaking`);
        if (warning > 0) parts.push(`${warning} warning`);
        if (safe > 0) parts.push(`${safe} safe`);
        const summary = parts.length > 0 ? parts.join(", ") : "0";

        process.stderr.write(`Baseline mismatch: contract has changed (${summary} changes)\n`);
        throw new CliExitError(1);
      }),
    );

  return cmd;
}

/**
 * Creates the `baseline` command group with `update` and `verify` subcommands.
 *
 * @returns A Commander Command instance.
 */
export function createBaselineCommand(): Command {
  const baseline = new Command("baseline").description("Manage contract baselines");

  baseline.addCommand(createBaselineUpdateCommand());
  baseline.addCommand(createBaselineVerifyCommand());

  return baseline;
}
