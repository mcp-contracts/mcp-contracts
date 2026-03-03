import type { MCPContractSnapshot, Severity } from "@mcp-contracts/core";
import {
  createWebhookPayload,
  diffSnapshots,
  formatJson,
  formatMarkdown,
  formatTerminal,
  SEVERITY_ORDER,
} from "@mcp-contracts/core";
import { Command } from "commander";
import type { TransportOptions } from "../transport.js";
import { addTransportOptions, resolveTransport } from "../transport.js";
import {
  CliExitError,
  handleErrors,
  readSnapshotFile,
  resolveFormat,
  stripAnsi,
  writeOutput,
} from "../utils.js";
import { sendWebhook } from "../webhook.js";
import { captureSnapshot } from "./capture.js";

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
 * Resolves the "after" snapshot, either from file or by capturing from a live server.
 *
 * @param afterPath - Path to snapshot file (may be undefined in live mode).
 * @param live - Whether live mode is enabled.
 * @param options - CLI options containing transport settings.
 * @param quiet - Suppress non-essential output.
 * @returns The "after" snapshot.
 */
async function resolveAfterSnapshot(
  afterPath: string | undefined,
  live: boolean,
  options: Record<string, unknown>,
  quiet: boolean,
): Promise<MCPContractSnapshot> {
  if (!live) {
    if (!afterPath) {
      throw new Error("Two snapshot file paths are required (or use --live for a live server)");
    }
    return readSnapshotFile(afterPath);
  }

  const transportOpts: TransportOptions = {
    command: options.command as string | undefined,
    url: options.url as string | undefined,
    config: options.config as string | undefined,
    server: options.server as string | undefined,
    args: options.args as string[] | undefined,
    env: options.env as string[] | undefined,
    sse: options.sse === true ? true : undefined,
    header: options.header as string[] | undefined,
  };

  const config = resolveTransport(transportOpts);
  const { snapshot } = await captureSnapshot({ transport: config, quiet });
  return snapshot;
}

/**
 * Creates the `diff` subcommand for the mcpdiff CLI.
 *
 * Supports two modes:
 * - File mode: `mcpdiff diff <before> <after>` — compares two snapshot files
 * - Live mode: `mcpdiff diff --live <before> [transport opts]` — diffs baseline against a live server
 *
 * @returns A Commander Command instance for the diff subcommand.
 */
export function createDiffCommand(): Command {
  const cmd = new Command("diff")
    .description("Compare two snapshots and report changes")
    .argument("<before>", "Path to baseline snapshot file")
    .argument("[after]", "Path to updated snapshot file (not needed with --live)")
    .option("--live", "Diff baseline against a live server instead of a file")
    .option("--severity <level>", "Minimum severity to display: safe | warning | breaking", "safe")
    .option("--fail-on <level>", "Exit code 1 threshold: safe | warning | breaking", "breaking")
    .option("--webhook <url>", "POST diff results to a webhook URL");

  addTransportOptions(cmd);

  cmd.action(
    handleErrors(
      async (
        beforePath: string,
        afterPath: string | undefined,
        options: Record<string, unknown>,
      ) => {
        const severity = parseSeverity(options.severity as string, "--severity");
        const failOn = parseSeverity(options.failOn as string, "--fail-on");
        const live = options.live === true;

        const parentOpts = cmd.parent?.opts() ?? {};
        const quiet = parentOpts.quiet === true;

        const before = readSnapshotFile(beforePath);
        const after = await resolveAfterSnapshot(afterPath, live, options, quiet);

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

        // Send webhook if configured
        const webhookUrl = options.webhook as string | undefined;
        if (webhookUrl) {
          const trigger = live ? "cli" : "cli";
          const payload = createWebhookPayload(report, {
            trigger,
            baselinePath: beforePath,
          });
          const result = await sendWebhook(webhookUrl, payload);
          if (!result.success) {
            process.stderr.write(`Warning: Webhook failed: ${result.error}\n`);
          }
        }

        // Determine exit code using unfiltered diff
        const fullReport = diffSnapshots(before, after);
        const failThreshold = SEVERITY_ORDER[failOn];
        const hasFailure = fullReport.changes.some(
          (c) => SEVERITY_ORDER[c.severity] >= failThreshold,
        );

        if (hasFailure) {
          throw new CliExitError(1);
        }
      },
    ),
  );

  return cmd;
}
