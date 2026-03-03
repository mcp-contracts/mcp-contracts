import { describe, expect, it } from "vitest";
import type { DiffReport } from "./diff-types.js";
import { createWebhookPayload } from "./webhook-types.js";

/** Minimal diff report for testing. */
function makeDiffReport(): DiffReport {
  return {
    meta: {
      before: {
        serverName: "server-a",
        serverVersion: "1.0.0",
        contentHash: "sha256:aaa",
        capturedAt: "2026-01-01T00:00:00.000Z",
      },
      after: {
        serverName: "server-a",
        serverVersion: "1.1.0",
        contentHash: "sha256:bbb",
        capturedAt: "2026-01-02T00:00:00.000Z",
      },
      generatedAt: "2026-01-02T00:00:00.000Z",
      tool: "mcpdiff",
    },
    summary: { breaking: 0, warning: 1, safe: 0, total: 1 },
    changes: [
      {
        id: "tool.my_tool.description.modified",
        category: "tool",
        name: "my_tool",
        severity: "warning",
        type: "modified",
        message: "Tool description changed",
      },
    ],
  };
}

describe("createWebhookPayload", () => {
  it("wraps a diff report with event metadata", () => {
    const report = makeDiffReport();
    const payload = createWebhookPayload(report, {
      trigger: "cli",
      baselinePath: "contracts/baseline.mcpc.json",
      serverSource: "http://localhost:3000/mcp",
    });

    expect(payload.event).toBe("diff.completed");
    expect(payload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(payload.source.trigger).toBe("cli");
    expect(payload.source.baselinePath).toBe("contracts/baseline.mcpc.json");
    expect(payload.source.serverSource).toBe("http://localhost:3000/mcp");
    expect(payload.report).toBe(report);
  });

  it("sets timestamp to the current time", () => {
    const before = Date.now();
    const payload = createWebhookPayload(makeDiffReport(), { trigger: "watch" });
    const after = Date.now();

    const ts = new Date(payload.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("works with ci trigger", () => {
    const payload = createWebhookPayload(makeDiffReport(), {
      trigger: "ci",
      baselinePath: "baseline.mcpc.json",
    });

    expect(payload.source.trigger).toBe("ci");
    expect(payload.source.serverSource).toBeUndefined();
  });
});
