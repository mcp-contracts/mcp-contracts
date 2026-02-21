import { Command } from "commander";
import {
  SEVERITY_ORDER,
  diffSnapshots,
  formatJson,
  formatMarkdown,
  formatTerminal,
} from "@mcp-contracts/core";
import type { Severity } from "@mcp-contracts/core";
import { CliExitError, handleErrors, readSnapshotFile, resolveFormat, stripAnsi, writeOutput } from "../utils.js";

const VALID_SEVERITIES = new Set<string>(["safe", "warning", "breaking"]);

/**
 * Validates that a string is a valid Severity level.
 *
 * @param value - The string to validate.
 * @param label - Label for the option (used in error messages).
 * @returns The validated Severity value.
 */
function parseSeverity(value: string, label: string): Severity {
  if (!VALID_SEVERITIES.has(value)) {
    throw new Error(`Invalid ${label} value "${value}". Must be one of: safe, warning, breaking`);
  }
  return value as Severity;
}

/**
 * Creates the `diff` subcommand for the mcpdiff CLI.
 *
 * @returns A Commander Command instance for the diff subcommand.
 */
export function createDiffCommand(): Command {
  const cmd = new Command("diff")
    .description("Compare two snapshots and report changes")
    .argument("<before>", "Path to baseline snapshot file")
    .argument("<after>", "Path to updated snapshot file")
    .option("--severity <level>", "Minimum severity to display: safe | warning | breaking", "safe")
    .option("--fail-on <level>", "Exit code 1 threshold: safe | warning | breaking", "breaking")
    .action(
      handleErrors(async (beforePath: string, afterPath: string, options: Record<string, unknown>) => {
        const severity = parseSeverity(options.severity as string, "--severity");
        const failOn = parseSeverity(options.failOn as string, "--fail-on");

        const before = readSnapshotFile(beforePath);
        const after = readSnapshotFile(afterPath);

        const parentOpts = cmd.parent?.opts() ?? {};
        const format = resolveFormat(parentOpts.format as string | undefined);
        const noColor = parentOpts.color === false;
        const outputPath = parentOpts.output as string | undefined;

        const report = diffSnapshots(before, after, { minSeverity: severity });

        let output: string;
        if (format === "json") {
          output = formatJson(report);
        } else if (format === "markdown") {
          output = formatMarkdown(report);
        } else {
          output = formatTerminal(report);
        }

        if (noColor && format === "terminal") {
          output = stripAnsi(output);
        }

        writeOutput(`${output}\n`, outputPath);

        // Determine exit code using unfiltered diff
        const fullReport = diffSnapshots(before, after);
        const failThreshold = SEVERITY_ORDER[failOn];
        const hasFailure = fullReport.changes.some(
          (c) => SEVERITY_ORDER[c.severity] >= failThreshold,
        );

        if (hasFailure) {
          throw new CliExitError(1);
        }
      }),
    );

  return cmd;
}
