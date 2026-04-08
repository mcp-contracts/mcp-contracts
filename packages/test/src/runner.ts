/**
 * Test runner orchestration.
 *
 * Connects to a server, runs enabled test suites, and produces a TestReport.
 */

import { closeConnection, connectToServer } from "./mcp-client.js";
import type { TestReport, TestResult, TestRunOptions, TestSummary } from "./types.js";

/**
 * Builds a TestSummary from an array of results.
 *
 * @param results - The test results.
 * @param durationMs - Total run duration in ms.
 * @returns A summary with counts by status.
 */
export function buildSummary(results: TestResult[], durationMs: number): TestSummary {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let errors = 0;

  for (const r of results) {
    switch (r.status) {
      case "pass":
        passed++;
        break;
      case "fail":
        failed++;
        break;
      case "skip":
        skipped++;
        break;
      case "error":
        errors++;
        break;
    }
  }

  return {
    total: results.length,
    passed,
    failed,
    skipped,
    errors,
    durationMs,
  };
}

/**
 * Runs the complete contract conformance test suite.
 *
 * Connects to the server, runs all enabled test suites (conformance,
 * boundary, assertions), disconnects, and returns a structured report.
 *
 * @param options - Full test run options.
 * @returns A TestReport with all results.
 */
export async function runContractTests(options: TestRunOptions): Promise<TestReport> {
  const startTime = Date.now();
  const results: TestResult[] = [];

  const connection = await connectToServer(options.server);

  try {
    // Schema conformance testing
    if (options.conformance !== false) {
      const { runSchemaConformance } = await import("./schema-conformance.js");
      const conformanceResults = await runSchemaConformance(
        connection,
        options.contract,
        options.conformance ?? {},
      );
      results.push(...conformanceResults);
    }

    // Boundary input testing
    if (options.boundary !== false) {
      const { runBoundaryTests } = await import("./boundary-inputs.js");
      const boundaryResults = await runBoundaryTests(
        connection,
        options.contract,
        options.boundary ?? {},
      );
      results.push(...boundaryResults);
    }

    // Predicate assertions
    if (options.assertions && options.assertions.length > 0) {
      const { runPredicateAssertions } = await import("./assertions.js");
      const assertionResults = await runPredicateAssertions(connection, options.assertions);
      results.push(...assertionResults);
    }

    // Judge assertions
    if (options.judgeAssertions && options.judgeAssertions.length > 0) {
      const { runJudgeAssertions } = await import("./assertions.js");
      const judgeResults = await runJudgeAssertions(connection, options.judgeAssertions);
      results.push(...judgeResults);
    }
  } finally {
    await closeConnection(connection);
  }

  const durationMs = Date.now() - startTime;

  return {
    meta: {
      contractPath: options.contractPath,
      serverName: connection.serverName,
      serverVersion: connection.serverVersion,
      runAt: new Date().toISOString(),
      tool: "mcp-test/0.5.0",
    },
    summary: buildSummary(results, durationMs),
    results,
  };
}
