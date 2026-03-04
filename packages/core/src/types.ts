/**
 * MCP Contract Snapshot types.
 *
 * A snapshot captures the complete public interface of an MCP server
 * at a point in time. This is the source of truth for the `.mcpc.json` format.
 *
 * @see SPEC.md section 1 for the full specification.
 */

/** JSON Schema type with known properties for type-safe access, plus an index signature for the rest. */
export interface JSONSchema {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  additionalProperties?: boolean | JSONSchema;
  description?: string;
  default?: unknown;
  format?: string;
  enum?: unknown[];
  [key: string]: unknown;
}

/** Information about the MCP server, as reported during initialization. */
export interface SnapshotServer {
  /** Server name from the InitializeResult. */
  name: string;
  /** Server version from the InitializeResult. */
  version: string;
  /** The MCP protocol version the server supports. */
  protocolVersion: string;
  /** Server-declared capabilities. */
  capabilities: Record<string, unknown>;
}

/** Metadata about how a snapshot was captured. Informational only. */
export interface SnapshotCapture {
  /** Transport used: "stdio" | "streamable-http" | "sse" */
  transport: string;
  /** The command or URL used to connect, if applicable. */
  source?: string;
  /** Name and version of the tool that created this snapshot (e.g., "mcpdiff/0.1.0"). */
  tool: string;
}

/** A single tool's contract: its description and input/output schemas. */
export interface ToolContract {
  /** The tool's human-readable description, as provided to the model. */
  description: string;
  /** JSON Schema defining the tool's input parameters. */
  inputSchema: JSONSchema;
  /** JSON Schema defining the tool's structured output, if declared. */
  outputSchema?: JSONSchema;
  /** Annotations/hints from the tool definition, if present. */
  annotations?: Record<string, unknown>;
}

/** A single resource's contract. */
export interface ResourceContract {
  /** Resource description. */
  description: string;
  /** MIME type of the resource, if declared. */
  mimeType?: string;
  /** Whether this is a URI template (true) or a fixed URI (false). */
  isTemplate: boolean;
}

/** A single prompt's contract. */
export interface PromptContract {
  /** Prompt description. */
  description: string;
  /** Arguments the prompt accepts. */
  arguments: PromptArgument[];
}

/** A prompt argument definition. */
export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

/**
 * The complete MCP Contract Snapshot.
 *
 * This is the top-level type for a `.mcpc.json` file.
 */
export interface MCPContractSnapshot {
  /** Snapshot format version. Currently "1.0.0". */
  snapshotVersion: "1.0.0";

  /** ISO 8601 timestamp of when this snapshot was captured. */
  capturedAt: string;

  /**
   * SHA-256 hash of the canonical JSON of `tools`, `resources`, and `prompts`.
   * Format: "sha256:<hex>"
   *
   * @see SPEC.md section 1.5 for the hash computation algorithm.
   */
  contentHash: string;

  /** Information about the server. */
  server: SnapshotServer;

  /** How this snapshot was captured. */
  capture: SnapshotCapture;

  /** All tools exposed by the server. Keyed by tool name. */
  tools: Record<string, ToolContract>;

  /** All resources exposed by the server. Keyed by resource URI or URI template. */
  resources: Record<string, ResourceContract>;

  /** All prompts exposed by the server. Keyed by prompt name. */
  prompts: Record<string, PromptContract>;
}

/** The current snapshot format version. */
export const SNAPSHOT_VERSION = "1.0.0" as const;
