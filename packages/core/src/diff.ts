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
 * Detects resource-level changes between two snapshots.
 *
 * @param before - The baseline snapshot.
 * @param after - The updated snapshot.
 * @returns List of resource-level changes.
 */
function diffResources(
  before: MCPContractSnapshot,
  after: MCPContractSnapshot,
): SchemaChange[] {
  const changes: SchemaChange[] = [];
  const beforeKeys = new Set(Object.keys(before.resources));
  const afterKeys = new Set(Object.keys(after.resources));

  for (const uri of beforeKeys) {
    if (!afterKeys.has(uri)) {
      changes.push({
        id: `resource.${uri}.removed`,
        category: "resource",
        name: uri,
        severity: "breaking",
        type: "removed",
        message: `Resource "${uri}" was removed`,
      });
    }
  }

  for (const uri of afterKeys) {
    if (!beforeKeys.has(uri)) {
      changes.push({
        id: `resource.${uri}.added`,
        category: "resource",
        name: uri,
        severity: "safe",
        type: "added",
        message: `Resource "${uri}" was added`,
      });
    }
  }

  for (const uri of beforeKeys) {
    if (!afterKeys.has(uri)) continue;
    const beforeRes = before.resources[uri]!;
    const afterRes = after.resources[uri]!;

    if (beforeRes.description !== afterRes.description) {
      changes.push({
        id: `resource.${uri}.description`,
        category: "resource",
        name: uri,
        severity: "warning",
        type: "modified",
        message: `Resource "${uri}" description changed`,
        path: "description",
        before: beforeRes.description,
        after: afterRes.description,
      });
    }

    if (beforeRes.mimeType !== afterRes.mimeType) {
      changes.push({
        id: `resource.${uri}.mimeType`,
        category: "resource",
        name: uri,
        severity: "warning",
        type: "modified",
        message: `Resource "${uri}" MIME type changed from "${beforeRes.mimeType ?? "unset"}" to "${afterRes.mimeType ?? "unset"}"`,
        path: "mimeType",
        before: beforeRes.mimeType,
        after: afterRes.mimeType,
      });
    }
  }

  return changes;
}

/**
 * Detects prompt-level changes between two snapshots.
 *
 * @param before - The baseline snapshot.
 * @param after - The updated snapshot.
 * @returns List of prompt-level changes.
 */
function diffPrompts(
  before: MCPContractSnapshot,
  after: MCPContractSnapshot,
): SchemaChange[] {
  const changes: SchemaChange[] = [];
  const beforeNames = new Set(Object.keys(before.prompts));
  const afterNames = new Set(Object.keys(after.prompts));

  for (const name of beforeNames) {
    if (!afterNames.has(name)) {
      changes.push({
        id: `prompt.${name}.removed`,
        category: "prompt",
        name,
        severity: "breaking",
        type: "removed",
        message: `Prompt "${name}" was removed`,
      });
    }
  }

  for (const name of afterNames) {
    if (!beforeNames.has(name)) {
      changes.push({
        id: `prompt.${name}.added`,
        category: "prompt",
        name,
        severity: "safe",
        type: "added",
        message: `Prompt "${name}" was added`,
      });
    }
  }

  for (const name of beforeNames) {
    if (!afterNames.has(name)) continue;
    const beforePrompt = before.prompts[name]!;
    const afterPrompt = after.prompts[name]!;

    if (beforePrompt.description !== afterPrompt.description) {
      changes.push({
        id: `prompt.${name}.description`,
        category: "prompt",
        name,
        severity: "warning",
        type: "modified",
        message: `Prompt "${name}" description changed`,
        path: "description",
        before: beforePrompt.description,
        after: afterPrompt.description,
      });
    }

    // Argument changes
    const beforeArgs = new Map(beforePrompt.arguments.map((a) => [a.name, a]));
    const afterArgs = new Map(afterPrompt.arguments.map((a) => [a.name, a]));

    for (const [argName, arg] of afterArgs) {
      if (!beforeArgs.has(argName)) {
        const isRequired = arg.required === true;
        changes.push({
          id: `prompt.${name}.argument.${argName}.added`,
          category: "prompt",
          name,
          severity: isRequired ? "breaking" : "safe",
          type: "added",
          message: isRequired
            ? `Required argument "${argName}" added to prompt "${name}"`
            : `Optional argument "${argName}" added to prompt "${name}"`,
          path: `arguments.${argName}`,
          after: arg,
        });
      }
    }

    for (const [argName, arg] of beforeArgs) {
      if (!afterArgs.has(argName)) {
        changes.push({
          id: `prompt.${name}.argument.${argName}.removed`,
          category: "prompt",
          name,
          severity: "warning",
          type: "removed",
          message: `Argument "${argName}" removed from prompt "${name}"`,
          path: `arguments.${argName}`,
          before: arg,
        });
      }
    }
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
    ...diffResources(before, after),
    ...diffPrompts(before, after),
  ];

  changes = sortChanges(changes);
  changes = filterBySeverity(changes, minSeverity);

  return {
    meta: buildMeta(before, after),
    summary: buildSummary(changes),
    changes,
  };
}
