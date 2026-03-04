import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

vi.mock("./mcp-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./mcp-client.js")>();
  return {
    ...actual,
    connectToServer: vi.fn().mockResolvedValue({
      client: {
        getServerVersion: () => ({ name: "test-server", version: "2.0.0" }),
        getServerCapabilities: () => ({ tools: {}, resources: {} }),
      },
      transport: {
        close: vi.fn().mockResolvedValue(undefined),
      },
      protocolVersion: "2025-03-26",
    }),
    captureServerData: vi.fn().mockResolvedValue({
      tools: [
        {
          name: "my_tool",
          description: "A tool",
          inputSchema: { type: "object", properties: {} },
        },
      ],
      resources: [],
      resourceTemplates: [],
      prompts: [],
    }),
  };
});

import { captureSnapshot } from "./capture.js";

describe("captureSnapshot", () => {
  let stderrData: string;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    stderrData = "";
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrData += String(chunk);
      return true;
    });
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it("returns a valid snapshot with server metadata", async () => {
    const result = await captureSnapshot({
      transport: { transport: "stdio", command: "node", args: ["server.js"] },
    });

    expect(result.serverName).toBe("test-server");
    expect(result.serverVersion).toBe("2.0.0");
    expect(result.snapshot.snapshotVersion).toBe("1.0.0");
    expect(result.snapshot.server.name).toBe("test-server");
    expect(result.snapshot.tools).toHaveProperty("my_tool");
    expect(result.snapshot.contentHash).toMatch(/^sha256:/);
  });

  it("sets capture.transport and capture.source for stdio", async () => {
    const result = await captureSnapshot({
      transport: { transport: "stdio", command: "node", args: ["server.js"] },
    });

    expect(result.snapshot.capture.transport).toBe("stdio");
    expect(result.snapshot.capture.source).toBe("node server.js");
  });

  it("sets capture.source to URL for http transport", async () => {
    const result = await captureSnapshot({
      transport: { transport: "streamable-http", url: "http://localhost:3000/mcp" },
    });

    expect(result.snapshot.capture.transport).toBe("streamable-http");
    expect(result.snapshot.capture.source).toBe("http://localhost:3000/mcp");
  });

  it("prints connection messages when not quiet", async () => {
    await captureSnapshot({
      transport: { transport: "stdio", command: "node" },
      quiet: false,
    });

    expect(stderrData).toContain("Connecting to MCP server");
    expect(stderrData).toContain("Connected to test-server v2.0.0");
  });

  it("suppresses output when quiet", async () => {
    await captureSnapshot({
      transport: { transport: "stdio", command: "node" },
      quiet: true,
    });

    expect(stderrData).toBe("");
  });
});
