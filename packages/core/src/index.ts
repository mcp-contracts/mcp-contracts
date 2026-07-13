/**
 * @mcp-contracts/core
 *
 * Snapshot, diff, and classify MCP tool schema changes.
 *
 * @packageDocumentation
 */

export { detectToolCollisions } from "./collision.js";
export {
  formatCollisionsJson,
  formatCollisionsMarkdown,
  formatCollisionsTerminal,
} from "./collision-format.js";
export { diffComposition } from "./composition.js";
export {
  formatCompositionJson,
  formatCompositionMarkdown,
  formatCompositionTerminal,
} from "./composition-format.js";
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
export { createEmptyDiffReport, diffSnapshots } from "./diff.js";
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
export { buildDependencyGraph } from "./graph.js";
export type { GraphFormat } from "./graph-format.js";
export {
  formatGraphDot,
  formatGraphJson,
  formatGraphMermaid,
  formatGraphTerminal,
} from "./graph-format.js";
export { computeContentHash, sortKeys } from "./hash.js";
export type {
  ProjectConfig,
  ProjectServer,
  ProjectServerCommand,
  ProjectServerConfigRef,
  ProjectServerUrl,
  ProjectWatchSettings,
} from "./project-config.js";
export {
  isProjectServerCommand,
  isProjectServerConfigRef,
  isProjectServerUrl,
  PROJECT_CONFIG_FILENAME,
  parseProjectConfig,
  projectConfigSchema,
} from "./project-config.js";
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
