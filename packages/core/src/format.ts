import type { DiffReport, SchemaChange, Severity } from "./diff-types.js";

/** ANSI color codes for terminal output. */
const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
} as const;

/** Severity icons for terminal and markdown output. */
const SEVERITY_ICONS: Record<Severity, string> = {
  breaking: "\u{1F534}",
  warning: "\u{1F7E1}",
  safe: "\u{1F7E2}",
};

/** Severity labels for terminal display. */
const SEVERITY_COLORS: Record<Severity, string> = {
  breaking: ANSI.red,
  warning: ANSI.yellow,
  safe: ANSI.green,
};

/**
 * Formats a diff report as pretty-printed JSON.
 *
 * @param report - The diff report to format.
 * @returns Pretty-printed JSON string.
 */
export function formatJson(report: DiffReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Creates a simple inline diff of two strings, showing removed and added text.
 *
 * @param before - The old string.
 * @param after - The new string.
 * @returns A formatted diff string.
 */
function inlineDiff(before: string, after: string): string {
  return `- ${before}\n+ ${after}`;
}

/**
 * Formats a single change for terminal output.
 *
 * @param change - The schema change to format.
 * @returns Formatted terminal string for this change.
 */
function formatChangeTerminal(change: SchemaChange): string {
  const icon = SEVERITY_ICONS[change.severity];
  const color = SEVERITY_COLORS[change.severity];
  const severity = `${color}${change.severity}${ANSI.reset}`;
  const lines = [`  ${icon} ${severity}  ${ANSI.bold}${change.message}${ANSI.reset}`];

  if (change.path) {
    lines.push(`    ${ANSI.dim}path: ${change.path}${ANSI.reset}`);
  }

  if (typeof change.before === "string" && typeof change.after === "string") {
    const diff = inlineDiff(change.before, change.after);
    for (const line of diff.split("\n")) {
      const lineColor = line.startsWith("-") ? ANSI.red : ANSI.green;
      lines.push(`    ${lineColor}${line}${ANSI.reset}`);
    }
  }

  return lines.join("\n");
}

/**
 * Formats a diff report for terminal display with colors and severity icons.
 *
 * @param report - The diff report to format.
 * @returns A colored terminal string.
 */
export function formatTerminal(report: DiffReport): string {
  const lines: string[] = [];

  // Header
  lines.push(`${ANSI.bold}MCP Contract Diff${ANSI.reset}`);
  lines.push(
    `${ANSI.dim}${report.meta.before.serverName}@${report.meta.before.serverVersion} → ${report.meta.after.serverName}@${report.meta.after.serverVersion}${ANSI.reset}`,
  );
  lines.push("");

  if (report.changes.length === 0) {
    lines.push(`${ANSI.green}No changes detected.${ANSI.reset}`);
    return lines.join("\n");
  }

  // Summary
  const parts: string[] = [];
  if (report.summary.breaking > 0) {
    parts.push(`${ANSI.red}${report.summary.breaking} breaking${ANSI.reset}`);
  }
  if (report.summary.warning > 0) {
    parts.push(`${ANSI.yellow}${report.summary.warning} warning${ANSI.reset}`);
  }
  if (report.summary.safe > 0) {
    parts.push(`${ANSI.green}${report.summary.safe} safe${ANSI.reset}`);
  }
  lines.push(`${ANSI.bold}${report.summary.total} changes:${ANSI.reset} ${parts.join(", ")}`);
  lines.push("");

  // Changes grouped by category
  const categories = ["tool", "resource", "prompt"] as const;
  for (const category of categories) {
    const categoryChanges = report.changes.filter((c) => c.category === category);
    if (categoryChanges.length === 0) continue;

    lines.push(
      `${ANSI.bold}${ANSI.cyan}${category.charAt(0).toUpperCase() + category.slice(1)}s${ANSI.reset}`,
    );
    for (const change of categoryChanges) {
      lines.push(formatChangeTerminal(change));
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Formats a single change for markdown output.
 *
 * @param change - The schema change to format.
 * @returns Markdown string for this change.
 */
function formatChangeMarkdown(change: SchemaChange): string {
  const icon = SEVERITY_ICONS[change.severity];
  const lines = [`- ${icon} **${change.severity}** — ${change.message}`];

  if (typeof change.before === "string" && typeof change.after === "string") {
    lines.push("  ```diff");
    lines.push(`  - ${change.before}`);
    lines.push(`  + ${change.after}`);
    lines.push("  ```");
  }

  return lines.join("\n");
}

/**
 * Formats a diff report as markdown suitable for GitHub PR comments.
 *
 * @param report - The diff report to format.
 * @returns Markdown string.
 */
export function formatMarkdown(report: DiffReport): string {
  const lines: string[] = [];

  // Header
  lines.push("## MCP Contract Diff");
  lines.push("");
  lines.push(
    `**${report.meta.before.serverName}** \`${report.meta.before.serverVersion}\` → \`${report.meta.after.serverVersion}\``,
  );
  lines.push("");

  if (report.changes.length === 0) {
    lines.push("No changes detected. :white_check_mark:");
    return lines.join("\n");
  }

  // Summary
  const summaryParts: string[] = [];
  if (report.summary.breaking > 0) {
    summaryParts.push(`${report.summary.breaking} breaking`);
  }
  if (report.summary.warning > 0) {
    summaryParts.push(`${report.summary.warning} warning`);
  }
  if (report.summary.safe > 0) {
    summaryParts.push(`${report.summary.safe} safe`);
  }
  lines.push(`**${report.summary.total} changes:** ${summaryParts.join(", ")}`);
  lines.push("");

  // Changes grouped by category
  const categories = ["tool", "resource", "prompt"] as const;
  for (const category of categories) {
    const categoryChanges = report.changes.filter((c) => c.category === category);
    if (categoryChanges.length === 0) continue;

    lines.push(`### ${category.charAt(0).toUpperCase() + category.slice(1)}s`);
    lines.push("");
    for (const change of categoryChanges) {
      lines.push(formatChangeMarkdown(change));
    }
    lines.push("");
  }

  return lines.join("\n");
}
