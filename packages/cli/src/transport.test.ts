import { writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { addTransportOptions, resolveTransport } from "./transport.js";

describe("resolveTransport", () => {
  it("resolves --command to stdio transport", () => {
    const result = resolveTransport({ command: "node server.js" });
    expect(result.transport).toBe("stdio");
    expect(result.command).toBe("node server.js");
  });

  it("resolves --url to streamable-http transport", () => {
    const result = resolveTransport({ url: "http://localhost:3000/mcp" });
    expect(result.transport).toBe("streamable-http");
    expect(result.url).toBe("http://localhost:3000/mcp");
  });

  it("resolves --config by delegating to readMcpConfig", () => {
    const configPath = resolve(import.meta.dirname, "__tmp_transport_test.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          myserver: { command: "node", args: ["server.js"] },
        },
      }),
      "utf-8",
    );
    try {
      const result = resolveTransport({ config: configPath });
      expect(result.transport).toBe("stdio");
      expect(result.command).toBe("node");
      expect(result.args).toEqual(["server.js"]);
    } finally {
      unlinkSync(configPath);
    }
  });

  it("errors when no transport specified", () => {
    expect(() => resolveTransport({})).toThrow("Specify one of");
  });

  it("errors when multiple transports specified", () => {
    expect(() =>
      resolveTransport({ command: "node", url: "http://localhost:3000" }),
    ).toThrow("Specify only one of");
  });

  it("passes --args through for stdio", () => {
    const result = resolveTransport({
      command: "node",
      args: ["server.js", "--port", "3000"],
    });
    expect(result.args).toEqual(["server.js", "--port", "3000"]);
  });

  it("parses --env KEY=VALUE pairs for stdio", () => {
    const result = resolveTransport({
      command: "node",
      env: ["API_KEY=secret", "DEBUG=true"],
    });
    expect(result.env).toEqual({ API_KEY: "secret", DEBUG: "true" });
  });

  it("omits env when not provided", () => {
    const result = resolveTransport({ command: "node" });
    expect(result.env).toBeUndefined();
  });
});

describe("addTransportOptions", () => {
  it("adds all 6 transport options to a command", () => {
    const cmd = new Command("test");
    addTransportOptions(cmd);

    const optionNames = cmd.options.map((o) => o.long);
    expect(optionNames).toContain("--command");
    expect(optionNames).toContain("--args");
    expect(optionNames).toContain("--url");
    expect(optionNames).toContain("--config");
    expect(optionNames).toContain("--server");
    expect(optionNames).toContain("--env");
  });

  it("returns the command for chaining", () => {
    const cmd = new Command("test");
    const result = addTransportOptions(cmd);
    expect(result).toBe(cmd);
  });
});
