/**
 * @mcp-contracts/test
 *
 * Contract conformance testing for MCP servers.
 *
 * @packageDocumentation
 */

// Boundary testing
export {
  generateBoundaryInputs,
  generateValidBaseInput,
  runBoundaryTests,
} from "./boundary-inputs.js";
// Formatters
export { formatTestJson, formatTestMarkdown, formatTestTerminal } from "./format.js";
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
// Runner
export { buildSummary, runContractTests } from "./runner.js";
// Schema conformance
export { runSchemaConformance } from "./schema-conformance.js";
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
