/**
 * @mcp-contracts/test
 *
 * Contract conformance testing for MCP servers.
 *
 * @packageDocumentation
 */

// MCP client utilities
export type { CapturedServerData } from "./mcp-client.js";
export {
  callServerTool,
  captureServerData,
  closeConnection,
  connectToServer,
  listServerPrompts,
  listServerResources,
  listServerResourceTemplates,
  listServerTools,
} from "./mcp-client.js";
// Types
export type {
  BoundaryCategory,
  BoundaryOptions,
  BoundaryTestCase,
  ConformanceOptions,
  JudgeAssertion,
  JudgeFunction,
  ManagedTestServer,
  TestCategory,
  TestConnection,
  TestReport,
  TestResult,
  TestRunOptions,
  TestServerConfig,
  TestStatus,
  TestSummary,
  ToolAssertion,
  ToolCallResult,
} from "./types.js";
