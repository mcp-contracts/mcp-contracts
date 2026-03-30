/**
 * Behavioral assertions.
 *
 * User-defined predicate and judge-based assertions on tool outputs.
 * The judge interface is pluggable — users bring their own LLM client.
 */

import { callServerTool } from "./mcp-client.js";
import type { JudgeAssertion, TestConnection, TestResult, ToolAssertion } from "./types.js";

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Runs user-defined predicate assertions against a live server.
 *
 * For each assertion, calls the tool with the given input and
 * runs the user's assert function against the result.
 *
 * @param connection - The active MCP server connection.
 * @param assertions - Array of predicate assertions.
 * @param timeoutMs - Per-call timeout in ms. Default: 10000.
 * @returns Array of TestResult.
 */
export async function runPredicateAssertions(
  connection: TestConnection,
  assertions: ToolAssertion[],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const assertion of assertions) {
    const startTime = Date.now();
    const id = `assertion.${assertion.toolName}.${assertion.description.replace(/\s+/g, "_").toLowerCase()}`;

    try {
      const output = await callServerTool(
        connection,
        assertion.toolName,
        assertion.input,
        timeoutMs,
      );

      const passed = await assertion.assert(output);

      results.push({
        id,
        category: "assertion",
        toolName: assertion.toolName,
        status: passed ? "pass" : "fail",
        description: assertion.description,
        message: passed ? undefined : `Assertion failed: ${assertion.description}`,
        durationMs: Date.now() - startTime,
        input: assertion.input,
        output,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        id,
        category: "assertion",
        toolName: assertion.toolName,
        status: "error",
        description: assertion.description,
        message,
        durationMs: Date.now() - startTime,
        input: assertion.input,
      });
    }
  }

  return results;
}

/**
 * Runs judge-based assertions (LLM-as-judge or custom validators).
 *
 * For each assertion, calls the tool and then invokes the user-provided
 * judge function to evaluate whether the output satisfies the expectation.
 *
 * @param connection - The active MCP server connection.
 * @param assertions - Array of judge assertions.
 * @param timeoutMs - Per-call timeout in ms. Default: 10000.
 * @returns Array of TestResult.
 */
export async function runJudgeAssertions(
  connection: TestConnection,
  assertions: JudgeAssertion[],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const assertion of assertions) {
    const startTime = Date.now();
    const id = `assertion.judge.${assertion.toolName}.${assertion.description.replace(/\s+/g, "_").toLowerCase()}`;

    try {
      const output = await callServerTool(
        connection,
        assertion.toolName,
        assertion.input,
        timeoutMs,
      );

      const judgment = await assertion.judge({
        toolName: assertion.toolName,
        input: assertion.input,
        output,
        expectation: assertion.expectation,
      });

      results.push({
        id,
        category: "assertion",
        toolName: assertion.toolName,
        status: judgment.pass ? "pass" : "fail",
        description: assertion.description,
        message: judgment.pass ? undefined : `Judge: ${judgment.reason}`,
        durationMs: Date.now() - startTime,
        input: assertion.input,
        output,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        id,
        category: "assertion",
        toolName: assertion.toolName,
        status: "error",
        description: assertion.description,
        message,
        durationMs: Date.now() - startTime,
        input: assertion.input,
      });
    }
  }

  return results;
}
