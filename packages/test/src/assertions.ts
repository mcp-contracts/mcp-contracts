/**
 * Behavioral assertions.
 *
 * User-defined predicate and judge-based assertions on tool outputs.
 * Stub — full implementation in commit 6.
 */

import type { JudgeAssertion, TestConnection, TestResult, ToolAssertion } from "./types.js";

/**
 * Runs user-defined predicate assertions against a live server.
 *
 * @param connection - The active MCP server connection.
 * @param assertions - Array of predicate assertions.
 * @param timeoutMs - Per-call timeout.
 * @returns Array of TestResult.
 */
export async function runPredicateAssertions(
  _connection: TestConnection,
  _assertions: ToolAssertion[],
  _timeoutMs?: number,
): Promise<TestResult[]> {
  return [];
}

/**
 * Runs judge-based assertions (LLM-as-judge or custom).
 *
 * @param connection - The active MCP server connection.
 * @param assertions - Array of judge assertions.
 * @param timeoutMs - Per-call timeout.
 * @returns Array of TestResult.
 */
export async function runJudgeAssertions(
  _connection: TestConnection,
  _assertions: JudgeAssertion[],
  _timeoutMs?: number,
): Promise<TestResult[]> {
  return [];
}
