import { describe, expect, it } from "vitest";
import type {
  BoundaryCategory,
  BoundaryTestCase,
  ConformanceOptions,
  JudgeAssertion,
  TestCategory,
  TestReport,
  TestResult,
  TestServerConfig,
  TestStatus,
  TestSummary,
  ToolAssertion,
  ToolCallResult,
} from "./types.js";

describe("types", () => {
  it("TestServerConfig accepts stdio config", () => {
    const config: TestServerConfig = {
      transport: "stdio",
      command: "node",
      args: ["server.js"],
      env: { DEBUG: "true" },
      timeoutMs: 5000,
    };
    expect(config.transport).toBe("stdio");
    expect(config.command).toBe("node");
  });

  it("TestServerConfig accepts http config", () => {
    const config: TestServerConfig = {
      transport: "streamable-http",
      url: "http://localhost:3000/mcp",
      headers: { Authorization: "Bearer token" },
    };
    expect(config.transport).toBe("streamable-http");
    expect(config.url).toBe("http://localhost:3000/mcp");
  });

  it("TestStatus covers all statuses", () => {
    const statuses: TestStatus[] = ["pass", "fail", "skip", "error"];
    expect(statuses).toHaveLength(4);
  });

  it("TestCategory covers all categories", () => {
    const categories: TestCategory[] = ["conformance", "boundary", "assertion"];
    expect(categories).toHaveLength(3);
  });

  it("TestResult has required fields", () => {
    const result: TestResult = {
      id: "conformance.create_contact",
      category: "conformance",
      toolName: "create_contact",
      status: "pass",
      description: "Tool schema matches contract",
    };
    expect(result.id).toBe("conformance.create_contact");
    expect(result.status).toBe("pass");
  });

  it("TestResult supports optional failure details", () => {
    const result: TestResult = {
      id: "boundary.create_contact.empty_name",
      category: "boundary",
      toolName: "create_contact",
      status: "fail",
      description: "Empty string for name",
      message: "Server crashed",
      durationMs: 150,
      input: { name: "" },
      output: null,
    };
    expect(result.message).toBe("Server crashed");
    expect(result.input).toEqual({ name: "" });
  });

  it("TestSummary has all count fields", () => {
    const summary: TestSummary = {
      total: 10,
      passed: 7,
      failed: 2,
      skipped: 1,
      errors: 0,
      durationMs: 1500,
    };
    expect(summary.total).toBe(summary.passed + summary.failed + summary.skipped + summary.errors);
  });

  it("TestReport composes meta, summary, and results", () => {
    const report: TestReport = {
      meta: {
        contractPath: "contract.mcpc.json",
        serverName: "test-server",
        serverVersion: "1.0.0",
        runAt: "2026-01-01T00:00:00Z",
        tool: "mcp-test/0.5.0",
      },
      summary: {
        total: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        errors: 0,
        durationMs: 100,
      },
      results: [
        {
          id: "conformance.tool1",
          category: "conformance",
          toolName: "tool1",
          status: "pass",
          description: "Schema matches",
        },
      ],
    };
    expect(report.results).toHaveLength(1);
    expect(report.meta.tool).toBe("mcp-test/0.5.0");
  });

  it("ConformanceOptions has sensible defaults when empty", () => {
    const options: ConformanceOptions = {};
    expect(options.allowExtraTools).toBeUndefined();
    expect(options.ignoreDescriptions).toBeUndefined();
    expect(options.skipTools).toBeUndefined();
  });

  it("BoundaryCategory covers all categories", () => {
    const categories: BoundaryCategory[] = [
      "empty",
      "zero",
      "negative",
      "missing_optional",
      "missing_required",
      "type_boundary",
      "oversized",
      "special_chars",
      "custom",
    ];
    expect(categories).toHaveLength(9);
  });

  it("BoundaryTestCase has required fields", () => {
    const testCase: BoundaryTestCase = {
      description: "Empty string for name",
      category: "empty",
      input: { name: "", email: "test@test.com" },
    };
    expect(testCase.category).toBe("empty");
  });

  it("ToolCallResult normalizes MCP response", () => {
    const result: ToolCallResult = {
      isError: false,
      content: [{ type: "text", text: '{"id": "c_001"}' }],
      text: '{"id": "c_001"}',
    };
    expect(result.isError).toBe(false);
    expect(result.text).toBeDefined();
  });

  it("ToolAssertion defines a predicate test", () => {
    const assertion: ToolAssertion = {
      toolName: "get_contact",
      description: "Returns valid JSON",
      input: { id: "c_001" },
      assert: (result) => {
        if (!result.text) return false;
        try {
          JSON.parse(result.text);
          return true;
        } catch {
          return false;
        }
      },
    };
    expect(assertion.toolName).toBe("get_contact");
    expect(typeof assertion.assert).toBe("function");
  });

  it("JudgeAssertion defines a judge-based test", () => {
    const assertion: JudgeAssertion = {
      toolName: "search_contacts",
      description: "Returns relevant results",
      input: { query: "Jane" },
      expectation: "Results should contain contacts matching 'Jane'",
      judge: async () => ({ pass: true, reason: "Results match" }),
    };
    expect(assertion.expectation).toBeDefined();
    expect(typeof assertion.judge).toBe("function");
  });
});
