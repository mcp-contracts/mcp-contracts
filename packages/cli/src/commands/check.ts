import { appendFileSync } from "node:fs";
import type { DiffReport } from "@mcp-contracts/core";
import {
  createEmptyDiffReport,
  createWebhookPayload,
  diffSnapshots,
  formatJson,
  formatMarkdown,
  formatTerminal,
  SEVERITY_ORDER,
} from "@mcp-contracts/core";
import { Command } from "commander";
import { verifyBaselineSignature } from "../baseline-signature.js";
import { detectCIEnvironment } from "../ci-env.js";
import { loadProjectConfig, resolveTransportOrProject } from "../project-config.js";
import { addTransportOptions } from "../transport.js";
import {
  CliExitError,
  getRootOpts,
  handleErrors,
  type OutputFormat,
  readSnapshotFile,
  resolveFormat,
  stripAnsi,
  writeOutput,
} from "../utils.js";
import { runWatchLoop } from "../watch-loop.js";
import { sendWebhook } from "../webhook.js";
import { captureSnapshot } from "./capture.js";
import { resolveWatchOptions } from "./watch.js";

/**
 * Resolves the output format: explicit --format wins, then the CI
 * environment's suggestion, then TTY detection.
 *
 * @param explicitFormat - The --format value, if given.
 * @returns The resolved output format.
 */
function resolveCheckFormat(explicitFormat: string | undefined): OutputFormat {
  if (explicitFormat) {
    return resolveFormat(explicitFormat);
  }
  const ciEnv = detectCIEnvironment();
  if (ciEnv.isCI) {
    return ciEnv.suggestedFormat as OutputFormat;
  }
  return resolveFormat(undefined);
}

/**
 * Formats a diff report in the requested output format.
 *
 * @param report - The diff report to format.
 * @param format - The output format.
 * @param noColor - Strip ANSI colors from terminal output.
 * @returns The formatted report string.
 */
function formatReport(report: DiffReport, format: OutputFormat, noColor: boolean): string {
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
  return output;
}

/**
 * Creates the `check` subcommand for the mcpdiff CLI.
 *
 * The one command for "does the live server still match the baseline":
 * captures a snapshot, diffs it against the baseline, reports, and sets the
 * exit code. Detects CI environments, optionally verifies the baseline
 * signature, and re-runs on file changes with --watch.
 *
 * @returns A Commander Command instance for the check subcommand.
 */
export function createCheckCommand(): Command {
  const cmd = new Command("check").description("Verify the live server still matches the baseline");

  addTransportOptions(cmd);

  cmd
    .option("--baseline <path>", "Path to baseline snapshot")
    .option("--fail-on <level>", 'Severity threshold for exit code 1 (default: "breaking")')
    .option("--severity <level>", "Minimum severity to display", "safe")
    .option("--webhook <url>", "POST diff results to a webhook URL")
    .option("--verify-signature", "Require valid signature on baseline before diffing")
    .option("--signature-key <path>", "Path to public key for signature verification")
    .option("--watch", "Re-run the check on file changes")
    .option("--watch-paths <paths...>", 'Paths to watch with --watch (default: ".")')
    .option("--debounce <ms>", "Debounce interval for --watch in milliseconds (default: 500)")
    .option("--clear", "Clear screen between --watch cycles")
    .action(
      handleErrors(async (options: Record<string, unknown>) => {
        const rootOpts = getRootOpts(cmd);
        const quiet = rootOpts["quiet"] === true;
        const project = loadProjectConfig(rootOpts["project"] as string | undefined);

        // Shared flags > config > defaults resolution with the watch command.
        const { severity, failOn, debounceMs, watchPaths, baselinePath, webhookUrl, shouldClear } =
          resolveWatchOptions(options, project);

        const baseline = readSnapshotFile(baselinePath);

        if (options["verifySignature"] === true) {
          verifyBaselineSignature(
            baseline,
            baselinePath,
            options["signatureKey"] as string | undefined,
            quiet,
          );
        }

        const transport = resolveTransportOrProject(options, project);

        if (options["watch"] === true) {
          await runWatchLoop({
            transport,
            baselinePath,
            watchPaths,
            debounceMs,
            minSeverity: severity,
            failOn,
            webhookUrl,
            shouldClear,
            quiet,
          });
          return;
        }

        const { snapshot: current } = await captureSnapshot({ transport, quiet });

        // Fast path from the absorbed `baseline verify`: freshly captured
        // snapshots hash honestly, so a matching hash means no changes and
        // the diff engine can be skipped.
        const unchanged = baseline.contentHash === current.contentHash;
        const report = unchanged
          ? createEmptyDiffReport(baseline, current)
          : diffSnapshots(baseline, current, { minSeverity: severity });

        const format = resolveCheckFormat(rootOpts["format"] as string | undefined);
        const noColor = rootOpts["color"] === false;
        const output = formatReport(report, format, noColor);
        writeOutput(`${output}\n`, rootOpts["output"] as string | undefined);

        if (unchanged && !quiet) {
          process.stderr.write("Contract unchanged\n");
        }

        // GitHub Actions step summary
        const ciEnv = detectCIEnvironment();
        if (ciEnv.stepSummaryPath) {
          appendFileSync(ciEnv.stepSummaryPath, `${formatMarkdown(report)}\n`);
        }

        if (webhookUrl) {
          const payload = createWebhookPayload(report, { trigger: "ci", baselinePath });
          const webhookResult = await sendWebhook(webhookUrl, payload);
          if (!webhookResult.success) {
            process.stderr.write(`Warning: Webhook failed: ${webhookResult.error}\n`);
          }
        }

        if (unchanged) {
          return;
        }

        // Determine exit code using the unfiltered diff
        const fullReport = diffSnapshots(baseline, current);
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
