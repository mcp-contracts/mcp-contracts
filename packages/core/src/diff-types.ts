/**
 * Diff result types.
 *
 * These types define the structure of a diff report produced by comparing
 * two MCP Contract Snapshots.
 *
 * @see SPEC.md section 2 for classification rules.
 * @see SPEC.md section 4 for the JSON report format.
 */

/** Severity levels for schema changes. */
export type Severity = "breaking" | "warning" | "safe";

/** What kind of change occurred. */
export type ChangeType = "added" | "removed" | "modified";

/** What category of MCP entity changed. */
export type ChangeCategory = "tool" | "resource" | "prompt";

/** A single detected change between two snapshots. */
export interface SchemaChange {
  /** Unique identifier for this change (e.g., "tool.create_contact.inputSchema.phone.added"). */
  id: string;

  /** What category of entity changed. */
  category: ChangeCategory;

  /** Name of the tool, resource, or prompt that changed. */
  name: string;

  /** Classification of the change. */
  severity: Severity;

  /** What kind of change: added, removed, or modified. */
  type: ChangeType;

  /** Human-readable description of the change. */
  message: string;

  /** The specific path within the schema that changed, if applicable (e.g., "inputSchema.properties.phone"). */
  path?: string;

  /** The old value, if applicable. */
  before?: unknown;

  /** The new value, if applicable. */
  after?: unknown;
}

/** Metadata about the two snapshots being compared. */
export interface DiffMeta {
  before: {
    serverName: string;
    serverVersion: string;
    contentHash: string;
    capturedAt: string;
  };
  after: {
    serverName: string;
    serverVersion: string;
    contentHash: string;
    capturedAt: string;
  };
  generatedAt: string;
  tool: string;
}

/** Summary counts by severity. */
export interface DiffSummary {
  breaking: number;
  warning: number;
  safe: number;
  total: number;
}

/** The complete diff report. */
export interface DiffReport {
  /** Metadata about the comparison. */
  meta: DiffMeta;

  /** Summary counts by severity. */
  summary: DiffSummary;

  /** Individual changes, ordered by severity (breaking first). */
  changes: SchemaChange[];
}

/** Options for the diff engine. */
export interface DiffOptions {
  /** Minimum severity to include in the report. Default: "safe" (include everything). */
  minSeverity?: Severity;
}

/**
 * Severity ordering for comparison and filtering.
 * Higher number = more severe.
 */
export const SEVERITY_ORDER: Record<Severity, number> = {
  safe: 0,
  warning: 1,
  breaking: 2,
};
