import { describe, expect, it } from "vitest";
import { formatTestJson, formatTestMarkdown, formatTestTerminal } from "./format.js";
import type { TestReport } from "./types.js";

function createTestReport(overrides?: Partial<TestReport>): TestReport {
  return {
    meta: {
      contractPath: "contract.mcpc.json",
      serverName: "test-server",
      serverVersion: "1.0.0",
      runAt: "2026-01-15T10:00:00Z",
      tool: "mcp-test/0.5.0",
    },
    summary: {
      total: 3,
      passed: 2,
      failed: 1,
      skipped: 0,
      errors: 0,
      durationMs: 1500,
    },
    results: [
      {
        id: "conformance.create_contact",
        category: "conformance",
        toolName: "create_contact",
        status: "pass",
        description: "create_contact schema matches contract",
      },
      {
        id: "conformance.get_contact",
        category: "conformance",
        toolName: "get_contact",
        status: "pass",
        description: "get_contact schema matches contract",
      },
      {
        id: "conformance.delete_contact",
        category: "conformance",
        toolName: "delete_contact",
        status: "fail",
        description: "delete_contact is missing from server",
        message: "Tool defined in contract but not found on server",
      },
    ],
    ...overrides,
  };
}

describe("formatTestJson", () => {
  it("produces valid pretty-printed JSON", () => {
    const report = createTestReport();
    const json = formatTestJson(report);
    const parsed = JSON.parse(json);
    expect(parsed.meta.serverName).toBe("test-server");
    expect(parsed.summary.total).toBe(3);
    expect(parsed.results).toHaveLength(3);
  });
});

describe("formatTestTerminal", () => {
  it("includes header with server name", () => {
    const report = createTestReport();
    const output = formatTestTerminal(report);
    expect(output).toContain("MCP Contract Test Report");
    expect(output).toContain("test-server@1.0.0");
  });

  it("includes summary counts", () => {
    const report = createTestReport();
    const output = formatTestTerminal(report);
    expect(output).toContain("3 tests:");
    expect(output).toContain("2 passed");
    expect(output).toContain("1 failed");
  });

  it("includes PASS and FAIL labels", () => {
    const report = createTestReport();
    const output = formatTestTerminal(report);
    expect(output).toContain("PASS");
    expect(output).toContain("FAIL");
  });

  it("includes failure messages", () => {
    const report = createTestReport();
    const output = formatTestTerminal(report);
    expect(output).toContain("Tool defined in contract but not found on server");
  });

  it("groups by category", () => {
    const report = createTestReport();
    const output = formatTestTerminal(report);
    expect(output).toContain("Conformance");
  });

  it("shows duration in seconds", () => {
    const report = createTestReport();
    const output = formatTestTerminal(report);
    expect(output).toContain("1.5s");
  });

  it("handles empty results", () => {
    const report = createTestReport({
      results: [],
      summary: { total: 0, passed: 0, failed: 0, skipped: 0, errors: 0, durationMs: 0 },
    });
    const output = formatTestTerminal(report);
    expect(output).toContain("0 tests:");
  });

  it("includes expected/actual for conformance failures", () => {
    const report = createTestReport({
      results: [
        {
          id: "conformance.tool1.inputSchema.name.type",
          category: "conformance",
          toolName: "tool1",
          status: "fail",
          description: "tool1 inputSchema.name type changed",
          path: "inputSchema.properties.name.type",
          expected: "string",
          actual: "number",
        },
      ],
    });
    const output = formatTestTerminal(report);
    expect(output).toContain("expected:");
    expect(output).toContain("actual:");
  });
});

describe("formatTestMarkdown", () => {
  it("includes markdown header", () => {
    const report = createTestReport();
    const md = formatTestMarkdown(report);
    expect(md).toContain("## MCP Contract Test Report");
  });

  it("includes server info", () => {
    const report = createTestReport();
    const md = formatTestMarkdown(report);
    expect(md).toContain("**test-server**");
    expect(md).toContain("`1.0.0`");
  });

  it("includes summary line", () => {
    const report = createTestReport();
    const md = formatTestMarkdown(report);
    expect(md).toContain("**3 tests:**");
    expect(md).toContain("2 passed");
    expect(md).toContain("1 failed");
  });

  it("includes category headings", () => {
    const report = createTestReport();
    const md = formatTestMarkdown(report);
    expect(md).toContain("### Conformance");
  });

  it("includes status icons", () => {
    const report = createTestReport();
    const md = formatTestMarkdown(report);
    expect(md).toContain("PASS");
    expect(md).toContain("FAIL");
  });

  it("includes failure messages as blockquotes", () => {
    const report = createTestReport();
    const md = formatTestMarkdown(report);
    expect(md).toContain("> Tool defined in contract but not found on server");
  });

  it("handles empty results", () => {
    const report = createTestReport({
      results: [],
      summary: { total: 0, passed: 0, failed: 0, skipped: 0, errors: 0, durationMs: 0 },
    });
    const md = formatTestMarkdown(report);
    expect(md).toContain("No tests were run.");
  });
});
