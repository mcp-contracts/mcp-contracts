import { describe, expect, it, vi } from "vitest";
import { runJudgeAssertions, runPredicateAssertions } from "./assertions.js";
import type { JudgeAssertion, TestConnection, ToolAssertion } from "./types.js";

function createMockConnection(callToolResult?: Record<string, unknown>): TestConnection {
  const result = callToolResult ?? {
    content: [{ type: "text", text: '{"id": "c_001", "name": "Jane"}' }],
  };

  const client = {
    callTool: vi.fn().mockResolvedValue(result),
  };

  return {
    client: client as unknown as TestConnection["client"],
    transport: { close: vi.fn() } as unknown as TestConnection["transport"],
    serverName: "test",
    serverVersion: "1.0",
    protocolVersion: "2025-11-25",
  };
}

describe("runPredicateAssertions", () => {
  it("passes when assert returns true", async () => {
    const connection = createMockConnection();
    const assertions: ToolAssertion[] = [
      {
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
      },
    ];

    const results = await runPredicateAssertions(connection, assertions);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("pass");
  });

  it("fails when assert returns false", async () => {
    const connection = createMockConnection();
    const assertions: ToolAssertion[] = [
      {
        toolName: "get_contact",
        description: "Returns name field with uppercase",
        input: { id: "c_001" },
        assert: () => false,
      },
    ];

    const results = await runPredicateAssertions(connection, assertions);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("fail");
    expect(results[0]?.message).toContain("Assertion failed");
  });

  it("errors when assert throws", async () => {
    const connection = createMockConnection();
    const assertions: ToolAssertion[] = [
      {
        toolName: "get_contact",
        description: "Throws on error",
        input: { id: "c_001" },
        assert: () => {
          throw new Error("Unexpected error in assert");
        },
      },
    ];

    const results = await runPredicateAssertions(connection, assertions);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("error");
    expect(results[0]?.message).toContain("Unexpected error in assert");
  });

  it("errors when tool call fails", async () => {
    const connection = createMockConnection();
    (connection.client.callTool as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Connection lost"),
    );

    const assertions: ToolAssertion[] = [
      {
        toolName: "broken_tool",
        description: "Handles connection failure",
        input: {},
        assert: () => true,
      },
    ];

    const results = await runPredicateAssertions(connection, assertions);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("error");
    expect(results[0]?.message).toContain("Connection lost");
  });

  it("supports async assert functions", async () => {
    const connection = createMockConnection();
    const assertions: ToolAssertion[] = [
      {
        toolName: "get_contact",
        description: "Async assert",
        input: { id: "c_001" },
        assert: async (result) => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          return result.text !== undefined;
        },
      },
    ];

    const results = await runPredicateAssertions(connection, assertions);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("pass");
  });

  it("includes input and output in results", async () => {
    const connection = createMockConnection();
    const assertions: ToolAssertion[] = [
      {
        toolName: "get_contact",
        description: "Has output",
        input: { id: "c_001" },
        assert: () => true,
      },
    ];

    const results = await runPredicateAssertions(connection, assertions);
    expect(results[0]?.input).toEqual({ id: "c_001" });
    expect(results[0]?.output).toBeDefined();
  });
});

describe("runJudgeAssertions", () => {
  it("passes when judge returns pass: true", async () => {
    const connection = createMockConnection();
    const assertions: JudgeAssertion[] = [
      {
        toolName: "search_contacts",
        description: "Returns relevant results",
        input: { query: "Jane" },
        expectation: "Results should contain contacts matching 'Jane'",
        judge: async () => ({ pass: true, reason: "Results match the query" }),
      },
    ];

    const results = await runJudgeAssertions(connection, assertions);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("pass");
  });

  it("fails when judge returns pass: false", async () => {
    const connection = createMockConnection();
    const assertions: JudgeAssertion[] = [
      {
        toolName: "search_contacts",
        description: "Returns relevant results",
        input: { query: "Jane" },
        expectation: "Results should match",
        judge: async () => ({ pass: false, reason: "No matching results found" }),
      },
    ];

    const results = await runJudgeAssertions(connection, assertions);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("fail");
    expect(results[0]?.message).toContain("No matching results found");
  });

  it("errors when judge throws", async () => {
    const connection = createMockConnection();
    const assertions: JudgeAssertion[] = [
      {
        toolName: "search_contacts",
        description: "Judge errors",
        input: { query: "Jane" },
        expectation: "Test",
        judge: async () => {
          throw new Error("LLM API unavailable");
        },
      },
    ];

    const results = await runJudgeAssertions(connection, assertions);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("error");
    expect(results[0]?.message).toContain("LLM API unavailable");
  });

  it("passes expectation to judge function", async () => {
    const connection = createMockConnection();
    const judgeSpy = vi.fn().mockResolvedValue({ pass: true, reason: "ok" });

    const assertions: JudgeAssertion[] = [
      {
        toolName: "get_contact",
        description: "Check expectation",
        input: { id: "c_001" },
        expectation: "Should return a contact with a name field",
        judge: judgeSpy,
      },
    ];

    await runJudgeAssertions(connection, assertions);
    expect(judgeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "get_contact",
        expectation: "Should return a contact with a name field",
      }),
    );
  });
});
