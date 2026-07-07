/**
 * The `check-conflicts` command.
 *
 * Connects to every server in an mcp.json composition and detects tool
 * names exposed by more than one server. Conflicting duplicates (same name,
 * different schemas) are dangerous for agents that route by bare tool name.
 */

import type { CollisionReport } from "@mcp-contracts/core";
import {
  detectToolCollisions,
  formatCollisionsJson,
  formatCollisionsMarkdown,
  formatCollisionsTerminal,
} from "@mcp-contracts/core";
import { Command } from "commander";
import { listConfigServers } from "../mcp-config.js";
import type { OutputFormat } from "../utils.js";
import { CliExitError, handleErrors, resolveFormat, stripAnsi, writeOutput } from "../utils.js";
import { captureAllServers } from "./capture-all.js";

/** Valid values for the --fail-on option. */
const FAIL_ON_VALUES = new Set(["any", "conflicting"]);

/**
 * Formats a collision report in the requested output format.
 *
 * @param report - The collision report.
 * @param format - The output format.
 * @returns The formatted report string.
 */
export function formatCollisionReport(report: CollisionReport, format: OutputFormat): string {
  if (format === "json") {
    return formatCollisionsJson(report);
  }
  if (format === "markdown") {
    return formatCollisionsMarkdown(report);
  }
  return formatCollisionsTerminal(report);
}

/**
 * Decides whether a collision report should fail CI.
 *
 * @param report - The collision report.
 * @param failOn - "any" fails on every collision; "conflicting" only on schema conflicts.
 * @returns True when the scan should fail.
 */
export function collisionsHaveFailure(
  report: CollisionReport,
  failOn: "any" | "conflicting",
): boolean {
  if (failOn === "conflicting") {
    return report.summary.conflicting > 0;
  }
  return report.summary.total > 0;
}

/**
 * Creates the `check-conflicts` subcommand for the mcpdiff CLI.
 *
 * @returns A Commander Command instance for the check-conflicts subcommand.
 */
export function createCheckConflictsCommand(): Command {
  const cmd = new Command("check-conflicts")
    .description("Detect duplicate tool names across the servers of an mcp.json config")
    .requiredOption("--config <path>", "Path to mcp.json config file")
    .option(
      "--fail-on <kind>",
      "Exit code 1 threshold: any (every collision) | conflicting (schema conflicts only)",
      "any",
    );

  cmd.action(
    handleErrors(async (options: Record<string, unknown>) => {
      const failOn = options["failOn"] as string;
      if (!FAIL_ON_VALUES.has(failOn)) {
        throw new Error(`Invalid --fail-on value "${failOn}". Must be one of: any, conflicting`);
      }

      const parentOpts = cmd.parent?.opts() ?? {};
      const quiet = parentOpts["quiet"] === true;
      const format = resolveFormat(parentOpts["format"] as string | undefined);
      const noColor = parentOpts["color"] === false;
      const outputPath = parentOpts["output"] as string | undefined;

      const servers = listConfigServers(options["config"] as string);
      const { entries, failures } = await captureAllServers(servers, quiet);

      const report = detectToolCollisions(entries);

      let output = formatCollisionReport(report, format);
      if (noColor && format === "terminal") {
        output = stripAnsi(output);
      }
      writeOutput(`${output}\n`, outputPath);

      if (failures.length > 0) {
        const failed = failures.map((f) => `${f.serverName} (${f.error})`).join(", ");
        throw new Error(
          `Scan incomplete — failed to capture ${failures.length} server(s): ${failed}`,
        );
      }
      if (collisionsHaveFailure(report, failOn as "any" | "conflicting")) {
        throw new CliExitError(1);
      }
    }),
  );

  return cmd;
}
