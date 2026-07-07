/**
 * Composition diff mode for the `diff` command.
 *
 * Diffs every server in an mcp.json composition against its baseline
 * snapshot in a contracts directory, producing one unified report.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { CompositionDiffReport, ServerSnapshotEntry, Severity } from "@mcp-contracts/core";
import {
  diffComposition,
  formatCompositionJson,
  formatCompositionMarkdown,
  formatCompositionTerminal,
  SEVERITY_ORDER,
} from "@mcp-contracts/core";
import { listConfigServers } from "../mcp-config.js";
import type { OutputFormat } from "../utils.js";
import { CliExitError, readSnapshotFile, stripAnsi, writeOutput } from "../utils.js";
import { captureAllServers } from "./capture-all.js";
import { snapshotFileName } from "./snapshot.js";

/** Options for running a composition diff. */
export interface CompositionDiffOptions {
  /** Path to the mcp.json config file. */
  configPath: string;
  /** Directory containing baseline .mcpc.json files. */
  baselineDir: string;
  /** Minimum severity to include in the displayed report. */
  minSeverity: Severity;
  /** Suppress non-essential output. */
  quiet: boolean;
}

/** Options for executing the full composition diff command flow. */
export interface ExecuteCompositionDiffOptions extends CompositionDiffOptions {
  /** Exit code 1 threshold. */
  failOn: Severity;
  /** Output format for the report. */
  format: OutputFormat;
  /** Strip ANSI colors from terminal output. */
  noColor: boolean;
  /** File path to write the report to, or undefined for stdout. */
  outputPath: string | undefined;
}

/** Result of running a composition diff. */
export interface CompositionDiffResult {
  /** The unfiltered report (used for exit code decisions). */
  report: CompositionDiffReport;
  /** The severity-filtered report (used for display). */
  filteredReport: CompositionDiffReport;
  /** Servers that could not be captured. */
  captureFailures: Array<{ serverName: string; error: string }>;
}

/**
 * Reads all baseline snapshots from a contracts directory.
 *
 * Each `<name>.mcpc.json` file becomes an entry named by its file stem,
 * which is how `snapshot --all` writes them.
 *
 * @param baselineDir - Directory containing .mcpc.json files.
 * @returns The baseline entries.
 */
export function readBaselineDir(baselineDir: string): ServerSnapshotEntry[] {
  let files: string[];
  try {
    files = readdirSync(baselineDir);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read baseline directory "${baselineDir}": ${message}`);
  }

  return files
    .filter((f) => f.endsWith(".mcpc.json"))
    .map((f) => ({
      serverName: f.slice(0, -".mcpc.json".length),
      snapshot: readSnapshotFile(join(baselineDir, f)),
    }));
}

/**
 * Renames baseline entries to their matching config server names.
 *
 * Baselines are named by file stem, which is the sanitized config key
 * (see snapshotFileName). This maps stems back to the actual config keys
 * so diffComposition can match servers to baselines.
 *
 * @param baselines - Baseline entries named by file stem.
 * @param serverNames - The config's server names.
 * @returns Baseline entries renamed to config keys where a match exists.
 */
export function matchBaselineNames(
  baselines: ServerSnapshotEntry[],
  serverNames: string[],
): ServerSnapshotEntry[] {
  const stemToConfigName = new Map(
    serverNames.map((name) => [snapshotFileName(name), name] as const),
  );
  return baselines.map((b) => {
    const configName = stemToConfigName.get(`${b.serverName}.mcpc.json`);
    return configName ? { ...b, serverName: configName } : b;
  });
}

/**
 * Captures the composition and diffs it against the baseline directory.
 *
 * @param options - Config path, baseline directory, severity filter, and quiet flag.
 * @returns The full and filtered reports plus any capture failures.
 */
export async function runCompositionDiff(
  options: CompositionDiffOptions,
): Promise<CompositionDiffResult> {
  const servers = listConfigServers(options.configPath);
  const baselines = matchBaselineNames(
    readBaselineDir(options.baselineDir),
    servers.map((s) => s.name),
  );

  const { entries, failures } = await captureAllServers(servers, options.quiet);

  const report = diffComposition(baselines, entries);
  const filteredReport = diffComposition(baselines, entries, {
    minSeverity: options.minSeverity,
  });

  return { report, filteredReport, captureFailures: failures };
}

/**
 * Formats a composition diff report in the requested output format.
 *
 * @param report - The composition diff report.
 * @param format - The output format.
 * @returns The formatted report string.
 */
export function formatCompositionReport(
  report: CompositionDiffReport,
  format: OutputFormat,
): string {
  if (format === "json") {
    return formatCompositionJson(report);
  }
  if (format === "markdown") {
    return formatCompositionMarkdown(report);
  }
  return formatCompositionTerminal(report);
}

/**
 * Decides whether a composition diff should fail CI.
 *
 * A composition fails when any per-server change meets the fail-on
 * threshold, when a baseline's server is missing from the composition
 * (treated as breaking), or — at warning level or below — when a server
 * has no baseline.
 *
 * @param report - The unfiltered composition diff report.
 * @param failOn - The severity threshold.
 * @returns True when the composition should fail.
 */
export function compositionHasFailure(report: CompositionDiffReport, failOn: Severity): boolean {
  const threshold = SEVERITY_ORDER[failOn];

  if (report.summary.missingServers > 0) {
    return true;
  }
  if (report.summary.missingBaselines > 0 && threshold <= SEVERITY_ORDER.warning) {
    return true;
  }
  return report.servers.some((s) =>
    (s.report?.changes ?? []).some((c) => SEVERITY_ORDER[c.severity] >= threshold),
  );
}

/**
 * Runs the full composition diff command flow: capture, diff, output, exit.
 *
 * Writes the formatted report, then throws a plain Error (exit code 2) when
 * any server failed to capture, or CliExitError(1) when the composition
 * fails the --fail-on threshold.
 *
 * @param options - Full command options including output and threshold settings.
 */
export async function executeCompositionDiff(
  options: ExecuteCompositionDiffOptions,
): Promise<void> {
  const { report, filteredReport, captureFailures } = await runCompositionDiff(options);

  let output = formatCompositionReport(filteredReport, options.format);
  if (options.noColor && options.format === "terminal") {
    output = stripAnsi(output);
  }
  writeOutput(`${output}\n`, options.outputPath);

  if (captureFailures.length > 0) {
    const failed = captureFailures.map((f) => `${f.serverName} (${f.error})`).join(", ");
    throw new Error(`Failed to capture ${captureFailures.length} server(s): ${failed}`);
  }
  if (compositionHasFailure(report, options.failOn)) {
    throw new CliExitError(1);
  }
}
