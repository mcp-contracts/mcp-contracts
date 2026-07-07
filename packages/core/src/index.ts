/**
 * @mcp-contracts/core
 *
 * Snapshot, diff, and classify MCP tool schema changes.
 *
 * @packageDocumentation
 */

export type {
  CollisionKind,
  CollisionReport,
  CollisionSummary,
  CompositionDiffReport,
  CompositionSummary,
  DependencyGraph,
  GraphOverlap,
  GraphServer,
  ServerDiffEntry,
  ServerDiffStatus,
  ServerSnapshotEntry,
  ToolCollision,
} from "./composition-types.js";
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
export {
  detectKeyAlgorithm,
  parseSignatureFile,
  signContentHash,
  verifyContentHash,
  verifySignature,
} from "./sign.js";
export type {
  DetachedSignature,
  SignatureAlgorithm,
  VerifyHashResult,
  VerifySignatureResult,
} from "./sign-types.js";
export { SIGNATURE_VERSION } from "./sign-types.js";
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
export type {
  CreateWatchConfigOptions,
  WatchConfig,
  WatchDiffEvent,
} from "./watch-types.js";
export { createWatchConfig, DEFAULT_WATCH_IGNORE_PATTERNS } from "./watch-types.js";
export type { WebhookPayload, WebhookSource, WebhookTrigger } from "./webhook-types.js";
export { createWebhookPayload } from "./webhook-types.js";
