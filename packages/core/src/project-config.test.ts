import { describe, expect, it } from "vitest";
import {
  isProjectServerCommand,
  isProjectServerConfigRef,
  isProjectServerUrl,
  PROJECT_CONFIG_FILENAME,
  parseProjectConfig,
} from "./project-config.js";

describe("parseProjectConfig", () => {
  it("accepts an empty config", () => {
    expect(parseProjectConfig({})).toEqual({});
  });

  it("accepts a full command-based config", () => {
    const config = parseProjectConfig({
      server: { command: "node", args: ["dist/index.js"], env: { API_KEY: "secret" } },
      baseline: "contracts/baseline.mcpc.json",
      failOn: "breaking",
      watch: { paths: ["src"], debounce: 500 },
    });
    expect(config.baseline).toBe("contracts/baseline.mcpc.json");
    expect(config.failOn).toBe("breaking");
    expect(config.watch).toEqual({ paths: ["src"], debounce: 500 });
    expect(config.server).toEqual({
      command: "node",
      args: ["dist/index.js"],
      env: { API_KEY: "secret" },
    });
  });

  it("accepts a url-based server with sse and headers", () => {
    const config = parseProjectConfig({
      server: {
        url: "http://localhost:3000/mcp",
        sse: true,
        headers: { Authorization: "Bearer x" },
      },
    });
    expect(config.server).toEqual({
      url: "http://localhost:3000/mcp",
      sse: true,
      headers: { Authorization: "Bearer x" },
    });
  });

  it("accepts a config-reference server with a name", () => {
    const config = parseProjectConfig({
      server: { config: "./mcp.json", name: "my-server" },
    });
    expect(config.server).toEqual({ config: "./mcp.json", name: "my-server" });
  });

  it("accepts a baseline-only config", () => {
    expect(parseProjectConfig({ baseline: "contracts/baseline.mcpc.json" })).toEqual({
      baseline: "contracts/baseline.mcpc.json",
    });
  });

  it("rejects non-object data", () => {
    expect(() => parseProjectConfig("nope")).toThrow(/Invalid project config/);
    expect(() => parseProjectConfig(null)).toThrow(/Invalid project config/);
    expect(() => parseProjectConfig([])).toThrow(/Invalid project config/);
  });

  it("rejects unknown top-level keys, naming the key", () => {
    expect(() => parseProjectConfig({ failon: "breaking" })).toThrow(/failon/);
  });

  it("rejects unknown keys inside server", () => {
    expect(() => parseProjectConfig({ server: { command: "node", cmd: "node" } })).toThrow(/cmd/);
  });

  it("rejects unknown keys inside watch", () => {
    expect(() => parseProjectConfig({ watch: { path: ["src"] } })).toThrow(/path/);
  });

  it("rejects a server with no transport", () => {
    expect(() => parseProjectConfig({ server: {} })).toThrow(
      /exactly one of "command", "url", or "config"/,
    );
  });

  it("rejects a server with multiple transports", () => {
    expect(() =>
      parseProjectConfig({ server: { command: "node", url: "http://localhost:3000" } }),
    ).toThrow(/exactly one of "command", "url", or "config"/);
  });

  it("rejects args without command", () => {
    expect(() =>
      parseProjectConfig({ server: { url: "http://localhost:3000", args: ["x"] } }),
    ).toThrow(/"server.args": "args" is only valid with "command"/);
  });

  it("rejects env without command", () => {
    expect(() => parseProjectConfig({ server: { config: "./mcp.json", env: { A: "b" } } })).toThrow(
      /"env" is only valid with "command"/,
    );
  });

  it("rejects sse and headers without url", () => {
    expect(() => parseProjectConfig({ server: { command: "node", sse: true } })).toThrow(
      /"sse" is only valid with "url"/,
    );
    expect(() => parseProjectConfig({ server: { command: "node", headers: {} } })).toThrow(
      /"headers" is only valid with "url"/,
    );
  });

  it("rejects name without config", () => {
    expect(() => parseProjectConfig({ server: { command: "node", name: "x" } })).toThrow(
      /"name" is only valid with "config"/,
    );
  });

  it("rejects an invalid failOn value", () => {
    expect(() => parseProjectConfig({ failOn: "fatal" })).toThrow(/failOn/);
  });

  it("rejects an empty baseline", () => {
    expect(() => parseProjectConfig({ baseline: "" })).toThrow(/baseline/);
  });

  it("rejects invalid watch settings", () => {
    expect(() => parseProjectConfig({ watch: { paths: [] } })).toThrow(/paths/);
    expect(() => parseProjectConfig({ watch: { debounce: -1 } })).toThrow(/debounce/);
    expect(() => parseProjectConfig({ watch: { debounce: 1.5 } })).toThrow(/debounce/);
  });

  it("reports multiple issues in one message", () => {
    const attempt = () => parseProjectConfig({ failOn: "fatal", baseline: "" });
    expect(attempt).toThrow(/failOn/);
    expect(attempt).toThrow(/baseline/);
  });
});

describe("ProjectServer type guards", () => {
  it("discriminate the three variants", () => {
    const command = { command: "node" };
    const url = { url: "http://localhost:3000" };
    const configRef = { config: "./mcp.json" };

    expect(isProjectServerCommand(command)).toBe(true);
    expect(isProjectServerCommand(url)).toBe(false);
    expect(isProjectServerUrl(url)).toBe(true);
    expect(isProjectServerUrl(configRef)).toBe(false);
    expect(isProjectServerConfigRef(configRef)).toBe(true);
    expect(isProjectServerConfigRef(command)).toBe(false);
  });
});

describe("PROJECT_CONFIG_FILENAME", () => {
  it("is mcpcontracts.json", () => {
    expect(PROJECT_CONFIG_FILENAME).toBe("mcpcontracts.json");
  });
});
