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
import { executeCompositionDiff } from "./diff-composition.js";

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
    command: options["command"] as string | undefined,
    url: options["url"] as string | undefined,
    config: options["config"] as string | undefined,
    server: options["server"] as string | undefined,
    args: options["args"] as string[] | undefined,
    env: options["env"] as string[] | undefined,
    sse: options["sse"] === true ? true : undefined,
    header: options["header"] as string[] | undefined,
  };

  const config = resolveTransport(transportOpts);
  const { snapshot } = await captureSnapshot({ transport: config, quiet });
  return snapshot;
}

/** Options for running a two-snapshot file/live diff. */
interface FileDiffOptions {
  beforePath: string;
  afterPath: string | undefined;
  live: boolean;
  options: Record<string, unknown>;
  severity: Severity;
  failOn: Severity;
  quiet: boolean;
  format: string;
  noColor: boolean;
  outputPath: string | undefined;
}

/**
 * Runs the classic two-snapshot diff flow: read, diff, output, webhook, exit.
 *
 * @param params - The resolved command options.
 */
async function runFileDiff(params: FileDiffOptions): Promise<void> {
  const before = readSnapshotFile(params.beforePath);
  const after = await resolveAfterSnapshot(
    params.afterPath,
    params.live,
    params.options,
    params.quiet,
  );

  const report = diffSnapshots(before, after, { minSeverity: params.severity });

  let output: string;
  if (params.format === "json") {
    output = formatJson(report);
  } else if (params.format === "markdown") {
    output = formatMarkdown(report);
  } else {
    output = formatTerminal(report);
  }

  if (params.noColor && params.format === "terminal") {
    output = stripAnsi(output);
  }

  writeOutput(`${output}\n`, params.outputPath);

  // Send webhook if configured
  const webhookUrl = params.options["webhook"] as string | undefined;
  if (webhookUrl) {
    const payload = createWebhookPayload(report, {
      trigger: "cli",
      baselinePath: params.beforePath,
    });
    const result = await sendWebhook(webhookUrl, payload);
    if (!result.success) {
      process.stderr.write(`Warning: Webhook failed: ${result.error}\n`);
    }
  }

  // Determine exit code using unfiltered diff
  const fullReport = diffSnapshots(before, after);
  const failThreshold = SEVERITY_ORDER[params.failOn];
  const hasFailure = fullReport.changes.some((c) => SEVERITY_ORDER[c.severity] >= failThreshold);

  if (hasFailure) {
    throw new CliExitError(1);
  }
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
    .argument("[before]", "Path to baseline snapshot file (not needed with --baseline)")
    .argument("[after]", "Path to updated snapshot file (not needed with --live)")
    .option("--live", "Diff baseline against a live server instead of a file")
    .option(
      "--baseline <dir>",
      "Diff all config servers against baselines in this directory (requires --config)",
    )
    .option("--severity <level>", "Minimum severity to display: safe | warning | breaking", "safe")
    .option("--fail-on <level>", "Exit code 1 threshold: safe | warning | breaking", "breaking")
    .option("--webhook <url>", "POST diff results to a webhook URL");

  addTransportOptions(cmd);

  cmd.action(
    handleErrors(
      async (
        beforePath: string | undefined,
        afterPath: string | undefined,
        options: Record<string, unknown>,
      ) => {
        const severity = parseSeverity(options["severity"] as string, "--severity");
        const failOn = parseSeverity(options["failOn"] as string, "--fail-on");
        const live = options["live"] === true;

        const parentOpts = cmd.parent?.opts() ?? {};
        const quiet = parentOpts["quiet"] === true;

        const baselineDir = options["baseline"] as string | undefined;
        if (baselineDir) {
          const configPath = options["config"] as string | undefined;
          if (!configPath) {
            throw new Error("--baseline requires --config");
          }
          if (beforePath) {
            throw new Error("--baseline cannot be combined with snapshot file arguments");
          }

          await executeCompositionDiff({
            configPath,
            baselineDir,
            minSeverity: severity,
            failOn,
            quiet,
            format: resolveFormat(parentOpts["format"] as string | undefined),
            noColor: parentOpts["color"] === false,
            outputPath: parentOpts["output"] as string | undefined,
          });
          return;
        }

        if (!beforePath) {
          throw new Error(
            "Two snapshot file paths are required (or use --baseline for a composition diff)",
          );
        }

        await runFileDiff({
          beforePath,
          afterPath,
          live,
          options,
          severity,
          failOn,
          quiet,
          format: resolveFormat(parentOpts["format"] as string | undefined),
          noColor: parentOpts["color"] === false,
          outputPath: parentOpts["output"] as string | undefined,
        });
      },
    ),
  );

  return cmd;
}
