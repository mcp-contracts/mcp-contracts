import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createSnapshot } from "@mcp-contracts/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseEnvPairs,
  readSnapshotFile,
  readVerifiedSnapshotFile,
  resolveFormat,
  stripAnsi,
  writeOutput,
} from "./utils.js";

const FIXTURES_DIR = resolve(import.meta.dirname, "../../core/src/__fixtures__");

describe("readSnapshotFile", () => {
  it("reads and parses a valid snapshot file", () => {
    const snapshot = readSnapshotFile(resolve(FIXTURES_DIR, "server-v1.mcpc.json"));
    expect(snapshot.snapshotVersion).toBe("1.0.0");
    expect(snapshot.server.name).toBe("contacts-server");
    expect(Object.keys(snapshot.tools)).toHaveLength(3);
  });

  it("throws on missing file", () => {
    expect(() => readSnapshotFile("/nonexistent/file.json")).toThrow(
      "Failed to read snapshot file",
    );
  });

  it("throws on invalid JSON", () => {
    const tmpPath = resolve(import.meta.dirname, "__tmp_invalid.json");
    writeFileSync(tmpPath, "not json{{{", "utf-8");
    try {
      expect(() => readSnapshotFile(tmpPath)).toThrow("Invalid JSON");
    } finally {
      unlinkSync(tmpPath);
    }
  });

  it("throws on non-object JSON", () => {
    const tmpPath = resolve(import.meta.dirname, "__tmp_array.json");
    writeFileSync(tmpPath, "[1,2,3]", "utf-8");
    try {
      expect(() => readSnapshotFile(tmpPath)).toThrow("must contain a JSON object");
    } finally {
      unlinkSync(tmpPath);
    }
  });

  it("throws on missing snapshotVersion", () => {
    const tmpPath = resolve(import.meta.dirname, "__tmp_noversion.json");
    writeFileSync(
      tmpPath,
      JSON.stringify({
        server: { name: "x" },
        tools: {},
        resources: {},
        prompts: {},
        contentHash: "sha256:abc",
      }),
      "utf-8",
    );
    try {
      expect(() => readSnapshotFile(tmpPath)).toThrow('missing "snapshotVersion"');
    } finally {
      unlinkSync(tmpPath);
    }
  });
});

describe("resolveFormat", () => {
  it("returns explicit format when provided", () => {
    expect(resolveFormat("json")).toBe("json");
    expect(resolveFormat("terminal")).toBe("terminal");
    expect(resolveFormat("markdown")).toBe("markdown");
  });

  it("falls back to json when stdout is not a TTY", () => {
    const origIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });
    try {
      expect(resolveFormat(undefined)).toBe("json");
    } finally {
      Object.defineProperty(process.stdout, "isTTY", { value: origIsTTY, configurable: true });
    }
  });
});

describe("stripAnsi", () => {
  it("removes ANSI color codes", () => {
    expect(stripAnsi("\x1b[31mred\x1b[0m")).toBe("red");
    expect(stripAnsi("\x1b[1m\x1b[33mwarning\x1b[0m")).toBe("warning");
  });

  it("returns plain string unchanged", () => {
    expect(stripAnsi("no colors")).toBe("no colors");
  });
});

describe("writeOutput", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes to stdout when no output path", () => {
    const spy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    writeOutput("hello", undefined);
    expect(spy).toHaveBeenCalledWith("hello");
  });

  it("writes to file when output path given", () => {
    const tmpPath = resolve(import.meta.dirname, "__tmp_output.txt");
    try {
      writeOutput("file content", tmpPath);
      expect(readFileSync(tmpPath, "utf-8")).toBe("file content");
    } finally {
      unlinkSync(tmpPath);
    }
  });
});

describe("parseEnvPairs", () => {
  it("parses KEY=VALUE pairs", () => {
    expect(parseEnvPairs(["FOO=bar", "BAZ=qux"])).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("handles values containing =", () => {
    expect(parseEnvPairs(["KEY=a=b=c"])).toEqual({ KEY: "a=b=c" });
  });

  it("throws on missing =", () => {
    expect(() => parseEnvPairs(["NOEQ"])).toThrow("expected KEY=VALUE format");
  });
});

describe("readVerifiedSnapshotFile", () => {
  let dir: string;
  const snapshot = createSnapshot({
    server: { name: "s", version: "1", protocolVersion: "2025-03-26", capabilities: {} },
    tools: [{ name: "t", inputSchema: { type: "object" } }],
    resources: [],
    resourceTemplates: [],
    prompts: [],
    capture: { transport: "stdio", source: "node s.js", tool: "test" },
  });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mcpc-verified-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns a snapshot whose hash matches its content", () => {
    const path = join(dir, "ok.mcpc.json");
    writeFileSync(path, JSON.stringify(snapshot));
    expect(readVerifiedSnapshotFile(path).contentHash).toBe(snapshot.contentHash);
  });

  it("rejects a snapshot edited without regenerating its hash", () => {
    const path = join(dir, "edited.mcpc.json");
    const edited = { ...snapshot, tools: {} };
    writeFileSync(path, JSON.stringify(edited));
    expect(() => readVerifiedSnapshotFile(path)).toThrow("content hash mismatch");
  });
});
