import { describe, expect, it } from "vitest";
import type { DiffReport, WatchDiffEvent } from "@mcp-contracts/core";
import { clearScreen, formatWatchCycle, formatWatchError, formatWatchHeader } from "./watch-output.js";

describe("formatWatchHeader", () => {
  it("includes baseline path, watch paths, and debounce", () => {
    const output = formatWatchHeader("baseline.mcpc.json", ["src", "lib"], 500);
    expect(output).toContain("mcpdiff watch mode");
    expect(output).toContain("Baseline: baseline.mcpc.json");
    expect(output).toContain("Watching: src, lib");
    expect(output).toContain("Debounce: 500ms");
    expect(output).toContain("Waiting for file changes...");
  });
});

describe("formatWatchCycle", () => {
  const mockReport: DiffReport = {
    meta: {
      before: { serverName: "a", serverVersion: "1.0.0", contentHash: "sha256:aaa", capturedAt: "2026-01-01T00:00:00Z" },
      after: { serverName: "a", serverVersion: "1.0.0", contentHash: "sha256:bbb", capturedAt: "2026-01-01T00:01:00Z" },
      generatedAt: "2026-01-01T00:01:00Z",
      tool: "mcpdiff",
    },
    summary: { breaking: 1, warning: 0, safe: 0, total: 1 },
    changes: [{
      id: "tool.x.removed",
      category: "tool",
      name: "x",
      severity: "breaking",
      type: "removed",
      message: "Tool removed",
    }],
  };

  it("formats a cycle with changes", () => {
    const event: WatchDiffEvent = {
      cycle: 1,
      timestamp: "2026-01-01T12:00:00.000Z",
      report: mockReport,
      triggerPaths: ["src/server.ts"],
      durationMs: 150,
    };
    const output = formatWatchCycle(event, () => "REPORT_OUTPUT");
    expect(output).toContain("Cycle 1");
    expect(output).toContain("150ms");
    expect(output).toContain("Changed: src/server.ts");
    expect(output).toContain("1 total");
    expect(output).toContain("1 breaking");
    expect(output).toContain("REPORT_OUTPUT");
  });

  it("formats a cycle with no changes", () => {
    const noChangesReport: DiffReport = {
      ...mockReport,
      summary: { breaking: 0, warning: 0, safe: 0, total: 0 },
      changes: [],
    };
    const event: WatchDiffEvent = {
      cycle: 2,
      timestamp: "2026-01-01T12:01:00.000Z",
      report: noChangesReport,
      triggerPaths: ["src/index.ts"],
      durationMs: 100,
    };
    const output = formatWatchCycle(event, () => "");
    expect(output).toContain("No changes detected");
  });

  it("truncates long trigger path lists", () => {
    const event: WatchDiffEvent = {
      cycle: 3,
      timestamp: "2026-01-01T12:02:00.000Z",
      triggerPaths: ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.ts", "g.ts"],
      durationMs: 50,
    };
    const output = formatWatchCycle(event, () => "");
    expect(output).toContain("+2 more");
  });
});

describe("formatWatchError", () => {
  it("formats an error event", () => {
    const event: WatchDiffEvent = {
      cycle: 5,
      timestamp: "2026-01-01T12:05:00.000Z",
      triggerPaths: ["src/broken.ts"],
      durationMs: 10,
      error: "Connection refused",
    };
    const output = formatWatchError(event);
    expect(output).toContain("Cycle 5");
    expect(output).toContain("ERROR");
    expect(output).toContain("Connection refused");
  });
});

describe("clearScreen", () => {
  it("returns ANSI clear sequence", () => {
    expect(clearScreen()).toBe("\x1b[2J\x1b[H");
  });
});
