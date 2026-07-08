/**
 * Composition diff report formatters.
 *
 * Renders a CompositionDiffReport as terminal, markdown, or JSON output.
 */

import type { CompositionDiffReport, ServerDiffEntry } from "./composition-types.js";
import { ANSI, formatChangeMarkdown, formatChangeTerminal } from "./format.js";

/**
 * Builds the aggregated one-line change summary (e.g., "1 breaking, 2 safe").
 *
 * @param report - The composition diff report.
 * @returns A comma-separated summary, or "no changes" when empty.
 */
function changeSummary(report: CompositionDiffReport): string {
  const parts: string[] = [];
  if (report.summary.breaking > 0) parts.push(`${report.summary.breaking} breaking`);
  if (report.summary.warning > 0) parts.push(`${report.summary.warning} warning`);
  if (report.summary.safe > 0) parts.push(`${report.summary.safe} safe`);
  return parts.length > 0 ? parts.join(", ") : "no changes";
}

/**
 * Builds the status line for one server entry, without colors.
 *
 * @param entry - The per-server diff entry.
 * @returns A short status string.
 */
function serverStatusLine(entry: ServerDiffEntry): string {
  if (entry.status === "missing-baseline") {
    return "no baseline found";
  }
  if (entry.status === "missing-server") {
    return "baseline exists but server is not in the composition";
  }
  const summary = entry.report?.summary;
  if (!summary || summary.total === 0) {
    return "no changes";
  }
  const parts: string[] = [];
  if (summary.breaking > 0) parts.push(`${summary.breaking} breaking`);
  if (summary.warning > 0) parts.push(`${summary.warning} warning`);
  if (summary.safe > 0) parts.push(`${summary.safe} safe`);
  return parts.join(", ");
}

/**
 * Builds actionable hints for missing-baseline / missing-server entries.
 *
 * A missing baseline usually means a newly added server; a missing server
 * usually means a removed — or renamed — config entry. Renaming a server key
 * in mcp.json produces one of each, so the rename hint covers that case.
 *
 * @param report - The composition diff report.
 * @returns Hint lines, empty when every server was diffed.
 */
function buildHints(report: CompositionDiffReport): string[] {
  const hints: string[] = [];
  if (report.summary.missingBaselines > 0) {
    hints.push(
      "Servers without a baseline: run `mcpdiff snapshot --config <config> --all` to capture one.",
    );
  }
  if (report.summary.missingServers > 0) {
    hints.push(
      "Baselines without a server: if the server was renamed in the config, rename its baseline file to match; if it was removed intentionally, delete the baseline file.",
    );
  }
  return hints;
}

/**
 * Formats a composition diff report as pretty-printed JSON.
 *
 * @param report - The composition diff report.
 * @returns Pretty-printed JSON string.
 */
export function formatCompositionJson(report: CompositionDiffReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Formats a composition diff report for terminal display.
 *
 * @param report - The composition diff report.
 * @returns A colored terminal string.
 */
export function formatCompositionTerminal(report: CompositionDiffReport): string {
  const lines: string[] = [];
  lines.push(`${ANSI.bold}MCP Composition Diff${ANSI.reset}`);
  lines.push(
    `${ANSI.dim}${report.summary.servers} servers: ${report.summary.diffed} diffed, ` +
      `${report.summary.missingBaselines} missing baseline, ${report.summary.missingServers} missing server${ANSI.reset}`,
  );
  lines.push("");

  for (const entry of report.servers) {
    const hasBreaking = (entry.report?.summary.breaking ?? 0) > 0;
    const clean = entry.status === "diffed" && entry.report?.summary.total === 0;
    const icon = clean
      ? `${ANSI.green}✓${ANSI.reset}`
      : hasBreaking
        ? `${ANSI.red}✗${ANSI.reset}`
        : `${ANSI.yellow}!${ANSI.reset}`;
    lines.push(`${icon} ${ANSI.bold}${entry.serverName}${ANSI.reset} — ${serverStatusLine(entry)}`);

    for (const change of entry.report?.changes ?? []) {
      lines.push(formatChangeTerminal(change));
    }
  }

  const hints = buildHints(report);
  if (hints.length > 0) {
    lines.push("");
    for (const hint of hints) {
      lines.push(`${ANSI.dim}Hint: ${hint}${ANSI.reset}`);
    }
  }

  lines.push("");
  lines.push(
    `${ANSI.bold}Summary:${ANSI.reset} ${changeSummary(report)} across ${report.summary.servers} servers`,
  );
  return lines.join("\n");
}

/**
 * Formats a composition diff report as markdown suitable for PR comments.
 *
 * @param report - The composition diff report.
 * @returns Markdown string.
 */
export function formatCompositionMarkdown(report: CompositionDiffReport): string {
  const lines: string[] = [];
  lines.push("## MCP Composition Diff");
  lines.push("");
  lines.push(
    `**${report.summary.servers} servers:** ${report.summary.diffed} diffed, ` +
      `${report.summary.missingBaselines} missing baseline, ${report.summary.missingServers} missing server`,
  );
  lines.push("");
  lines.push(`**Changes:** ${changeSummary(report)}`);
  lines.push("");

  for (const entry of report.servers) {
    const clean = entry.status === "diffed" && entry.report?.summary.total === 0;
    const marker = clean
      ? ":white_check_mark:"
      : (entry.report?.summary.breaking ?? 0) > 0
        ? ":x:"
        : ":warning:";
    lines.push(`### ${entry.serverName} ${marker}`);
    lines.push("");
    lines.push(serverStatusLine(entry));
    lines.push("");
    for (const change of entry.report?.changes ?? []) {
      lines.push(formatChangeMarkdown(change));
    }
    if ((entry.report?.changes.length ?? 0) > 0) {
      lines.push("");
    }
  }

  const hints = buildHints(report);
  if (hints.length > 0) {
    for (const hint of hints) {
      lines.push(`> **Hint:** ${hint}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
