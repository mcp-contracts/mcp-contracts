/**
 * @mcp-contracts/core
 *
 * Snapshot, diff, and classify MCP tool schema changes.
 *
 * @packageDocumentation
 */

// Types
export type {
  MCPContractSnapshot,
  ToolContract,
  ResourceContract,
  PromptContract,
  PromptArgument,
  SnapshotServer,
  SnapshotCapture,
  JSONSchema,
} from "./types.js";

export { SNAPSHOT_VERSION } from "./types.js";

export type {
  DiffReport,
  DiffMeta,
  DiffSummary,
  DiffOptions,
  SchemaChange,
  Severity,
  ChangeType,
  ChangeCategory,
} from "./diff-types.js";

export { SEVERITY_ORDER } from "./diff-types.js";

export type {
  CreateSnapshotParams,
  RawTool,
  RawResource,
  RawResourceTemplate,
  RawPrompt,
} from "./snapshot.js";

// Functions — uncomment as implemented:
export {
  createSnapshot,
  normalizeTools,
  normalizeResources,
  normalizePrompts,
} from "./snapshot.js";
export { computeContentHash, sortKeys } from "./hash.js";
export { diffSnapshots } from "./diff.js";
export { formatTerminal, formatMarkdown, formatJson } from "./format.js";
