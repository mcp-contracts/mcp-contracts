/**
 * Collision report formatters.
 *
 * Renders a CollisionReport as terminal, markdown, or JSON output.
 */

import type { CollisionReport, ToolCollision } from "./composition-types.js";
import { ANSI } from "./format.js";

/** Icons per collision kind, matching diff severity icons. */
const KIND_ICONS: Record<ToolCollision["kind"], string> = {
  conflicting: "\u{1F534}",
  exact: "\u{1F7E1}",
};

/**
 * Builds the one-line collision summary (e.g., "1 conflicting, 2 exact").
 *
 * @param report - The collision report.
 * @returns A comma-separated summary string.
 */
function collisionSummary(report: CollisionReport): string {
  const parts: string[] = [];
  if (report.summary.conflicting > 0) parts.push(`${report.summary.conflicting} conflicting`);
  if (report.summary.exact > 0) parts.push(`${report.summary.exact} exact`);
  return parts.join(", ");
}

/**
 * Formats a collision report as pretty-printed JSON.
 *
 * @param report - The collision report.
 * @returns Pretty-printed JSON string.
 */
export function formatCollisionsJson(report: CollisionReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Formats a collision report for terminal display.
 *
 * @param report - The collision report.
 * @returns A colored terminal string.
 */
export function formatCollisionsTerminal(report: CollisionReport): string {
  const lines: string[] = [];
  lines.push(`${ANSI.bold}MCP Tool Collision Check${ANSI.reset}`);
  lines.push(
    `${ANSI.dim}${report.serversScanned} servers scanned, ${report.toolsScanned} tools${ANSI.reset}`,
  );
  lines.push("");

  if (report.collisions.length === 0) {
    lines.push(`${ANSI.green}No tool name collisions detected.${ANSI.reset}`);
    return lines.join("\n");
  }

  for (const collision of report.collisions) {
    const color = collision.kind === "conflicting" ? ANSI.red : ANSI.yellow;
    const schemas = collision.kind === "conflicting" ? "schemas differ" : "identical schemas";
    lines.push(
      `${KIND_ICONS[collision.kind]} ${color}${collision.kind}${ANSI.reset}  ` +
        `${ANSI.bold}${collision.toolName}${ANSI.reset} — ${collision.servers.join(", ")} (${schemas})`,
    );
    lines.push(`    ${ANSI.dim}${collision.suggestion}${ANSI.reset}`);
  }

  lines.push("");
  const noun = report.summary.total === 1 ? "collision" : "collisions";
  lines.push(
    `${ANSI.bold}${report.summary.total} ${noun}:${ANSI.reset} ${collisionSummary(report)}`,
  );
  return lines.join("\n");
}

/**
 * Formats a collision report as markdown suitable for PR comments.
 *
 * @param report - The collision report.
 * @returns Markdown string.
 */
export function formatCollisionsMarkdown(report: CollisionReport): string {
  const lines: string[] = [];
  lines.push("## MCP Tool Collision Check");
  lines.push("");
  lines.push(`**${report.serversScanned} servers scanned, ${report.toolsScanned} tools**`);
  lines.push("");

  if (report.collisions.length === 0) {
    lines.push("No tool name collisions detected. :white_check_mark:");
    return lines.join("\n");
  }

  const noun = report.summary.total === 1 ? "collision" : "collisions";
  lines.push(`**${report.summary.total} ${noun}:** ${collisionSummary(report)}`);
  lines.push("");

  for (const collision of report.collisions) {
    const schemas = collision.kind === "conflicting" ? "schemas differ" : "identical schemas";
    lines.push(
      `- ${KIND_ICONS[collision.kind]} **${collision.kind}** — \`${collision.toolName}\` on ` +
        `${collision.servers.map((s) => `\`${s}\``).join(", ")} (${schemas})`,
    );
    lines.push(`  - ${collision.suggestion}`);
  }

  return lines.join("\n");
}
