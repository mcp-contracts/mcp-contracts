import { unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { listConfigServers, readMcpConfig } from "./mcp-config.js";

/**
 * Writes a temp config file, runs the callback, and cleans up.
 *
 * @param name - Unique temp file name.
 * @param content - The config content (object or raw string).
 * @param fn - Callback receiving the temp file path.
 */
function withConfig(name: string, content: unknown, fn: (path: string) => void): void {
  const tmpPath = resolve(import.meta.dirname, name);
  writeFileSync(tmpPath, typeof content === "string" ? content : JSON.stringify(content), "utf-8");
  try {
    fn(tmpPath);
  } finally {
    unlinkSync(tmpPath);
  }
}

describe("readMcpConfig", () => {
  it("auto-selects the only server when --server is not given", () => {
    withConfig(
      "__tmp_config_single.json",
      { mcpServers: { myserver: { command: "node", args: ["server.js"] } } },
      (path) => {
        const result = readMcpConfig(path, undefined);
        expect(result.transport).toBe("stdio");
        expect(result.command).toBe("node");
        expect(result.args).toEqual(["server.js"]);
      },
    );
  });

  it("selects the named server when --server is given", () => {
    withConfig(
      "__tmp_config_multi.json",
      {
        mcpServers: {
          server1: { command: "node", args: ["a.js"] },
          server2: { url: "http://localhost:3000/mcp" },
        },
      },
      (path) => {
        const result = readMcpConfig(path, "server2");
        expect(result.transport).toBe("streamable-http");
        expect(result.url).toBe("http://localhost:3000/mcp");
      },
    );
  });

  it("errors when multiple servers and no --server given", () => {
    withConfig(
      "__tmp_config_multi2.json",
      { mcpServers: { a: { command: "a" }, b: { command: "b" } } },
      (path) => {
        expect(() => readMcpConfig(path, undefined)).toThrow("Multiple servers in config");
      },
    );
  });

  it("errors when server name is not found in config", () => {
    withConfig(
      "__tmp_config_missing.json",
      { mcpServers: { real: { command: "node" } } },
      (path) => {
        expect(() => readMcpConfig(path, "fake")).toThrow('Server "fake" not found');
      },
    );
  });

  it("errors when config file does not exist", () => {
    expect(() => readMcpConfig("/nonexistent/mcp.json", undefined)).toThrow(
      "Failed to read config file",
    );
  });

  it("errors when config has invalid JSON", () => {
    withConfig("__tmp_config_invalid.json", "not json", (path) => {
      expect(() => readMcpConfig(path, undefined)).toThrow("Invalid JSON");
    });
  });

  it("errors when config is missing mcpServers", () => {
    withConfig("__tmp_config_noservers.json", {}, (path) => {
      expect(() => readMcpConfig(path, undefined)).toThrow('missing "mcpServers"');
    });
  });

  it("errors when config has no server entries", () => {
    withConfig("__tmp_config_empty.json", { mcpServers: {} }, (path) => {
      expect(() => readMcpConfig(path, undefined)).toThrow("no server entries");
    });
  });

  it("resolves env from config entry", () => {
    withConfig(
      "__tmp_config_env.json",
      { mcpServers: { myserver: { command: "node", env: { API_KEY: "secret" } } } },
      (path) => {
        expect(readMcpConfig(path, undefined).env).toEqual({ API_KEY: "secret" });
      },
    );
  });
});

describe("listConfigServers", () => {
  it("returns all servers with resolved transports, ordered by name", () => {
    withConfig(
      "__tmp_config_list.json",
      {
        mcpServers: {
          zeta: { url: "http://localhost:3000/mcp" },
          alpha: { command: "node", args: ["a.js"], env: { KEY: "v" } },
        },
      },
      (path) => {
        const servers = listConfigServers(path);
        expect(servers.map((s) => s.name)).toEqual(["alpha", "zeta"]);
        expect(servers[0]?.transport).toEqual({
          transport: "stdio",
          command: "node",
          args: ["a.js"],
          env: { KEY: "v" },
        });
        expect(servers[1]?.transport).toEqual({
          transport: "streamable-http",
          url: "http://localhost:3000/mcp",
        });
      },
    );
  });

  it("errors when a server entry has neither command nor url", () => {
    withConfig("__tmp_config_bad_entry.json", { mcpServers: { broken: {} } }, (path) => {
      expect(() => listConfigServers(path)).toThrow(
        'Server "broken" has neither "command" nor "url"',
      );
    });
  });

  it("errors when config has no server entries", () => {
    withConfig("__tmp_config_list_empty.json", { mcpServers: {} }, (path) => {
      expect(() => listConfigServers(path)).toThrow("no server entries");
    });
  });
});
