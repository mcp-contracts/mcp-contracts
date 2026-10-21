import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureServerData } from "./mcp-client.js";

describe("connectToServer transport creation", () => {
  let mockSSE: ReturnType<typeof vi.fn>;
  let mockHTTP: ReturnType<typeof vi.fn>;
  let mockConnect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    mockSSE = vi.fn();
    mockHTTP = vi.fn();
    mockConnect = vi.fn().mockResolvedValue(undefined);

    vi.doMock("@modelcontextprotocol/sdk/client/sse.js", () => ({
      SSEClientTransport: mockSSE,
    }));
    vi.doMock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
      StreamableHTTPClientTransport: mockHTTP,
    }));
    vi.doMock("@modelcontextprotocol/sdk/client/index.js", () => {
      function MockClient() {
        return { connect: mockConnect };
      }
      return { Client: MockClient };
    });
    vi.doMock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
      StdioClientTransport: vi.fn(),
      getDefaultEnvironment: () => ({}),
    }));
    vi.doMock("@modelcontextprotocol/sdk/types.js", () => ({
      LATEST_PROTOCOL_VERSION: "2025-03-26",
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates SSEClientTransport for sse transport type", async () => {
    const { connectToServer } = await import("./mcp-client.js");

    await connectToServer({ transport: "sse", url: "http://localhost:3000/sse" });

    expect(mockSSE).toHaveBeenCalledWith(expect.any(URL), {});
  });

  it("passes headers to SSEClientTransport", async () => {
    const { connectToServer } = await import("./mcp-client.js");

    await connectToServer({
      transport: "sse",
      url: "http://localhost:3000/sse",
      headers: { Authorization: "Bearer token" },
    });

    expect(mockSSE).toHaveBeenCalledWith(expect.any(URL), {
      requestInit: { headers: { Authorization: "Bearer token" } },
    });
  });

  it("passes headers to StreamableHTTPClientTransport", async () => {
    const { connectToServer } = await import("./mcp-client.js");

    await connectToServer({
      transport: "streamable-http",
      url: "http://localhost:3000/mcp",
      headers: { "X-Api-Key": "secret" },
    });

    expect(mockHTTP).toHaveBeenCalledWith(expect.any(URL), {
      requestInit: { headers: { "X-Api-Key": "secret" } },
    });
  });

  it("does not pass requestInit when no headers", async () => {
    const { connectToServer } = await import("./mcp-client.js");

    await connectToServer({
      transport: "streamable-http",
      url: "http://localhost:3000/mcp",
    });

    expect(mockHTTP).toHaveBeenCalledWith(expect.any(URL));
  });
});

describe("captureServerData", () => {
  const alpha = { name: "alpha", description: "A", inputSchema: { type: "object" } };
  const beta = { name: "beta", description: "B", inputSchema: { type: "object" } };

  function fakeClient(overrides: Record<string, unknown>): Client {
    return {
      getServerCapabilities: () => ({ tools: {} }),
      listTools: vi.fn().mockResolvedValue({ tools: [] }),
      listResources: vi.fn().mockResolvedValue({ resources: [] }),
      listResourceTemplates: vi.fn().mockResolvedValue({ resourceTemplates: [] }),
      listPrompts: vi.fn().mockResolvedValue({ prompts: [] }),
      ...overrides,
    } as unknown as Client;
  }

  it("captures tools across pages when discovery succeeds", async () => {
    const listTools = vi
      .fn()
      .mockResolvedValueOnce({ tools: [alpha], nextCursor: "second-page" })
      .mockResolvedValueOnce({ tools: [beta] });
    const data = await captureServerData(fakeClient({ listTools }));
    expect(data.tools.map((t) => t.name)).toEqual(["alpha", "beta"]);
    expect(listTools).toHaveBeenLastCalledWith({ cursor: "second-page" });
  });

  it("rejects when tools/list fails instead of returning an empty list", async () => {
    const listTools = vi.fn().mockRejectedValue(new Error("MCP error -32603: boom"));
    await expect(captureServerData(fakeClient({ listTools }))).rejects.toThrow(
      "Discovery incomplete — failed to list tools: MCP error -32603: boom",
    );
  });

  it("rejects when a later page of tools/list fails", async () => {
    const listTools = vi
      .fn()
      .mockResolvedValueOnce({ tools: [alpha], nextCursor: "second-page" })
      .mockRejectedValueOnce(new Error("page two failed"));
    await expect(captureServerData(fakeClient({ listTools }))).rejects.toThrow(
      "failed to list tools: page two failed",
    );
  });

  it("reports every failed capability in one error", async () => {
    const client = fakeClient({
      getServerCapabilities: () => ({ tools: {}, resources: {}, prompts: {} }),
      listResources: vi.fn().mockRejectedValue(new Error("no resources")),
      listPrompts: vi.fn().mockRejectedValue(new Error("no prompts")),
    });
    await expect(captureServerData(client)).rejects.toThrow(
      "failed to list resources: no resources; prompts: no prompts",
    );
  });

  it("skips capabilities the server does not advertise", async () => {
    const listTools = vi.fn();
    const client = fakeClient({ getServerCapabilities: () => ({}), listTools });
    const data = await captureServerData(client);
    expect(data).toEqual({ tools: [], resources: [], resourceTemplates: [], prompts: [] });
    expect(listTools).not.toHaveBeenCalled();
  });
});
