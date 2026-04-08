import { describe, expect, it } from "vitest";
import { buildSummary } from "./runner.js";
import type { TestResult } from "./types.js";

describe("buildSummary", () => {
  it("counts pass/fail/skip/error correctly", () => {
    const results: TestResult[] = [
      { id: "1", category: "conformance", toolName: "a", status: "pass", description: "ok" },
      { id: "2", category: "conformance", toolName: "b", status: "pass", description: "ok" },
      { id: "3", category: "conformance", toolName: "c", status: "fail", description: "bad" },
      { id: "4", category: "boundary", toolName: "d", status: "skip", description: "skip" },
      { id: "5", category: "assertion", toolName: "e", status: "error", description: "err" },
    ];

    const summary = buildSummary(results, 1000);
    expect(summary.total).toBe(5);
    expect(summary.passed).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.errors).toBe(1);
    expect(summary.durationMs).toBe(1000);
  });

  it("handles empty results", () => {
    const summary = buildSummary([], 0);
    expect(summary.total).toBe(0);
    expect(summary.passed).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.skipped).toBe(0);
    expect(summary.errors).toBe(0);
  });

  it("handles all pass", () => {
    const results: TestResult[] = [
      { id: "1", category: "conformance", toolName: "a", status: "pass", description: "ok" },
      { id: "2", category: "conformance", toolName: "b", status: "pass", description: "ok" },
    ];

    const summary = buildSummary(results, 500);
    expect(summary.total).toBe(2);
    expect(summary.passed).toBe(2);
    expect(summary.failed).toBe(0);
  });

  it("preserves durationMs", () => {
    const summary = buildSummary([], 12345);
    expect(summary.durationMs).toBe(12345);
  });
});
