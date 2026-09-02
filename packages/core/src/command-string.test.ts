import { describe, expect, it } from "vitest";
import { resolveCommandString, splitCommandString } from "./command-string.js";

describe("splitCommandString", () => {
  it("returns a single token for a bare executable", () => {
    expect(splitCommandString("node")).toEqual(["node"]);
  });

  it("splits on whitespace", () => {
    expect(splitCommandString("node server.js")).toEqual(["node", "server.js"]);
  });

  it("collapses runs of whitespace", () => {
    expect(splitCommandString("  node \t server.js  --port 3000 ")).toEqual([
      "node",
      "server.js",
      "--port",
      "3000",
    ]);
  });

  it("keeps double-quoted segments as one token", () => {
    expect(splitCommandString('"/path with spaces/node" server.js')).toEqual([
      "/path with spaces/node",
      "server.js",
    ]);
  });

  it("keeps single-quoted segments as one token", () => {
    expect(splitCommandString("node 'my server.js'")).toEqual(["node", "my server.js"]);
  });

  it("supports quotes inside a token", () => {
    expect(splitCommandString('node --name="my server"')).toEqual(["node", "--name=my server"]);
  });

  it("preserves empty quoted tokens", () => {
    expect(splitCommandString("node ''")).toEqual(["node", ""]);
  });

  it("escapes spaces with a backslash", () => {
    expect(splitCommandString("node my\\ server.js")).toEqual(["node", "my server.js"]);
  });

  it("escapes quotes with a backslash", () => {
    expect(splitCommandString('node \\"server.js')).toEqual(["node", '"server.js']);
  });

  it("treats backslashes inside single quotes literally", () => {
    expect(splitCommandString("node 'a\\b'")).toEqual(["node", "a\\b"]);
  });

  it("returns no tokens for an empty or blank string", () => {
    expect(splitCommandString("")).toEqual([]);
    expect(splitCommandString("   ")).toEqual([]);
  });

  it("throws on an unterminated quote", () => {
    expect(() => splitCommandString('node "server.js')).toThrow(/unterminated/);
    expect(() => splitCommandString("node 'server.js")).toThrow(/unterminated/);
  });

  it("throws on a trailing backslash", () => {
    expect(() => splitCommandString("node server.js\\")).toThrow(/trailing backslash/);
  });
});

describe("resolveCommandString", () => {
  it("resolves a bare executable with no args", () => {
    expect(resolveCommandString("node")).toEqual({ command: "node" });
  });

  it("splits inline arguments off the command string", () => {
    expect(resolveCommandString("node server.js")).toEqual({
      command: "node",
      args: ["server.js"],
    });
  });

  it("appends extra args after inline arguments", () => {
    expect(resolveCommandString("node server.js", ["--port", "3000"])).toEqual({
      command: "node",
      args: ["server.js", "--port", "3000"],
    });
  });

  it("keeps a quoted executable containing spaces intact", () => {
    expect(resolveCommandString('"/path with spaces/node" server.js')).toEqual({
      command: "/path with spaces/node",
      args: ["server.js"],
    });
  });

  it("throws when the command string has no executable", () => {
    expect(() => resolveCommandString("")).toThrow(/no executable/);
    expect(() => resolveCommandString("   ")).toThrow(/no executable/);
  });
});
