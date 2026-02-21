import { resolve } from "node:path";
import { unlinkSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readMcpConfig } from "./mcp-client.js";

describe("readMcpConfig", () => {
  it("auto-selects the only server when --server is not given", () => {
    const tmpPath = resolve(import.meta.dirname, "__tmp_config_single.json");
    writeFileSync(
      tmpPath,
      JSON.stringify({
        mcpServers: {
          myserver: { command: "node", args: ["server.js"] },
        },
      }),
      "utf-8",
    );
    try {
      const result = readMcpConfig(tmpPath, undefined);
      expect(result.transport).toBe("stdio");
      expect(result.command).toBe("node");
      expect(result.args).toEqual(["server.js"]);
    } finally {
      unlinkSync(tmpPath);
    }
  });

  it("selects the named server when --server is given", () => {
    const tmpPath = resolve(import.meta.dirname, "__tmp_config_multi.json");
    writeFileSync(
      tmpPath,
      JSON.stringify({
        mcpServers: {
          server1: { command: "node", args: ["a.js"] },
          server2: { url: "http://localhost:3000/mcp" },
        },
      }),
      "utf-8",
    );
    try {
      const result = readMcpConfig(tmpPath, "server2");
      expect(result.transport).toBe("streamable-http");
      expect(result.url).toBe("http://localhost:3000/mcp");
    } finally {
      unlinkSync(tmpPath);
    }
  });

  it("errors when multiple servers and no --server given", () => {
    const tmpPath = resolve(import.meta.dirname, "__tmp_config_multi2.json");
    writeFileSync(
      tmpPath,
      JSON.stringify({
        mcpServers: {
          a: { command: "a" },
          b: { command: "b" },
        },
      }),
      "utf-8",
    );
    try {
      expect(() => readMcpConfig(tmpPath, undefined)).toThrow("Multiple servers in config");
    } finally {
      unlinkSync(tmpPath);
    }
  });

  it("errors when server name is not found in config", () => {
    const tmpPath = resolve(import.meta.dirname, "__tmp_config_missing.json");
    writeFileSync(
      tmpPath,
      JSON.stringify({
        mcpServers: {
          real: { command: "node" },
        },
      }),
      "utf-8",
    );
    try {
      expect(() => readMcpConfig(tmpPath, "fake")).toThrow('Server "fake" not found');
    } finally {
      unlinkSync(tmpPath);
    }
  });

  it("errors when config file does not exist", () => {
    expect(() => readMcpConfig("/nonexistent/mcp.json", undefined)).toThrow("Failed to read config file");
  });

  it("errors when config has invalid JSON", () => {
    const tmpPath = resolve(import.meta.dirname, "__tmp_config_invalid.json");
    writeFileSync(tmpPath, "not json", "utf-8");
    try {
      expect(() => readMcpConfig(tmpPath, undefined)).toThrow("Invalid JSON");
    } finally {
      unlinkSync(tmpPath);
    }
  });

  it("errors when config is missing mcpServers", () => {
    const tmpPath = resolve(import.meta.dirname, "__tmp_config_noservers.json");
    writeFileSync(tmpPath, JSON.stringify({}), "utf-8");
    try {
      expect(() => readMcpConfig(tmpPath, undefined)).toThrow('missing "mcpServers"');
    } finally {
      unlinkSync(tmpPath);
    }
  });

  it("resolves env from config entry", () => {
    const tmpPath = resolve(import.meta.dirname, "__tmp_config_env.json");
    writeFileSync(
      tmpPath,
      JSON.stringify({
        mcpServers: {
          myserver: { command: "node", env: { API_KEY: "secret" } },
        },
      }),
      "utf-8",
    );
    try {
      const result = readMcpConfig(tmpPath, undefined);
      expect(result.env).toEqual({ API_KEY: "secret" });
    } finally {
      unlinkSync(tmpPath);
    }
  });
});
