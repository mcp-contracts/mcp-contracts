import type { DiffReport, WatchDiffEvent } from "@mcp-contracts/core";

/** ANSI escape to clear screen and move cursor to top-left. */
const CLEAR_SCREEN = "\x1b[2J\x1b[H";

/**
 * Formats the watch mode header shown at startup.
 *
 * @param baselinePath - Path to the baseline file.
 * @param watchPaths - Paths being watched.
 * @param debounceMs - Debounce interval.
 * @returns Formatted header string.
 */
export function formatWatchHeader(
  baselinePath: string,
  watchPaths: string[],
  debounceMs: number,
): string {
  const lines = [
    "mcpdiff watch mode",
    `  Baseline: ${baselinePath}`,
    `  Watching: ${watchPaths.join(", ")}`,
    `  Debounce: ${debounceMs}ms`,
    "",
    "Waiting for file changes...",
    "",
  ];
  return lines.join("\n");
}

/**
 * Formats the output for a completed watch cycle.
 *
 * @param event - The watch diff event.
 * @param formatReport - Function to format the diff report as a string.
 * @returns Formatted cycle output string.
 */
export function formatWatchCycle(
  event: WatchDiffEvent,
  formatReport: (report: DiffReport) => string,
): string {
  const lines: string[] = [];
  const time = new Date(event.timestamp).toLocaleTimeString();

  lines.push(`[${time}] Cycle ${event.cycle} (${event.durationMs}ms)`);

  if (event.triggerPaths.length > 0) {
    const displayed = event.triggerPaths.slice(0, 5);
    lines.push(
      `  Changed: ${displayed.join(", ")}${event.triggerPaths.length > 5 ? ` (+${event.triggerPaths.length - 5} more)` : ""}`,
    );
  }

  if (event.report) {
    const { breaking, warning, safe, total } = event.report.summary;
    if (total === 0) {
      lines.push("  No changes detected");
    } else {
      lines.push(
        `  Changes: ${total} total (${breaking} breaking, ${warning} warning, ${safe} safe)`,
      );
      lines.push("");
      lines.push(formatReport(event.report));
    }
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Formats an error that occurred during a watch cycle.
 *
 * @param event - The watch diff event containing the error.
 * @returns Formatted error string.
 */
export function formatWatchError(event: WatchDiffEvent): string {
  const time = new Date(event.timestamp).toLocaleTimeString();
  return `[${time}] Cycle ${event.cycle} ERROR: ${event.error}\n`;
}

/**
 * Returns the ANSI clear-screen sequence.
 *
 * @returns Clear screen escape sequence.
 */
export function clearScreen(): string {
  return CLEAR_SCREEN;
}
