/**
 * Composition diff engine.
 *
 * Diffs every server in a multi-server composition against its baseline,
 * matching servers to baselines by composition name, and aggregates the
 * per-server reports into a single unified report.
 */

import type {
  CompositionDiffReport,
  CompositionSummary,
  ServerDiffEntry,
  ServerSnapshotEntry,
} from "./composition-types.js";
import { diffSnapshots } from "./diff.js";
import type { DiffOptions } from "./diff-types.js";

/**
 * Diffs a composition of current server snapshots against their baselines.
 *
 * Servers are matched to baselines by their composition name (the mcp.json
 * server key). Servers without a baseline are reported as "missing-baseline";
 * baselines whose server is no longer in the composition are reported as
 * "missing-server". Neither contributes changes to the aggregated summary.
 *
 * @param baselines - The baseline snapshots (the "before" side).
 * @param current - The current snapshots (the "after" side).
 * @param options - Diff options applied to every per-server diff.
 * @returns A unified composition diff report, servers ordered by name.
 */
export function diffComposition(
  baselines: ServerSnapshotEntry[],
  current: ServerSnapshotEntry[],
  options?: DiffOptions,
): CompositionDiffReport {
  const baselineByName = new Map(baselines.map((b) => [b.serverName, b]));
  const currentByName = new Map(current.map((c) => [c.serverName, c]));

  const allNames = [...new Set([...baselineByName.keys(), ...currentByName.keys()])].sort((a, b) =>
    a.localeCompare(b),
  );

  const servers: ServerDiffEntry[] = [];
  const summary: CompositionSummary = {
    servers: allNames.length,
    diffed: 0,
    missingBaselines: 0,
    missingServers: 0,
    breaking: 0,
    warning: 0,
    safe: 0,
    total: 0,
  };

  for (const name of allNames) {
    const baseline = baselineByName.get(name);
    const now = currentByName.get(name);

    if (!baseline) {
      summary.missingBaselines += 1;
      servers.push({ serverName: name, status: "missing-baseline" });
      continue;
    }
    if (!now) {
      summary.missingServers += 1;
      servers.push({ serverName: name, status: "missing-server" });
      continue;
    }

    const report = diffSnapshots(baseline.snapshot, now.snapshot, options);
    summary.diffed += 1;
    summary.breaking += report.summary.breaking;
    summary.warning += report.summary.warning;
    summary.safe += report.summary.safe;
    summary.total += report.summary.total;
    servers.push({ serverName: name, status: "diffed", report });
  }

  return {
    generatedAt: new Date().toISOString(),
    tool: "mcpdiff",
    servers,
    summary,
  };
}
