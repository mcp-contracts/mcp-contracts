import { describe, expect, it } from "vitest";
import { detectCIEnvironment } from "./ci-env.js";

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
