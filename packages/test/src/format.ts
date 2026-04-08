/**
 * Test result formatters for terminal, JSON, and markdown output.
 */

import type { TestReport, TestResult, TestStatus } from "./types.js";

/** ANSI color codes for terminal output. */
const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
} as const;

/** Status icons for terminal and markdown output. */
const STATUS_ICONS: Record<TestStatus, string> = {
  pass: "\u{2705}",
  fail: "\u{274C}",
  skip: "\u{23ED}\u{FE0F}",
  error: "\u{1F4A5}",
};

/** Status labels for terminal display. */
const STATUS_LABELS: Record<TestStatus, string> = {
  pass: `${ANSI.green}PASS${ANSI.reset}`,
  fail: `${ANSI.red}FAIL${ANSI.reset}`,
  skip: `${ANSI.dim}SKIP${ANSI.reset}`,
  error: `${ANSI.red}ERROR${ANSI.reset}`,
};

/**
 * Formats a single test result for terminal output.
 *
 * @param result - The test result to format.
 * @returns Formatted terminal string.
 */
function formatResultTerminal(result: TestResult): string {
  const label = STATUS_LABELS[result.status];
  const lines = [`  ${label}  ${result.description}`];

  if (result.message) {
    lines.push(`        ${ANSI.dim}${result.message}${ANSI.reset}`);
  }

  if (result.path) {
    lines.push(`        ${ANSI.dim}path: ${result.path}${ANSI.reset}`);
  }

  if (result.expected !== undefined && result.actual !== undefined) {
    lines.push(`        ${ANSI.dim}expected: ${JSON.stringify(result.expected)}${ANSI.reset}`);
    lines.push(`        ${ANSI.dim}actual:   ${JSON.stringify(result.actual)}${ANSI.reset}`);
  }

  return lines.join("\n");
}

/**
 * Formats a test report as pretty-printed JSON.
 *
 * @param report - The test report to format.
 * @returns Pretty-printed JSON string.
 */
export function formatTestJson(report: TestReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Formats a test report for terminal display with colors and status icons.
 *
 * @param report - The test report to format.
 * @returns A colored terminal string.
 */
export function formatTestTerminal(report: TestReport): string {
  const lines: string[] = [];

  // Header
  lines.push(`${ANSI.bold}MCP Contract Test Report${ANSI.reset}`);
  lines.push(`${ANSI.dim}${report.meta.serverName}@${report.meta.serverVersion}${ANSI.reset}`);
  lines.push("");

  // Summary line
  const { summary } = report;
  const parts: string[] = [];
  if (summary.passed > 0) parts.push(`${ANSI.green}${summary.passed} passed${ANSI.reset}`);
  if (summary.failed > 0) parts.push(`${ANSI.red}${summary.failed} failed${ANSI.reset}`);
  if (summary.errors > 0) parts.push(`${ANSI.red}${summary.errors} errors${ANSI.reset}`);
  if (summary.skipped > 0) parts.push(`${ANSI.dim}${summary.skipped} skipped${ANSI.reset}`);
  const duration = (summary.durationMs / 1000).toFixed(1);
  lines.push(`${ANSI.bold}${summary.total} tests:${ANSI.reset} ${parts.join(", ")} (${duration}s)`);
  lines.push("");

  // Results grouped by category
  const categories = ["conformance", "boundary", "assertion"] as const;
  for (const category of categories) {
    const categoryResults = report.results.filter((r) => r.category === category);
    if (categoryResults.length === 0) continue;

    const label = category.charAt(0).toUpperCase() + category.slice(1);
    lines.push(`${ANSI.bold}${ANSI.cyan}${label}${ANSI.reset}`);
    for (const result of categoryResults) {
      lines.push(formatResultTerminal(result));
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Formats a single test result for markdown output.
 *
 * @param result - The test result to format.
 * @returns Markdown string for this result.
 */
function formatResultMarkdown(result: TestResult): string {
  const icon = STATUS_ICONS[result.status];
  const status = result.status.toUpperCase();
  const lines = [`- ${icon} **${status}** ${result.description}`];

  if (result.message) {
    lines.push(`  > ${result.message}`);
  }

  return lines.join("\n");
}

/**
 * Formats a test report as markdown suitable for GitHub PR comments.
 *
 * @param report - The test report to format.
 * @returns Markdown string.
 */
export function formatTestMarkdown(report: TestReport): string {
  const lines: string[] = [];

  // Header
  lines.push("## MCP Contract Test Report");
  lines.push("");
  lines.push(`**${report.meta.serverName}** \`${report.meta.serverVersion}\``);
  lines.push("");

  // Summary
  const { summary } = report;
  const duration = (summary.durationMs / 1000).toFixed(1);
  const summaryParts: string[] = [];
  if (summary.passed > 0) summaryParts.push(`${summary.passed} passed`);
  if (summary.failed > 0) summaryParts.push(`${summary.failed} failed`);
  if (summary.errors > 0) summaryParts.push(`${summary.errors} errors`);
  if (summary.skipped > 0) summaryParts.push(`${summary.skipped} skipped`);
  lines.push(`**${summary.total} tests:** ${summaryParts.join(", ")} (${duration}s)`);
  lines.push("");

  if (report.results.length === 0) {
    lines.push("No tests were run.");
    return lines.join("\n");
  }

  // Results grouped by category
  const categories = ["conformance", "boundary", "assertion"] as const;
  for (const category of categories) {
    const categoryResults = report.results.filter((r) => r.category === category);
    if (categoryResults.length === 0) continue;

    const label = category.charAt(0).toUpperCase() + category.slice(1);
    lines.push(`### ${label}`);
    lines.push("");
    for (const result of categoryResults) {
      lines.push(formatResultMarkdown(result));
    }
    lines.push("");
  }

  return lines.join("\n");
}
