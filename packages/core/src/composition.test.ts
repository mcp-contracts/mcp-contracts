import { describe, expect, it } from "vitest";
import { entry, makeSnapshot, tool } from "./__fixtures__/composition-helpers.js";
import { diffComposition } from "./composition.js";

const searchSchema = { query: { type: "string" } };

describe("diffComposition", () => {
  it("reports no changes when every server matches its baseline", () => {
    const github = makeSnapshot("github", { search: tool("Search", searchSchema) });
    const slack = makeSnapshot("slack", { send: tool("Send") });

    const report = diffComposition(
      [entry("github", github), entry("slack", slack)],
      [entry("github", github), entry("slack", slack)],
    );

    expect(report.summary).toEqual({
      servers: 2,
      diffed: 2,
      missingBaselines: 0,
      missingServers: 0,
      breaking: 0,
      warning: 0,
      safe: 0,
      total: 0,
    });
    expect(report.servers.every((s) => s.status === "diffed")).toBe(true);
  });

  it("matches servers to baselines by composition name, not reported server name", () => {
    // The server renamed itself but keeps the same composition key.
    const before = makeSnapshot("old-internal-name", { search: tool("S", searchSchema) });
    const after = makeSnapshot("new-internal-name", { search: tool("S", searchSchema) });

    const report = diffComposition([entry("github", before)], [entry("github", after)]);
    expect(report.servers[0]?.status).toBe("diffed");
    expect(report.summary.diffed).toBe(1);
  });

  it("aggregates changes across servers", () => {
    const githubBefore = makeSnapshot("github", {
      search: tool("S", searchSchema),
      create_issue: tool("Create"),
    });
    const githubAfter = makeSnapshot("github", { search: tool("S", searchSchema) });
    const slackBefore = makeSnapshot("slack", { send: tool("Send") });
    const slackAfter = makeSnapshot("slack", { send: tool("Send"), react: tool("React") });

    const report = diffComposition(
      [entry("github", githubBefore), entry("slack", slackBefore)],
      [entry("github", githubAfter), entry("slack", slackAfter)],
    );

    // github: tool removed (breaking). slack: tool added (safe).
    expect(report.summary.breaking).toBe(1);
    expect(report.summary.safe).toBe(1);
    expect(report.summary.total).toBe(2);

    const github = report.servers.find((s) => s.serverName === "github");
    expect(github?.report?.summary.breaking).toBe(1);
  });

  it("reports servers without a baseline as missing-baseline", () => {
    const snap = makeSnapshot("new-server", { ping: tool("Ping") });
    const report = diffComposition([], [entry("new-server", snap)]);

    expect(report.servers[0]?.status).toBe("missing-baseline");
    expect(report.servers[0]?.report).toBeUndefined();
    expect(report.summary.missingBaselines).toBe(1);
    expect(report.summary.diffed).toBe(0);
  });

  it("reports baselines without a server as missing-server", () => {
    const snap = makeSnapshot("gone", { ping: tool("Ping") });
    const report = diffComposition([entry("gone", snap)], []);

    expect(report.servers[0]?.status).toBe("missing-server");
    expect(report.summary.missingServers).toBe(1);
  });

  it("orders servers by name", () => {
    const snap = makeSnapshot("x", {});
    const report = diffComposition(
      [entry("zeta", snap), entry("alpha", snap)],
      [entry("zeta", snap), entry("mid", snap)],
    );
    expect(report.servers.map((s) => s.serverName)).toEqual(["alpha", "mid", "zeta"]);
  });

  it("passes diff options through to per-server diffs", () => {
    const before = makeSnapshot("s", { keep: tool("Keep"), gone: tool("Gone") });
    const after = makeSnapshot("s", { keep: tool("Keep"), added: tool("Added") });

    const report = diffComposition([entry("s", before)], [entry("s", after)], {
      minSeverity: "breaking",
    });

    const changes = report.servers[0]?.report?.changes ?? [];
    expect(changes.every((c) => c.severity === "breaking")).toBe(true);
  });

  it("handles an empty composition", () => {
    const report = diffComposition([], []);
    expect(report.servers).toHaveLength(0);
    expect(report.summary.servers).toBe(0);
  });
});
