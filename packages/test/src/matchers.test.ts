import { describe, expect, it } from "vitest";
import { createTestServer } from "./matchers.js";

describe("createTestServer", () => {
  it("creates a managed server with config", () => {
    const server = createTestServer({
      transport: "stdio",
      command: "node",
      args: ["server.js"],
    });

    expect(server.config.transport).toBe("stdio");
    expect(server.config.command).toBe("node");
  });

  it("throws when getConnection called before connect", () => {
    const server = createTestServer({
      transport: "stdio",
      command: "node",
      args: ["server.js"],
    });

    expect(() => server.getConnection()).toThrow("Not connected");
  });

  it("disconnect is safe to call when not connected", async () => {
    const server = createTestServer({
      transport: "stdio",
      command: "node",
      args: ["server.js"],
    });

    // Should not throw
    await server.disconnect();
  });
});

describe("setupMatchers", () => {
  it("is exported and callable", async () => {
    const { setupMatchers } = await import("./matchers.js");
    expect(typeof setupMatchers).toBe("function");
  });

  it("registers matchers when given expect", async () => {
    const { setupMatchers } = await import("./matchers.js");
    // Pass vitest's expect to register matchers
    setupMatchers(expect);
  });

  it("throws without valid expect", async () => {
    const { setupMatchers } = await import("./matchers.js");
    expect(() => setupMatchers({} as never)).toThrow("expect with extend()");
  });
});
