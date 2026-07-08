import type { MCPContractSnapshot } from "@mcp-contracts/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigServer } from "../mcp-config.js";
import { captureAllServers } from "./capture-all.js";

vi.mock("./capture.js", () => ({
  captureSnapshot: vi.fn(async ({ transport }: { transport: { command?: string } }) => {
    if (transport.command === "fail") {
      throw new Error("connection refused");
    }
    const snapshot = {
      snapshotVersion: "1.0.0",
      capturedAt: "2026-01-01T00:00:00.000Z",
      contentHash: "sha256:abc",
      server: {
        name: transport.command ?? "remote",
        version: "1.0.0",
        protocolVersion: "2025-03-26",
        capabilities: {},
      },
      capture: { transport: "stdio", tool: "mcpdiff/test" },
      tools: { some_tool: { description: "A tool", inputSchema: { type: "object" } } },
      resources: {},
      prompts: {},
    } as MCPContractSnapshot;
    return { snapshot, serverName: snapshot.server.name, serverVersion: "1.0.0" };
  }),
}));

function server(name: string, command: string): ConfigServer {
  return { name, transport: { transport: "stdio", command } };
}

describe("captureAllServers", () => {
  let stderrData: string;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

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

  it("captures all servers and orders entries by name", async () => {
    const result = await captureAllServers(
      [server("zeta", "z-server"), server("alpha", "a-server")],
      true,
    );
    expect(result.entries.map((e) => e.serverName)).toEqual(["alpha", "zeta"]);
    expect(result.failures).toHaveLength(0);
  });

  it("collects failures without dropping successful captures", async () => {
    const result = await captureAllServers(
      [server("good", "ok-server"), server("bad", "fail")],
      true,
    );
    expect(result.entries.map((e) => e.serverName)).toEqual(["good"]);
    expect(result.failures).toEqual([{ serverName: "bad", error: "connection refused" }]);
  });

  it("reports per-server progress on stderr unless quiet", async () => {
    await captureAllServers([server("good", "ok-server"), server("bad", "fail")], false);
    expect(stderrData).toContain("Connecting to 2 servers...");
    expect(stderrData).toContain("✓ good: captured (1 tools)");
    expect(stderrData).toContain("✗ bad: connection refused");
  });

  it("suppresses progress output when quiet", async () => {
    await captureAllServers([server("good", "ok-server")], true);
    expect(stderrData).toBe("");
  });

  it("handles an empty server list", async () => {
    const result = await captureAllServers([], true);
    expect(result.entries).toHaveLength(0);
    expect(result.failures).toHaveLength(0);
  });
});
