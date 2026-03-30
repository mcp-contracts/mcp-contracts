/**
 * Schema conformance testing.
 *
 * Compares a live server's tool/resource/prompt schemas against a contract
 * by building a live snapshot and running diffSnapshots() from core.
 */

import type { MCPContractSnapshot, SchemaChange } from "@mcp-contracts/core";
import { createSnapshot, diffSnapshots } from "@mcp-contracts/core";
import { captureServerData } from "./mcp-client.js";
import type { ConformanceOptions, TestConnection, TestResult } from "./types.js";

/**
 * Determines whether a tool-related change should be skipped based on options.
 *
 * @param change - The schema change from the diff engine.
 * @param options - Conformance testing options.
 * @returns True if this change should be skipped (not reported as failure).
 */
function shouldSkipChange(change: SchemaChange, options: ConformanceOptions): boolean {
  // Skip description changes if ignoreDescriptions is set
  if (options.ignoreDescriptions && change.path === "description") {
    return true;
  }

  // Skip "tool added" changes if allowExtraTools is set
  if (options.allowExtraTools && change.type === "added" && change.severity === "safe") {
    return true;
  }

  return false;
}

/**
 * Converts a SchemaChange from the diff engine into a TestResult.
 *
 * @param change - The schema change.
 * @param skipped - Whether this change was skipped.
 * @returns A TestResult representing this change.
 */
function changeToTestResult(change: SchemaChange, skipped: boolean): TestResult {
  return {
    id: `conformance.${change.id}`,
    category: "conformance",
    toolName: change.name,
    status: skipped ? "skip" : "fail",
    description: change.message,
    message: skipped ? "Skipped by configuration" : change.message,
    path: change.path,
    expected: change.before,
    actual: change.after,
  };
}

/**
 * Runs schema conformance tests by comparing server tools to a contract.
 *
 * Connects to the server, captures its current schemas, builds a temporary
 * snapshot, and diffs it against the contract. Each deviation becomes a
 * test result.
 *
 * @param connection - The active MCP server connection.
 * @param contract - The loaded contract snapshot.
 * @param options - Conformance testing options.
 * @returns Array of TestResult for each conformance check.
 */
export async function runSchemaConformance(
  connection: TestConnection,
  contract: MCPContractSnapshot,
  options: ConformanceOptions = {},
): Promise<TestResult[]> {
  const skipTools = new Set(options.skipTools ?? []);
  const data = await captureServerData(connection);

  // Build a live snapshot from the captured data
  const liveSnapshot = createSnapshot({
    server: {
      name: connection.serverName,
      version: connection.serverVersion,
      protocolVersion: connection.protocolVersion,
      capabilities: connection.client.getServerCapabilities() as Record<string, unknown>,
    },
    tools: data.tools,
    resources: data.resources,
    resourceTemplates: data.resourceTemplates,
    prompts: data.prompts,
    capture: {
      transport: "stdio",
      source: "mcp-test",
      tool: "mcp-test/0.5.0",
    },
  });

  // Diff the contract (baseline) against the live snapshot
  const report = diffSnapshots(contract, liveSnapshot);
  const results: TestResult[] = [];

  // Track which tools from the contract were checked
  const contractToolNames = new Set(Object.keys(contract.tools));
  const liveToolNames = new Set(Object.keys(liveSnapshot.tools));
  const checkedTools = new Set<string>();

  // Process diff changes into test results
  for (const change of report.changes) {
    // Skip changes for skipped tools
    if (skipTools.has(change.name)) {
      results.push({
        id: `conformance.${change.id}`,
        category: "conformance",
        toolName: change.name,
        status: "skip",
        description: `${change.message} (tool skipped)`,
      });
      checkedTools.add(change.name);
      continue;
    }

    const skipped = shouldSkipChange(change, options);
    results.push(changeToTestResult(change, skipped));
    checkedTools.add(change.name);
  }

  // Generate pass results for contract tools that match exactly
  for (const toolName of contractToolNames) {
    if (skipTools.has(toolName)) {
      if (!checkedTools.has(toolName)) {
        results.push({
          id: `conformance.tool.${toolName}`,
          category: "conformance",
          toolName,
          status: "skip",
          description: `Tool "${toolName}" skipped by configuration`,
        });
      }
      continue;
    }

    if (!checkedTools.has(toolName) && liveToolNames.has(toolName)) {
      results.push({
        id: `conformance.tool.${toolName}`,
        category: "conformance",
        toolName,
        status: "pass",
        description: `Tool "${toolName}" schema matches contract`,
      });
    }
  }

  return results;
}
