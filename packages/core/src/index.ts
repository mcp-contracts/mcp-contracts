/**
 * @mcp-contracts/core
 *
 * Snapshot, diff, and classify MCP tool schema changes.
 *
 * @packageDocumentation
 */

export { diffSnapshots } from "./diff.js";
export type {
  ChangeCategory,
  ChangeType,
  DiffMeta,
  DiffOptions,
  DiffReport,
  DiffSummary,
  SchemaChange,
  Severity,
} from "./diff-types.js";
export { SEVERITY_ORDER } from "./diff-types.js";
export { formatJson, formatMarkdown, formatTerminal } from "./format.js";
export { computeContentHash, sortKeys } from "./hash.js";
export type {
  CreateSnapshotParams,
  RawPrompt,
  RawResource,
  RawResourceTemplate,
  RawTool,
} from "./snapshot.js";
// Functions — uncomment as implemented:
export {
  createSnapshot,
  normalizePrompts,
  normalizeResources,
  normalizeTools,
} from "./snapshot.js";
// Types
export type {
  JSONSchema,
  MCPContractSnapshot,
  PromptArgument,
  PromptContract,
  ResourceContract,
  SnapshotCapture,
  SnapshotServer,
  ToolContract,
} from "./types.js";
export { SNAPSHOT_VERSION } from "./types.js";
export type { WebhookPayload, WebhookSource, WebhookTrigger } from "./webhook-types.js";
export { createWebhookPayload } from "./webhook-types.js";
