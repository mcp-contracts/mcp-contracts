import { appendFileSync } from "node:fs";
import type { Severity, SnapshotCapture, SnapshotServer } from "@mcp-contracts/core";
import {
  createSnapshot,
  diffSnapshots,
  formatJson,
  formatMarkdown,
  formatTerminal,
  SEVERITY_ORDER,
} from "@mcp-contracts/core";
import { Command } from "commander";
import { detectCIEnvironment } from "../ci-env.js";
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
import { captureServerData, connectToServer } from "./mcp-client.js";

const VALID_SEVERITIES = new Set<string>(["safe", "warning", "breaking"]);

/**
 * Validates a severity level string.
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
    .requiredOption("--baseline <path>", "Path to baseline snapshot (required)")
    .option("--fail-on <level>", "Severity threshold for exit code 1", "breaking")
    .option("--severity <level>", "Minimum severity to display", "safe")
    .action(
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestration function
      handleErrors(async (options: Record<string, unknown>) => {
        const rootOpts = getRootOpts(cmd);
        const quiet = rootOpts["quiet"] === true;
        const noColor = rootOpts["color"] === false;
        const outputPath = rootOpts["output"] as string | undefined;
        const explicitFormat = rootOpts["format"] as string | undefined;

        const severity = parseSeverity(options["severity"] as string, "--severity");
        const failOn = parseSeverity(options["failOn"] as string, "--fail-on");

        // Read baseline
        const baseline = readSnapshotFile(options["baseline"] as string);

        // Resolve transport and connect
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

        if (!quiet) {
          process.stderr.write("Connecting to MCP server...\n");
        }

        const { client, transport, protocolVersion } = await connectToServer(config);

        const serverVersion = client.getServerVersion();
        const serverCapabilities = client.getServerCapabilities() ?? {};

        if (!quiet && serverVersion) {
          process.stderr.write(`Connected to ${serverVersion.name} v${serverVersion.version}\n`);
        }

        const data = await captureServerData(client);
        await transport.close();

        // Create current snapshot
        const server: SnapshotServer = {
          name: serverVersion?.name ?? "unknown",
          version: serverVersion?.version ?? "unknown",
          protocolVersion,
          capabilities: serverCapabilities as Record<string, unknown>,
        };

        const source =
          config.transport === "stdio"
            ? [config.command, ...(config.args ?? [])].join(" ")
            : config.url;

        const capture: SnapshotCapture = {
          transport: config.transport,
          source,
          tool: "mcpdiff/0.1.0",
        };

        const current = createSnapshot({
          server,
          tools: data.tools,
          resources: data.resources,
          resourceTemplates: data.resourceTemplates,
          prompts: data.prompts,
          capture,
        });

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
