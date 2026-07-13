/**
 * The watch-mode loop: re-capture and re-diff a live server on file changes.
 *
 * Shared by `check --watch` and the deprecated `watch` command.
 */

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
import { captureSnapshot } from "./commands/capture.js";
import type { ResolvedTransport } from "./commands/mcp-client.js";
import { readSnapshotFile } from "./utils.js";
import {
  clearScreen,
  formatWatchCycle,
  formatWatchError,
  formatWatchHeader,
} from "./watch-output.js";
import { sendWebhook } from "./webhook.js";

/** Parameters for running the watch loop. */
export interface WatchLoopParams {
  /** How to reach the MCP server. */
  transport: ResolvedTransport;
  /** Path to the baseline snapshot file. */
  baselinePath: string;
  /** Paths to watch for changes. */
  watchPaths: string[];
  /** Debounce interval in milliseconds. */
  debounceMs: number;
  /** Minimum severity to display. */
  minSeverity: Severity;
  /** Severity threshold for the breaking-changes warning. */
  failOn: Severity;
  /** Webhook URL to POST diffs to on each cycle, if any. */
  webhookUrl: string | undefined;
  /** Clear the screen between diff cycles. */
  shouldClear: boolean;
  /** Suppress non-essential output. */
  quiet: boolean;
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
 * Watches for file changes and re-diffs the live server against the baseline
 * on each change, until interrupted (SIGINT/SIGTERM).
 *
 * @param params - The fully resolved watch parameters.
 */
export async function runWatchLoop(params: WatchLoopParams): Promise<void> {
  const { transport, baselinePath, watchPaths, debounceMs, webhookUrl, shouldClear, quiet } =
    params;

  const config = createWatchConfig({
    debounceMs,
    watchPaths,
    minSeverity: params.minSeverity,
    failOn: params.failOn,
  });

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
}
