import { watch } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  DiffReport,
  MCPContractSnapshot,
  Severity,
  WatchConfig,
  WatchDiffEvent,
} from "@mcp-contracts/core";
import {
  createWatchConfig,
  createWebhookPayload,
  DEFAULT_WATCH_IGNORE_PATTERNS,
  diffSnapshots,
  formatTerminal,
  SEVERITY_ORDER,
} from "@mcp-contracts/core";
import { Command } from "commander";
import type { TransportOptions } from "../transport.js";
import { addTransportOptions, resolveTransport } from "../transport.js";
import { handleErrors, readSnapshotFile } from "../utils.js";
import {
  clearScreen,
  formatWatchCycle,
  formatWatchError,
  formatWatchHeader,
} from "../watch-output.js";
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
 * Checks if a file path matches any of the ignore patterns.
 *
 * @param filePath - The file path to check.
 * @param patterns - Glob-like patterns to match against.
 * @returns True if the path should be ignored.
 */
function shouldIgnore(filePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // Simple glob matching: convert ** and * to regex
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "{{GLOBSTAR}}")
      .replace(/\*/g, "[^/]*")
      .replace(/\{\{GLOBSTAR\}\}/g, ".*");
    const regex = new RegExp(escaped);
    if (regex.test(filePath)) {
      return true;
    }
  }
  return false;
}

/**
 * Sends a webhook notification for a diff report if configured.
 *
 * @param webhookUrl - The URL to POST to, or undefined to skip.
 * @param report - The diff report to send.
 * @param baselinePath - Path to the baseline snapshot file.
 */
async function maybeSendWebhook(
  webhookUrl: string | undefined,
  report: DiffReport,
  baselinePath: string,
): Promise<void> {
  if (!webhookUrl) return;
  const payload = createWebhookPayload(report, {
    trigger: "watch",
    baselinePath,
  });
  const result = await sendWebhook(webhookUrl, payload);
  if (!result.success) {
    process.stderr.write(`Warning: Webhook failed: ${result.error}\n`);
  }
}

/**
 * Checks if a diff report contains changes above the fail threshold and warns.
 *
 * @param baseline - The baseline snapshot.
 * @param current - The current snapshot.
 * @param config - Watch configuration.
 * @param quiet - Whether to suppress output.
 */
function checkFailThreshold(
  baseline: MCPContractSnapshot,
  current: MCPContractSnapshot,
  config: WatchConfig,
  quiet: boolean,
): void {
  const fullReport = diffSnapshots(baseline, current);
  const failThreshold = SEVERITY_ORDER[config.failOn];
  const hasFailure = fullReport.changes.some((c) => SEVERITY_ORDER[c.severity] >= failThreshold);
  if (hasFailure && !quiet) {
    process.stderr.write("Breaking changes detected!\n");
  }
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
    .requiredOption("--baseline <path>", "Path to baseline snapshot")
    .option("--watch-paths <paths...>", "Paths to watch for changes", ["."])
    .option("--debounce <ms>", "Debounce interval in milliseconds", "500")
    .option("--severity <level>", "Minimum severity to display", "safe")
    .option("--fail-on <level>", "Severity threshold", "breaking")
    .option("--webhook <url>", "POST diffs on each cycle")
    .option("--clear", "Clear screen between diffs")
    .action(
      handleErrors(async (options: Record<string, unknown>) => {
        const parentOpts = cmd.parent?.opts() ?? {};
        const quiet = parentOpts["quiet"] === true;

        const severity = parseSeverity((options["severity"] as string) ?? "safe", "--severity");
        const failOn = parseSeverity((options["failOn"] as string) ?? "breaking", "--fail-on");
        const debounceMs = Number.parseInt(options["debounce"] as string, 10);
        const watchPaths = options["watchPaths"] as string[];
        const baselinePath = options["baseline"] as string;
        const webhookUrl = options["webhook"] as string | undefined;
        const shouldClear =
          options["clear"] === true || (options["clear"] === undefined && process.stdout.isTTY);

        const config = createWatchConfig({
          debounceMs,
          watchPaths,
          minSeverity: severity,
          failOn,
        });

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
        const transport = resolveTransport(transportOpts);

        // Print header
        process.stderr.write(formatWatchHeader(baselinePath, watchPaths, debounceMs));

        // Set up abort controller for graceful shutdown
        const ac = new AbortController();

        const shutdown = () => {
          process.stderr.write("\nShutting down watch mode...\n");
          ac.abort();
        };
        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);

        let cycle = 0;
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        let pendingPaths: string[] = [];

        /**
         * Runs a single diff cycle.
         *
         * @param triggerPaths - File paths that triggered this cycle.
         */
        async function runCycle(triggerPaths: string[]): Promise<void> {
          cycle++;
          const start = Date.now();

          let event: WatchDiffEvent;

          try {
            const baseline = readSnapshotFile(baselinePath);
            const { snapshot: current } = await captureSnapshot({ transport, quiet: true });
            const report = diffSnapshots(baseline, current, { minSeverity: config.minSeverity });

            event = {
              cycle,
              timestamp: new Date().toISOString(),
              report,
              triggerPaths,
              durationMs: Date.now() - start,
            };

            if (shouldClear) {
              process.stdout.write(clearScreen());
            }

            process.stdout.write(formatWatchCycle(event, formatTerminal));

            await maybeSendWebhook(webhookUrl, report, baselinePath);
            checkFailThreshold(baseline, current, config, quiet);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            event = {
              cycle,
              timestamp: new Date().toISOString(),
              triggerPaths,
              durationMs: Date.now() - start,
              error: message,
            };
            process.stderr.write(formatWatchError(event));
          }
        }

        // Start watching
        const resolvedPaths = watchPaths.map((p) => resolve(p));
        const watchers = resolvedPaths.map((p) => watch(p, { recursive: true, signal: ac.signal }));

        try {
          // Use Promise.race of all watchers to handle events
          const watcherPromises = watchers.map(async (watcher) => {
            for await (const event of watcher) {
              if (ac.signal.aborted) break;
              const filename = event.filename ?? "";
              if (shouldIgnore(filename, [...DEFAULT_WATCH_IGNORE_PATTERNS])) {
                continue;
              }
              pendingPaths.push(filename);

              if (debounceTimer) {
                clearTimeout(debounceTimer);
              }
              debounceTimer = setTimeout(() => {
                const paths = [...pendingPaths];
                pendingPaths = [];
                runCycle(paths);
              }, config.debounceMs);
            }
          });

          await Promise.all(watcherPromises);
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            // Expected on shutdown
          } else {
            throw err;
          }
        } finally {
          process.removeListener("SIGINT", shutdown);
          process.removeListener("SIGTERM", shutdown);
          if (debounceTimer) {
            clearTimeout(debounceTimer);
          }
        }
      }),
    );

  return cmd;
}
