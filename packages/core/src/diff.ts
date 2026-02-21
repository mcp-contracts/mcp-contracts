import type {
  DiffOptions,
  DiffReport,
  DiffSummary,
  SchemaChange,
  Severity,
} from "./diff-types.js";
import { SEVERITY_ORDER } from "./diff-types.js";
import { diffOutputSchema, diffSchemas } from "./diff-schema.js";
import type { MCPContractSnapshot } from "./types.js";

/**
 * Builds the metadata section of a diff report from two snapshots.
 *
 * @param before - The baseline snapshot.
 * @param after - The updated snapshot.
 * @returns DiffReport meta object.
 */
function buildMeta(before: MCPContractSnapshot, after: MCPContractSnapshot) {
  return {
    before: {
      serverName: before.server.name,
      serverVersion: before.server.version,
      contentHash: before.contentHash,
      capturedAt: before.capturedAt,
    },
    after: {
      serverName: after.server.name,
      serverVersion: after.server.version,
      contentHash: after.contentHash,
      capturedAt: after.capturedAt,
    },
    generatedAt: new Date().toISOString(),
    tool: "mcpdiff",
  };
}

/**
 * Computes summary counts from a list of changes.
 *
 * @param changes - The list of schema changes.
 * @returns Summary with counts per severity and total.
 */
function buildSummary(changes: SchemaChange[]): DiffSummary {
  const summary: DiffSummary = { breaking: 0, warning: 0, safe: 0, total: 0 };
  for (const change of changes) {
    summary[change.severity]++;
    summary.total++;
  }
  return summary;
}

/**
 * Sorts changes by severity (breaking first, then warning, then safe).
 *
 * @param changes - The unsorted list of changes.
 * @returns A new sorted array.
 */
function sortChanges(changes: SchemaChange[]): SchemaChange[] {
  return [...changes].sort(
    (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity],
  );
}

/**
 * Filters changes by minimum severity level.
 *
 * @param changes - The list of changes to filter.
 * @param minSeverity - The minimum severity to include.
 * @returns Filtered list.
 */
function filterBySeverity(
  changes: SchemaChange[],
  minSeverity: Severity,
): SchemaChange[] {
  const minOrder = SEVERITY_ORDER[minSeverity];
  return changes.filter((c) => SEVERITY_ORDER[c.severity] >= minOrder);
}

/**
 * Detects tool-level changes between two snapshots.
 *
 * @param before - The baseline snapshot.
 * @param after - The updated snapshot.
 * @returns List of tool-level changes.
 */
function diffTools(
  before: MCPContractSnapshot,
  after: MCPContractSnapshot,
): SchemaChange[] {
  const changes: SchemaChange[] = [];
  const beforeNames = new Set(Object.keys(before.tools));
  const afterNames = new Set(Object.keys(after.tools));

  // Removed tools
  for (const name of beforeNames) {
    if (!afterNames.has(name)) {
      changes.push({
        id: `tool.${name}.removed`,
        category: "tool",
        name,
        severity: "breaking",
        type: "removed",
        message: `Tool "${name}" was removed`,
      });
    }
  }

  // Added tools
  for (const name of afterNames) {
    if (!beforeNames.has(name)) {
      changes.push({
        id: `tool.${name}.added`,
        category: "tool",
        name,
        severity: "safe",
        type: "added",
        message: `Tool "${name}" was added`,
      });
    }
  }

  // Modified tools (present in both)
  for (const name of beforeNames) {
    if (!afterNames.has(name)) continue;
    const beforeTool = before.tools[name]!;
    const afterTool = after.tools[name]!;

    if (beforeTool.description !== afterTool.description) {
      changes.push({
        id: `tool.${name}.description`,
        category: "tool",
        name,
        severity: "warning",
        type: "modified",
        message: `Tool "${name}" description changed`,
        path: "description",
        before: beforeTool.description,
        after: afterTool.description,
      });
    }

    // Input schema changes
    changes.push(
      ...diffSchemas(name, beforeTool.inputSchema, afterTool.inputSchema, "inputSchema"),
    );

    // Output schema changes
    changes.push(
      ...diffOutputSchema(name, beforeTool.outputSchema, afterTool.outputSchema),
    );
  }

  return changes;
}

/**
 * Compares two MCP Contract Snapshots and returns a detailed diff report.
 *
 * @param before - The baseline snapshot.
 * @param after - The updated snapshot.
 * @param options - Options for filtering the diff.
 * @returns A DiffReport with all detected changes.
 */
export function diffSnapshots(
  before: MCPContractSnapshot,
  after: MCPContractSnapshot,
  options?: DiffOptions,
): DiffReport {
  const minSeverity = options?.minSeverity ?? "safe";

  let changes: SchemaChange[] = [
    ...diffTools(before, after),
  ];

  changes = sortChanges(changes);
  changes = filterBySeverity(changes, minSeverity);

  return {
    meta: buildMeta(before, after),
    summary: buildSummary(changes),
    changes,
  };
}
