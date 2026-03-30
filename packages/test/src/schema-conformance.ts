/**
 * Schema conformance testing.
 *
 * Compares a live server's tool/resource/prompt schemas against a contract.
 * Stub — full implementation in commit 4.
 */

import type { MCPContractSnapshot } from "@mcp-contracts/core";
import type { ConformanceOptions, TestConnection, TestResult } from "./types.js";

/**
 * Runs schema conformance tests by comparing server tools to a contract.
 *
 * @param connection - The active MCP server connection.
 * @param contract - The loaded contract snapshot.
 * @param options - Conformance testing options.
 * @returns Array of TestResult for each conformance check.
 */
export async function runSchemaConformance(
  _connection: TestConnection,
  _contract: MCPContractSnapshot,
  _options: ConformanceOptions,
): Promise<TestResult[]> {
  return [];
}
