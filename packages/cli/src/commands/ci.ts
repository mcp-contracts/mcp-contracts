import { appendFileSync } from "node:fs";
import {
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
import {
  loadProjectConfig,
  resolveBaselinePath,
  resolveTransportOrProject,
} from "../project-config.js";
import { addTransportOptions } from "../transport.js";
import {
  CliExitError,
  getRootOpts,
  handleErrors,
  parseSeverity,
  readSnapshotFile,
  resolveFormat,
  stripAnsi,
  writeOutput,
} from "../utils.js";
import { sendWebhook } from "../webhook.js";
import { captureSnapshot } from "./capture.js";

/**
 * Creates the `ci` subcommand for the mcpdiff CLI.
 *
 * The ci command is an all-in-one for CI pipelines: captures a snapshot,
 * diffs against a baseline, outputs the report, and sets the exit code.
 *
 * @returns A Commander Command instance for the ci subcommand.
 */
export function createCiCommand(): Command {
  const cmd = new Command("ci").description(
    "CI pipeline: capture snapshot, diff against baseline, report results",
  );

  addTransportOptions(cmd);

  cmd
    .option("--baseline <path>", "Path to baseline snapshot")
    .option("--fail-on <level>", 'Severity threshold for exit code 1 (default: "breaking")')
    .option("--severity <level>", "Minimum severity to display", "safe")
    .option("--webhook <url>", "POST diff results to a webhook URL")
    .option("--verify-signature", "Require valid signature on baseline before diffing")
    .option("--signature-key <path>", "Path to public key for signature verification")
    .action(
      handleErrors(async (options: Record<string, unknown>) => {
        const rootOpts = getRootOpts(cmd);
        const quiet = rootOpts["quiet"] === true;
        const noColor = rootOpts["color"] === false;
        const outputPath = rootOpts["output"] as string | undefined;
        const explicitFormat = rootOpts["format"] as string | undefined;

        const project = loadProjectConfig(rootOpts["project"] as string | undefined);

        const severity = parseSeverity(options["severity"] as string, "--severity");
        const failOn = parseSeverity(
          (options["failOn"] as string | undefined) ?? project?.config.failOn ?? "breaking",
          "--fail-on",
        );

        const baselinePath = resolveBaselinePath(
          options["baseline"] as string | undefined,
          project,
        );
        if (!baselinePath) {
          throw new Error('--baseline is required (or set "baseline" in mcpcontracts.json)');
        }
        const baseline = readSnapshotFile(baselinePath);

        // Verify baseline signature if requested
        if (options["verifySignature"] === true) {
          verifyBaselineSignature(
            baseline,
            baselinePath,
            options["signatureKey"] as string | undefined,
            quiet,
          );
        }

        const config = resolveTransportOrProject(options, project);

        const { snapshot: current } = await captureSnapshot({ transport: config, quiet });

        // Diff
        const report = diffSnapshots(baseline, current, { minSeverity: severity });

        // Detect CI environment
        const ciEnv = detectCIEnvironment();

        // Resolve format
        let format: "terminal" | "json" | "markdown";
        if (explicitFormat) {
          format = resolveFormat(explicitFormat);
        } else if (ciEnv.isCI) {
          format = ciEnv.suggestedFormat as "json" | "markdown";
        } else {
          format = resolveFormat(undefined);
        }

        // Format report
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

        // GitHub Actions step summary
        if (ciEnv.stepSummaryPath) {
          const markdown = formatMarkdown(report);
          appendFileSync(ciEnv.stepSummaryPath, `${markdown}\n`);
        }

        // Send webhook if configured
        const webhookUrl = options["webhook"] as string | undefined;
        if (webhookUrl) {
          const payload = createWebhookPayload(report, {
            trigger: "ci",
            baselinePath,
          });
          const webhookResult = await sendWebhook(webhookUrl, payload);
          if (!webhookResult.success) {
            process.stderr.write(`Warning: Webhook failed: ${webhookResult.error}\n`);
          }
        }

        // Determine exit code using unfiltered diff
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
