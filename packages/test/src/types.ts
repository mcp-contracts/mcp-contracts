/**
 * @mcp-contracts/test — Types
 *
 * All public types for the contract testing library.
 *
 * @packageDocumentation
 */

import type { MCPContractSnapshot } from "@mcp-contracts/core";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

// ---------------------------------------------------------------------------
// Server Connection
// ---------------------------------------------------------------------------

/** Transport configuration for connecting to a test server. */
export interface TestServerConfig {
  /** Transport type. */
  transport: "stdio" | "streamable-http" | "sse";
  /** Server command for stdio transport. */
  command?: string;
  /** Arguments for the server command. */
  args?: string[];
  /** Environment variables for the server process. */
  env?: Record<string, string>;
  /** Server URL for HTTP/SSE transports. */
  url?: string;
  /** Custom HTTP headers. */
  headers?: Record<string, string>;
  /** Connection timeout in ms. Default: 30000. */
  timeoutMs?: number;
}

/** An active connection to an MCP server. */
export interface TestConnection {
  /** The MCP client instance. */
  client: Client;
  /** The transport layer. */
  transport: Transport;
  /** Server name from initialization. */
  serverName: string;
  /** Server version from initialization. */
  serverVersion: string;
  /** Negotiated protocol version. */
  protocolVersion: string;
}

// ---------------------------------------------------------------------------
// Test Results
// ---------------------------------------------------------------------------

/** Status of an individual test. */
export type TestStatus = "pass" | "fail" | "skip" | "error";

/** Category of a test. */
export type TestCategory = "conformance" | "boundary" | "assertion";

/** A single test result. */
export interface TestResult {
  /** Unique identifier (e.g., "conformance.create_contact.inputSchema.phone.added"). */
  id: string;
  /** Test category. */
  category: TestCategory;
  /** Which tool this test is for. */
  toolName: string;
  /** Pass/fail/skip/error. */
  status: TestStatus;
  /** Human-readable description of what was tested. */
  description: string;
  /** On failure/error, the detailed message. */
  message?: string;
  /** Duration of this test in ms. */
  durationMs?: number;
  /** For boundary tests: the input that was sent. */
  input?: Record<string, unknown>;
  /** For boundary tests: the response received. */
  output?: unknown;
  /** For conformance tests: the JSON path to the deviation. */
  path?: string;
  /** For conformance tests: the expected value. */
  expected?: unknown;
  /** For conformance tests: the actual value. */
  actual?: unknown;
}

/** Summary of a test run. */
export interface TestSummary {
  /** Total number of tests. */
  total: number;
  /** Number of passing tests. */
  passed: number;
  /** Number of failing tests. */
  failed: number;
  /** Number of skipped tests. */
  skipped: number;
  /** Number of errored tests. */
  errors: number;
  /** Total duration in ms. */
  durationMs: number;
}

/** Complete test report. */
export interface TestReport {
  /** Run metadata. */
  meta: {
    contractPath: string;
    serverName: string;
    serverVersion: string;
    runAt: string;
    tool: string;
  };
  /** Summary counts. */
  summary: TestSummary;
  /** Individual results. */
  results: TestResult[];
}

// ---------------------------------------------------------------------------
// Schema Conformance (Issue #36)
// ---------------------------------------------------------------------------

/** Options for schema conformance testing. */
export interface ConformanceOptions {
  /** Allow tools that exist on server but not in contract. Default: false. */
  allowExtraTools?: boolean;
  /** Ignore description differences. Default: false. */
  ignoreDescriptions?: boolean;
  /** List of tool names to skip. */
  skipTools?: string[];
}

// ---------------------------------------------------------------------------
// Boundary Testing (Issue #37)
// ---------------------------------------------------------------------------

/** Options for boundary input testing. */
export interface BoundaryOptions {
  /** List of tool names to skip. */
  skipTools?: string[];
  /** Maximum string payload size in bytes. Default: 10000. */
  maxStringSize?: number;
  /** Custom edge case inputs per tool. */
  customInputs?: Record<string, Array<Record<string, unknown>>>;
  /** Timeout per tool call in ms. Default: 10000. */
  callTimeoutMs?: number;
}

/** Category of a boundary edge case. */
export type BoundaryCategory =
  | "empty"
  | "zero"
  | "negative"
  | "missing_optional"
  | "missing_required"
  | "type_boundary"
  | "oversized"
  | "special_chars"
  | "custom";

/** A generated boundary test case. */
export interface BoundaryTestCase {
  /** Human-readable description. */
  description: string;
  /** The category of edge case. */
  category: BoundaryCategory;
  /** The input arguments to send. */
  input: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Assertions (Issue #38)
// ---------------------------------------------------------------------------

/** The result of a tool call, normalized for assertions. */
export interface ToolCallResult {
  /** Whether the tool returned isError: true. */
  isError: boolean;
  /** The content array from the MCP response. */
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  /** The structured content, if any. */
  structuredContent?: Record<string, unknown>;
  /** The first text content item's text, for convenience. */
  text?: string;
}

/** A user-defined assertion on a tool's output. */
export interface ToolAssertion {
  /** Tool name to call. */
  toolName: string;
  /** Description of what this assertion checks. */
  description: string;
  /** Input arguments to send. */
  input: Record<string, unknown>;
  /**
   * Predicate function that validates the result.
   *
   * @param result - The normalized tool call result.
   * @returns True for pass, false for fail.
   */
  assert: (result: ToolCallResult) => boolean | Promise<boolean>;
}

/**
 * Judge function type for LLM-as-judge or custom validators.
 *
 * @param params - The judgment context.
 * @returns Whether the output passes and the reasoning.
 */
export type JudgeFunction = (params: {
  toolName: string;
  input: Record<string, unknown>;
  output: ToolCallResult;
  expectation: string;
}) => Promise<{ pass: boolean; reason: string }>;

/** A judge-based assertion. */
export interface JudgeAssertion {
  /** Tool name to call. */
  toolName: string;
  /** Description of what this assertion checks. */
  description: string;
  /** Input arguments to send. */
  input: Record<string, unknown>;
  /** What the output should satisfy (passed to the judge). */
  expectation: string;
  /** The judge function to evaluate the output. */
  judge: JudgeFunction;
}

// ---------------------------------------------------------------------------
// Runner Options
// ---------------------------------------------------------------------------

/** Full options for a test run. */
export interface TestRunOptions {
  /** The loaded contract snapshot. */
  contract: MCPContractSnapshot;
  /** Path to the contract file (for reporting). */
  contractPath: string;
  /** Server connection configuration. */
  server: TestServerConfig;
  /** Schema conformance options, or false to disable. Default: enabled. */
  conformance?: ConformanceOptions | false;
  /** Boundary testing options, or false to disable. Default: enabled. */
  boundary?: BoundaryOptions | false;
  /** User-defined predicate assertions. */
  assertions?: ToolAssertion[];
  /** User-defined judge assertions. */
  judgeAssertions?: JudgeAssertion[];
  /** Global timeout in ms. Default: 120000. */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Managed Test Server (Issue #39)
// ---------------------------------------------------------------------------

/** A managed server connection for use in test frameworks. */
export interface ManagedTestServer {
  /** The server configuration. */
  config: TestServerConfig;
  /** Connect to the server. Call in beforeAll. */
  connect(): Promise<void>;
  /** Disconnect from the server. Call in afterAll. */
  disconnect(): Promise<void>;
  /** Get the active connection. Throws if not connected. */
  getConnection(): TestConnection;
}
