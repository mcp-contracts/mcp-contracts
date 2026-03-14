import { unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { addTransportOptions, parseHeaders, resolveTransport } from "./transport.js";

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

  it("resolves --url with --sse to sse transport", () => {
    const result = resolveTransport({ url: "http://localhost:3000/sse", sse: true });
    expect(result.transport).toBe("sse");
    expect(result.url).toBe("http://localhost:3000/sse");
  });

  it("errors when --sse is used without --url", () => {
    expect(() => resolveTransport({ command: "node", sse: true })).toThrow("--sse requires --url");
  });

  it("passes --header through as parsed headers", () => {
    const result = resolveTransport({
      url: "http://localhost:3000/mcp",
      header: ["Authorization: Bearer token123"],
    });
    expect(result.headers).toEqual({ Authorization: "Bearer token123" });
  });

  it("passes headers with --sse transport", () => {
    const result = resolveTransport({
      url: "http://localhost:3000/sse",
      sse: true,
      header: ["X-Api-Key: mykey"],
    });
    expect(result.transport).toBe("sse");
    expect(result.headers).toEqual({ "X-Api-Key": "mykey" });
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

  it("merges headers into config-resolved transport", () => {
    const configPath = resolve(import.meta.dirname, "__tmp_transport_headers.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          myserver: { url: "http://localhost:3000/mcp" },
        },
      }),
      "utf-8",
    );
    try {
      const result = resolveTransport({
        config: configPath,
        header: ["Authorization: Bearer tok"],
      });
      expect(result.transport).toBe("streamable-http");
      expect(result.headers).toEqual({ Authorization: "Bearer tok" });
    } finally {
      unlinkSync(configPath);
    }
  });

  it("errors when no transport specified", () => {
    expect(() => resolveTransport({})).toThrow("Specify one of");
  });

  it("errors when multiple transports specified", () => {
    expect(() => resolveTransport({ command: "node", url: "http://localhost:3000" })).toThrow(
      "Specify only one of",
    );
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

describe("parseHeaders", () => {
  it("parses a single header", () => {
    expect(parseHeaders(["Authorization: Bearer token"])).toEqual({
      Authorization: "Bearer token",
    });
  });

  it("parses multiple headers", () => {
    expect(parseHeaders(["Authorization: Bearer token", "X-Api-Key: abc"])).toEqual({
      Authorization: "Bearer token",
      "X-Api-Key": "abc",
    });
  });

  it("handles values with colons", () => {
    expect(parseHeaders(["X-Data: foo:bar:baz"])).toEqual({ "X-Data": "foo:bar:baz" });
  });

  it("trims whitespace around key and value", () => {
    expect(parseHeaders(["  Content-Type :  application/json  "])).toEqual({
      "Content-Type": "application/json",
    });
  });

  it("errors on missing colon", () => {
    expect(() => parseHeaders(["InvalidHeader"])).toThrow('Invalid header "InvalidHeader"');
  });

  it("errors on empty header name", () => {
    expect(() => parseHeaders([": value"])).toThrow("empty header name");
  });
});

describe("addTransportOptions", () => {
  it("adds all transport options to a command", () => {
    const cmd = new Command("test");
    addTransportOptions(cmd);

    const optionNames = cmd.options.map((o) => o.long);
    expect(optionNames).toContain("--command");
    expect(optionNames).toContain("--args");
    expect(optionNames).toContain("--url");
    expect(optionNames).toContain("--sse");
    expect(optionNames).toContain("--header");
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
