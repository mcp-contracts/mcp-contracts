import { describe, expect, it, vi } from "vitest";
import type { TestConnection, ToolCallResult } from "./types.js";

/**
 * Tests for mcp-client.ts.
 *
 * Since the module wraps the MCP SDK (which requires real server connections),
 * we test the callServerTool normalization and captureServerData orchestration
 * using a mock Client interface.
 */

function createMockConnection(overrides?: {
  tools?: Array<{ name: string; description?: string; inputSchema: Record<string, unknown> }>;
  capabilities?: Record<string, unknown>;
  callToolResult?: Record<string, unknown>;
}): TestConnection {
  const tools = overrides?.tools ?? [];
  const capabilities = overrides?.capabilities ?? { tools: {} };
  const callToolResult = overrides?.callToolResult ?? {
    content: [{ type: "text", text: "ok" }],
  };

  const client = {
    connect: vi.fn().mockResolvedValue(undefined),
    getServerVersion: () => ({ name: "test", version: "1.0" }),
    getServerCapabilities: () => capabilities,
    listTools: vi.fn().mockResolvedValue({ tools, nextCursor: undefined }),
    listResources: vi.fn().mockResolvedValue({ resources: [], nextCursor: undefined }),
    listResourceTemplates: vi
      .fn()
      .mockResolvedValue({ resourceTemplates: [], nextCursor: undefined }),
    listPrompts: vi.fn().mockResolvedValue({ prompts: [], nextCursor: undefined }),
    callTool: vi.fn().mockResolvedValue(callToolResult),
  };

  const transport = {
    close: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
  };

  return {
    client: client as unknown as TestConnection["client"],
    transport: transport as unknown as TestConnection["transport"],
    serverName: "test",
    serverVersion: "1.0",
    protocolVersion: "2025-11-25",
  };
}

describe("listServerTools", () => {
  it("lists tools from the server", async () => {
    const { listServerTools } = await import("./mcp-client.js");
    const connection = createMockConnection({
      tools: [
        {
          name: "my_tool",
          description: "A tool",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    });

    const tools = await listServerTools(connection);
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe("my_tool");
    expect(tools[0]?.description).toBe("A tool");
  });

  it("handles pagination", async () => {
    const { listServerTools } = await import("./mcp-client.js");
    const connection = createMockConnection();

    const mockListTools = vi
      .fn()
      .mockResolvedValueOnce({
        tools: [
          { name: "tool1", description: "First", inputSchema: { type: "object", properties: {} } },
        ],
        nextCursor: "page2",
      })
      .mockResolvedValueOnce({
        tools: [
          {
            name: "tool2",
            description: "Second",
            inputSchema: { type: "object", properties: {} },
          },
        ],
        nextCursor: undefined,
      });

    (connection.client as unknown as { listTools: typeof mockListTools }).listTools = mockListTools;

    const tools = await listServerTools(connection);
    expect(tools).toHaveLength(2);
    expect(tools[0]?.name).toBe("tool1");
    expect(tools[1]?.name).toBe("tool2");
    expect(mockListTools).toHaveBeenCalledTimes(2);
  });
});

describe("captureServerData", () => {
  it("captures tools when server has tool capability", async () => {
    const { captureServerData } = await import("./mcp-client.js");
    const connection = createMockConnection({
      capabilities: { tools: {} },
      tools: [{ name: "t1", description: "desc", inputSchema: { type: "object", properties: {} } }],
    });

    const data = await captureServerData(connection);
    expect(data.tools).toHaveLength(1);
    expect(data.resources).toHaveLength(0);
    expect(data.prompts).toHaveLength(0);
  });

  it("skips tools when no tool capability", async () => {
    const { captureServerData } = await import("./mcp-client.js");
    const connection = createMockConnection({
      capabilities: {},
      tools: [{ name: "t1", description: "desc", inputSchema: { type: "object", properties: {} } }],
    });

    const data = await captureServerData(connection);
    expect(data.tools).toHaveLength(0);
  });
});

describe("callServerTool", () => {
  it("normalizes a successful tool call", async () => {
    const { callServerTool } = await import("./mcp-client.js");
    const connection = createMockConnection({
      callToolResult: {
        content: [{ type: "text", text: '{"id": "c_001"}' }],
      },
    });

    const result: ToolCallResult = await callServerTool(connection, "get_contact", { id: "c_001" });
    expect(result.isError).toBe(false);
    expect(result.text).toBe('{"id": "c_001"}');
    expect(result.content).toHaveLength(1);
  });

  it("normalizes an error tool call", async () => {
    const { callServerTool } = await import("./mcp-client.js");
    const connection = createMockConnection({
      callToolResult: {
        isError: true,
        content: [{ type: "text", text: "Not found" }],
      },
    });

    const result = await callServerTool(connection, "get_contact", { id: "bad" });
    expect(result.isError).toBe(true);
    expect(result.text).toBe("Not found");
  });

  it("handles empty content", async () => {
    const { callServerTool } = await import("./mcp-client.js");
    const connection = createMockConnection({
      callToolResult: { content: [] },
    });

    const result = await callServerTool(connection, "some_tool", {});
    expect(result.isError).toBe(false);
    expect(result.text).toBeUndefined();
    expect(result.content).toHaveLength(0);
  });

  it("extracts structured content", async () => {
    const { callServerTool } = await import("./mcp-client.js");
    const connection = createMockConnection({
      callToolResult: {
        content: [{ type: "text", text: "ok" }],
        structuredContent: { result: "success" },
      },
    });

    const result = await callServerTool(connection, "some_tool", {});
    expect(result.structuredContent).toEqual({ result: "success" });
  });
});

describe("closeConnection", () => {
  it("closes the transport", async () => {
    const { closeConnection } = await import("./mcp-client.js");
    const connection = createMockConnection();

    await closeConnection(connection);
    expect(connection.transport.close).toHaveBeenCalled();
  });
});
