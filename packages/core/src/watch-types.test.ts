import { describe, expect, it } from "vitest";
import { createWatchConfig, DEFAULT_WATCH_IGNORE_PATTERNS } from "./watch-types.js";

describe("DEFAULT_WATCH_IGNORE_PATTERNS", () => {
  it("includes node_modules, .git, dist, and mcpc.json patterns", () => {
    expect(DEFAULT_WATCH_IGNORE_PATTERNS).toContain("**/node_modules/**");
    expect(DEFAULT_WATCH_IGNORE_PATTERNS).toContain("**/.git/**");
    expect(DEFAULT_WATCH_IGNORE_PATTERNS).toContain("**/dist/**");
    expect(DEFAULT_WATCH_IGNORE_PATTERNS).toContain("**/*.mcpc.json");
  });
});

describe("createWatchConfig", () => {
  it("returns defaults when called with no args", () => {
    const config = createWatchConfig();

    expect(config.debounceMs).toBe(500);
    expect(config.watchPaths).toEqual(["."]);
    expect(config.ignorePatterns).toEqual([...DEFAULT_WATCH_IGNORE_PATTERNS]);
    expect(config.minSeverity).toBe("safe");
    expect(config.failOn).toBe("breaking");
  });

  it("overrides debounceMs", () => {
    const config = createWatchConfig({ debounceMs: 1000 });
    expect(config.debounceMs).toBe(1000);
  });

  it("overrides watchPaths", () => {
    const config = createWatchConfig({ watchPaths: ["src", "lib"] });
    expect(config.watchPaths).toEqual(["src", "lib"]);
  });

  it("overrides ignorePatterns", () => {
    const config = createWatchConfig({ ignorePatterns: ["**/test/**"] });
    expect(config.ignorePatterns).toEqual(["**/test/**"]);
  });

  it("overrides minSeverity", () => {
    const config = createWatchConfig({ minSeverity: "warning" });
    expect(config.minSeverity).toBe("warning");
  });

  it("overrides failOn", () => {
    const config = createWatchConfig({ failOn: "warning" });
    expect(config.failOn).toBe("warning");
  });

  it("does not mutate DEFAULT_WATCH_IGNORE_PATTERNS", () => {
    const config = createWatchConfig();
    config.ignorePatterns.push("extra");
    expect(DEFAULT_WATCH_IGNORE_PATTERNS).not.toContain("extra");
  });
});
