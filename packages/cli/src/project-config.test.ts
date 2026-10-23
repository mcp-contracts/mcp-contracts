import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  discoverProjectConfig,
  expandEnvRefs,
  type LoadedProjectConfig,
  loadProjectConfig,
  resolveBaselinePath,
  resolveProjectPath,
  resolveProjectTransport,
  resolveTransportOrProject,
} from "./project-config.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mcpc-project-config-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeConfig(targetDir: string, config: unknown): string {
  const path = join(targetDir, "mcpcontracts.json");
  writeFileSync(path, JSON.stringify(config, null, 2), "utf-8");
  return path;
}

function loaded(config: Record<string, unknown>): LoadedProjectConfig {
  const path = writeConfig(dir, config);
  const result = loadProjectConfig(path);
  if (!result) {
    throw new Error("expected config to load");
  }
  return result;
}

describe("discoverProjectConfig", () => {
  it("finds the config in the start directory", () => {
    const path = writeConfig(dir, {});
    expect(discoverProjectConfig(dir)).toBe(resolve(path));
  });

  it("walks up to a parent directory", () => {
    const path = writeConfig(dir, {});
    const nested = join(dir, "a", "b");
    mkdirSync(nested, { recursive: true });
    expect(discoverProjectConfig(nested)).toBe(resolve(path));
  });

  it("prefers the nearest config", () => {
    writeConfig(dir, {});
    const nested = join(dir, "sub");
    mkdirSync(nested);
    const nearest = writeConfig(nested, {});
    expect(discoverProjectConfig(nested)).toBe(resolve(nearest));
  });

  it("returns null when no config exists", () => {
    expect(discoverProjectConfig(dir)).toBeNull();
  });
});

describe("loadProjectConfig", () => {
  it("returns null when discovery finds nothing", () => {
    expect(loadProjectConfig(undefined, dir)).toBeNull();
  });

  it("discovers and loads a valid config", () => {
    writeConfig(dir, { baseline: "contracts/baseline.mcpc.json" });
    const result = loadProjectConfig(undefined, dir);
    expect(result?.config.baseline).toBe("contracts/baseline.mcpc.json");
    expect(result?.dir).toBe(resolve(dir));
  });

  it("throws when an explicit path does not exist", () => {
    expect(() => loadProjectConfig(join(dir, "missing.json"))).toThrow(/not found/);
  });

  it("loads an explicit path relative to the cwd", () => {
    const nested = join(dir, "configs");
    mkdirSync(nested);
    writeConfig(nested, { failOn: "warning" });
    const result = loadProjectConfig(join("configs", "mcpcontracts.json"), dir);
    expect(result?.config.failOn).toBe("warning");
  });

  it("throws on invalid JSON, naming the file", () => {
    const path = join(dir, "mcpcontracts.json");
    writeFileSync(path, "{ not json", "utf-8");
    expect(() => loadProjectConfig(undefined, dir)).toThrow(path);
  });

  it("throws on an invalid config, naming the file and the key", () => {
    writeConfig(dir, { failon: "breaking" });
    const attempt = () => loadProjectConfig(undefined, dir);
    expect(attempt).toThrow(/failon/);
    expect(attempt).toThrow(/mcpcontracts\.json/);
  });
});

describe("resolveProjectTransport", () => {
  it("resolves a command server to stdio", () => {
    const project = loaded({
      server: { command: "node", args: ["server.js"], env: { A: "b" } },
    });
    expect(resolveProjectTransport(project)).toEqual({
      transport: "stdio",
      command: "node",
      args: ["server.js"],
      env: { A: "b" },
      cwd: project.dir,
    });
  });

  it("splits a command string into executable and arguments", () => {
    const project = loaded({ server: { command: "node server.js" } });
    expect(resolveProjectTransport(project)).toEqual({
      transport: "stdio",
      command: "node",
      args: ["server.js"],
      env: undefined,
      cwd: project.dir,
    });
  });

  it("resolves a url server to streamable-http or sse", () => {
    const http = loaded({ server: { url: "http://localhost:3000/mcp" } });
    expect(resolveProjectTransport(http)).toEqual({
      transport: "streamable-http",
      url: "http://localhost:3000/mcp",
      headers: undefined,
      displaySource: "http://localhost:3000/mcp",
    });

    const sse = loaded({
      server: { url: "http://localhost:3000/sse", sse: true, headers: { "X-Key": "v" } },
    });
    expect(resolveProjectTransport(sse)).toEqual({
      transport: "sse",
      url: "http://localhost:3000/sse",
      headers: { "X-Key": "v" },
      displaySource: "http://localhost:3000/sse",
    });
  });

  it("resolves a config reference relative to the project config", () => {
    writeFileSync(
      join(dir, "mcp.json"),
      JSON.stringify({ mcpServers: { alpha: { command: "node", args: ["a.js"] } } }),
      "utf-8",
    );
    const project = loaded({ server: { config: "./mcp.json", name: "alpha" } });
    expect(resolveProjectTransport(project)).toEqual({
      transport: "stdio",
      command: "node",
      args: ["a.js"],
      env: undefined,
      cwd: project.dir,
    });
  });

  it("throws when the config has no server block", () => {
    const project = loaded({ baseline: "b.mcpc.json" });
    expect(() => resolveProjectTransport(project)).toThrow(/no "server" block/);
  });
});

describe("resolveTransportOrProject", () => {
  it("uses the project server when no transport flags are given", () => {
    const project = loaded({ server: { command: "node", args: ["server.js"] } });
    const transport = resolveTransportOrProject({}, project);
    expect(transport).toEqual({
      transport: "stdio",
      command: "node",
      args: ["server.js"],
      env: undefined,
      cwd: project.dir,
    });
  });

  it("ignores the project server entirely when a transport flag is given", () => {
    const project = loaded({ server: { command: "node", args: ["config.js"] } });
    const transport = resolveTransportOrProject({ command: "deno" }, project);
    expect(transport).toEqual({
      transport: "stdio",
      command: "deno",
      args: undefined,
      env: undefined,
    });
  });

  it("does not merge partial flags with the project server", () => {
    const project = loaded({ server: { command: "node", args: ["config.js"] } });
    expect(() => resolveTransportOrProject({ args: ["other.js"] }, project)).toThrow(
      /Specify one of/,
    );
  });

  it("mentions the config file when it exists without a server block", () => {
    const project = loaded({ baseline: "b.mcpc.json" });
    expect(() => resolveTransportOrProject({}, project)).toThrow(/add a "server" block/);
  });

  it("suggests creating a config when none exists", () => {
    expect(() => resolveTransportOrProject({}, null)).toThrow(/mcpcontracts\.json/);
  });
});

describe("resolveBaselinePath", () => {
  it("prefers the flag value", () => {
    const project = loaded({ baseline: "contracts/baseline.mcpc.json" });
    expect(resolveBaselinePath("flag.mcpc.json", project)).toBe("flag.mcpc.json");
  });

  it("resolves the config baseline against the config directory", () => {
    const project = loaded({ baseline: "contracts/baseline.mcpc.json" });
    expect(resolveBaselinePath(undefined, project)).toBe(
      resolve(dir, "contracts/baseline.mcpc.json"),
    );
  });

  it("keeps an absolute config baseline as-is", () => {
    const absolute = join(dir, "abs.mcpc.json");
    const project = loaded({ baseline: absolute });
    expect(resolveBaselinePath(undefined, project)).toBe(absolute);
  });

  it("returns undefined when neither source has a baseline", () => {
    expect(resolveBaselinePath(undefined, null)).toBeUndefined();
    const project = loaded({ failOn: "warning" });
    expect(resolveBaselinePath(undefined, project)).toBeUndefined();
  });
});

describe("discoverProjectConfig stops at the repository root", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "mcpc-discover-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("does not walk past a directory containing .git", () => {
    writeFileSync(join(root, "mcpcontracts.json"), "{}");
    const repo = join(root, "repo");
    mkdirSync(join(repo, ".git"), { recursive: true });
    const nested = join(repo, "packages", "a");
    mkdirSync(nested, { recursive: true });
    expect(discoverProjectConfig(nested)).toBeNull();
  });

  it("still finds a config at the repository root itself", () => {
    const repo = join(root, "repo");
    mkdirSync(join(repo, ".git"), { recursive: true });
    writeFileSync(join(repo, "mcpcontracts.json"), "{}");
    expect(discoverProjectConfig(join(repo, "src"))).toBe(join(repo, "mcpcontracts.json"));
  });
});

describe("resolveProjectPath confinement warnings", () => {
  let dir: string;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mcpc-confine-"));
    mkdirSync(join(dir, "project"));
    stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stderr.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  function project(): LoadedProjectConfig {
    const projectDir = join(dir, "project");
    return { path: join(projectDir, "mcpcontracts.json"), dir: projectDir, config: {} };
  }

  it("is silent for a relative path inside the project", () => {
    expect(resolveProjectPath(project(), "contracts/baseline.mcpc.json", "baseline")).toBe(
      join(dir, "project", "contracts", "baseline.mcpc.json"),
    );
    expect(stderr).not.toHaveBeenCalled();
  });

  it("warns for a parent-traversal path", () => {
    resolveProjectPath(project(), "../outside.json", "baseline");
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('baseline "../outside.json"'));
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("outside the project directory"));
  });

  it("warns for an absolute path elsewhere", () => {
    resolveProjectPath(project(), join(dir, "elsewhere.json"), "watch.paths");
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("watch.paths"));
  });

  it("warns when a symlink inside the project resolves outside it", () => {
    mkdirSync(join(dir, "target"));
    symlinkSync(join(dir, "target"), join(dir, "project", "contracts"));
    resolveProjectPath(project(), "contracts/baseline.mcpc.json", "baseline");
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("resolves to"));
  });
});

/** Builds a `${NAME}` reference without tripping the template-placeholder lint rule. */
const ref = (name: string): string => ["$", "{", name, "}"].join("");

describe("expandEnvRefs", () => {
  it("replaces environment variable references", () => {
    expect(
      expandEnvRefs(`Bearer ${ref("TOKEN")}`, "server.headers.Authorization", { TOKEN: "abc" }),
    ).toBe("Bearer abc");
    expect(
      expandEnvRefs(`https://${ref("HOST")}/mcp?k=${ref("KEY")}`, "server.url", {
        HOST: "h",
        KEY: "v",
      }),
    ).toBe("https://h/mcp?k=v");
  });

  it("leaves values without references unchanged", () => {
    expect(expandEnvRefs("plain", "server.env.X", {})).toBe("plain");
  });

  it("throws when a referenced variable is not set", () => {
    expect(() => expandEnvRefs(ref("MISSING"), "server.env.API_KEY", {})).toThrow(
      'server.env.API_KEY references environment variable "MISSING", which is not set',
    );
  });
});

describe("resolveProjectTransport expands environment references", () => {
  it("expands env and header values and the url", () => {
    process.env["MCPC_TEST_TOKEN"] = "t0k";
    try {
      const url = resolveProjectTransport({
        path: "/p/mcpcontracts.json",
        dir: "/p",
        config: {
          server: {
            url: `https://x/${ref("MCPC_TEST_TOKEN")}`,
            headers: { A: ref("MCPC_TEST_TOKEN") },
          },
        },
      });
      expect(url.url).toBe("https://x/t0k");
      expect(url.headers).toEqual({ A: "t0k" });
      const stdio = resolveProjectTransport({
        path: "/p/mcpcontracts.json",
        dir: "/p",
        config: { server: { command: "node s.js", env: { KEY: ref("MCPC_TEST_TOKEN") } } },
      });
      expect(stdio.env).toEqual({ KEY: "t0k" });
    } finally {
      delete process.env["MCPC_TEST_TOKEN"];
    }
  });
});
