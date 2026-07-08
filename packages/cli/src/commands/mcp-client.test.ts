import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
