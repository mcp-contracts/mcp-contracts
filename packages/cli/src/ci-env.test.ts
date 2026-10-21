import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendStepSummary, detectCIEnvironment, STEP_SUMMARY_MAX_BYTES } from "./ci-env.js";

describe("detectCIEnvironment", () => {
  it("detects GitHub Actions", () => {
    const env = {
      GITHUB_ACTIONS: "true",
      GITHUB_STEP_SUMMARY: "/tmp/summary.md",
      GITHUB_REPOSITORY: "mcp-contracts/mcp-contracts",
    };
    const result = detectCIEnvironment(env);
    expect(result.isCI).toBe(true);
    expect(result.provider).toBe("github-actions");
    expect(result.suggestedFormat).toBe("markdown");
    expect(result.stepSummaryPath).toBe("/tmp/summary.md");
    expect(result.repository).toBe("mcp-contracts/mcp-contracts");
    expect(result.isPullRequest).toBe(false);
    expect(result.pullRequestNumber).toBeNull();
  });

  it("detects GitHub Actions pull request event", () => {
    const env = {
      GITHUB_ACTIONS: "true",
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_REF: "refs/pull/42/merge",
      GITHUB_STEP_SUMMARY: "/tmp/summary.md",
      GITHUB_REPOSITORY: "owner/repo",
    };
    const result = detectCIEnvironment(env);
    expect(result.isPullRequest).toBe(true);
    expect(result.pullRequestNumber).toBe(42);
  });

  it("handles GitHub Actions non-PR event", () => {
    const env = {
      GITHUB_ACTIONS: "true",
      GITHUB_EVENT_NAME: "push",
      GITHUB_REF: "refs/heads/main",
    };
    const result = detectCIEnvironment(env);
    expect(result.isPullRequest).toBe(false);
    expect(result.pullRequestNumber).toBeNull();
  });

  it("handles missing GITHUB_STEP_SUMMARY", () => {
    const env = {
      GITHUB_ACTIONS: "true",
    };
    const result = detectCIEnvironment(env);
    expect(result.stepSummaryPath).toBeNull();
  });

  it("detects GitLab CI", () => {
    const env = {
      GITLAB_CI: "true",
      CI: "true",
    };
    const result = detectCIEnvironment(env);
    expect(result.isCI).toBe(true);
    expect(result.provider).toBe("gitlab-ci");
    expect(result.suggestedFormat).toBe("markdown");
    expect(result.isPullRequest).toBe(false);
  });

  it("detects GitLab CI merge request", () => {
    const env = {
      GITLAB_CI: "true",
      CI: "true",
      CI_MERGE_REQUEST_IID: "15",
    };
    const result = detectCIEnvironment(env);
    expect(result.isPullRequest).toBe(true);
    expect(result.pullRequestNumber).toBe(15);
  });

  it("detects CircleCI", () => {
    const env = {
      CIRCLECI: "true",
      CI: "true",
    };
    const result = detectCIEnvironment(env);
    expect(result.isCI).toBe(true);
    expect(result.provider).toBe("circleci");
    expect(result.suggestedFormat).toBe("json");
    expect(result.isPullRequest).toBe(false);
  });

  it("detects CircleCI with pull request", () => {
    const env = {
      CIRCLECI: "true",
      CI: "true",
      CIRCLE_PULL_REQUEST: "https://github.com/owner/repo/pull/7",
    };
    const result = detectCIEnvironment(env);
    expect(result.isPullRequest).toBe(true);
  });

  it("falls back to generic CI", () => {
    const env = {
      CI: "true",
    };
    const result = detectCIEnvironment(env);
    expect(result.isCI).toBe(true);
    expect(result.provider).toBe("generic");
    expect(result.suggestedFormat).toBe("json");
    expect(result.isPullRequest).toBe(false);
    expect(result.pullRequestNumber).toBeNull();
    expect(result.stepSummaryPath).toBeNull();
  });

  it("returns isCI false when no CI env vars", () => {
    const env = {
      HOME: "/home/user",
      PATH: "/usr/bin",
    };
    const result = detectCIEnvironment(env);
    expect(result.isCI).toBe(false);
    expect(result.provider).toBeNull();
    expect(result.isPullRequest).toBe(false);
    expect(result.pullRequestNumber).toBeNull();
    expect(result.stepSummaryPath).toBeNull();
    expect(result.repository).toBeNull();
  });

  it("prioritizes GitHub Actions over generic CI", () => {
    const env = {
      CI: "true",
      GITHUB_ACTIONS: "true",
    };
    const result = detectCIEnvironment(env);
    expect(result.provider).toBe("github-actions");
  });

  it("prioritizes GitLab CI over generic CI", () => {
    const env = {
      CI: "true",
      GITLAB_CI: "true",
    };
    const result = detectCIEnvironment(env);
    expect(result.provider).toBe("gitlab-ci");
  });

  it("uses named export", () => {
    expect(typeof detectCIEnvironment).toBe("function");
  });
});

describe("appendStepSummary", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mcpc-summary-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("appends the markdown followed by a newline", () => {
    const path = join(dir, "summary.md");
    expect(appendStepSummary(path, "## one")).toBe(true);
    expect(appendStepSummary(path, "## two")).toBe(true);
    expect(readFileSync(path, "utf-8")).toBe("## one\n## two\n");
  });

  it("truncates oversized content below the provider limit with a note", () => {
    const path = join(dir, "summary.md");
    const big = "x".repeat(STEP_SUMMARY_MAX_BYTES + 5000);
    expect(appendStepSummary(path, big)).toBe(true);
    const written = readFileSync(path, "utf-8");
    expect(Buffer.byteLength(written, "utf-8")).toBeLessThanOrEqual(STEP_SUMMARY_MAX_BYTES + 1);
    expect(written).toContain("Report truncated");
  });

  it("warns and returns false instead of throwing when the write fails", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const path = join(dir, "missing-dir", "summary.md");
    expect(appendStepSummary(path, "## report")).toBe(false);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("Failed to write step summary"));
  });
});
