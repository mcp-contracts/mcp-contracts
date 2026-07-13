import type { Severity } from "@mcp-contracts/core";
import { Command } from "commander";
import type { LoadedProjectConfig } from "../project-config.js";
import {
  loadProjectConfig,
  resolveBaselinePath,
  resolveProjectPath,
  resolveTransportOrProject,
} from "../project-config.js";
import { addTransportOptions } from "../transport.js";
import { getRootOpts, handleErrors, parseSeverity } from "../utils.js";
import { runWatchLoop } from "../watch-loop.js";

/** Watch options resolved from CLI flags and the project config. */
interface ResolvedWatchOptions {
  severity: Severity;
  failOn: Severity;
  debounceMs: number;
  watchPaths: string[];
  baselinePath: string;
  webhookUrl: string | undefined;
  shouldClear: boolean;
}

/**
 * Resolves the watch command's options with flags > project config > defaults
 * precedence.
 *
 * @param options - The raw parsed options record from the command action.
 * @param project - The loaded project config, if any.
 * @returns The fully resolved watch options.
 */
export function resolveWatchOptions(
  options: Record<string, unknown>,
  project: LoadedProjectConfig | null,
): ResolvedWatchOptions {
  const severity = parseSeverity((options["severity"] as string) ?? "safe", "--severity");
  const failOn = parseSeverity(
    (options["failOn"] as string | undefined) ?? project?.config.failOn ?? "breaking",
    "--fail-on",
  );
  const debounceMs = Number.parseInt(
    (options["debounce"] as string | undefined) ?? String(project?.config.watch?.debounce ?? 500),
    10,
  );
  const projectWatchPaths = project?.config.watch?.paths?.map((p) =>
    resolveProjectPath(project, p),
  );
  const watchPaths = (options["watchPaths"] as string[] | undefined) ?? projectWatchPaths ?? ["."];
  const baselinePath = resolveBaselinePath(options["baseline"] as string | undefined, project);
  if (!baselinePath) {
    throw new Error('--baseline is required (or set "baseline" in mcpcontracts.json)');
  }
  const webhookUrl = options["webhook"] as string | undefined;
  const shouldClear =
    options["clear"] === true || (options["clear"] === undefined && process.stdout.isTTY);

  return { severity, failOn, debounceMs, watchPaths, baselinePath, webhookUrl, shouldClear };
}

/**
 * Creates the `watch` subcommand for the mcpdiff CLI.
 *
 * Watches for file changes and re-snapshots a live MCP server on each change,
 * diffing against a baseline for instant feedback during development.
 *
 * @returns A Commander Command instance for the watch subcommand.
 */
export function createWatchCommand(): Command {
  const cmd = new Command("watch").description(
    "Watch for file changes and re-diff against a baseline",
  );

  addTransportOptions(cmd);

  cmd
    .option("--baseline <path>", "Path to baseline snapshot")
    .option("--watch-paths <paths...>", 'Paths to watch for changes (default: ".")')
    .option("--debounce <ms>", "Debounce interval in milliseconds (default: 500)")
    .option("--severity <level>", "Minimum severity to display", "safe")
    .option("--fail-on <level>", 'Severity threshold (default: "breaking")')
    .option("--webhook <url>", "POST diffs on each cycle")
    .option("--clear", "Clear screen between diffs")
    .action(
      handleErrors(async (options: Record<string, unknown>) => {
        const rootOpts = getRootOpts(cmd);
        const quiet = rootOpts["quiet"] === true;
        const project = loadProjectConfig(rootOpts["project"] as string | undefined);

        const { severity, failOn, debounceMs, watchPaths, baselinePath, webhookUrl, shouldClear } =
          resolveWatchOptions(options, project);

        const transport = resolveTransportOrProject(options, project);

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
      }),
    );

  return cmd;
}
