import { appendFileSync } from "node:fs";

/** CI environment detection for automated pipelines. */

/** Detected CI environment information. */
export interface CIEnvironment {
  /** Whether running in any CI system. */
  isCI: boolean;
  /** Detected provider name, or null. */
  provider: "github-actions" | "gitlab-ci" | "circleci" | "generic" | null;
  /** Suggested output format for this CI system. */
  suggestedFormat: "markdown" | "json";
  /** GitHub-specific: path to write step summary markdown. */
  stepSummaryPath: string | null;
  /** GitHub-specific: whether this is a pull request event. */
  isPullRequest: boolean;
  /** GitHub-specific: PR number, if applicable. */
  pullRequestNumber: number | null;
  /** GitHub-specific: repository slug (owner/repo). */
  repository: string | null;
}

/**
 * Parses a PR number from a GitHub Actions ref string.
 *
 * @param ref - The GITHUB_REF value (e.g., "refs/pull/42/merge").
 * @returns The PR number, or null if not a PR ref.
 */
function parsePRNumberFromRef(ref: string | undefined): number | null {
  if (!ref) return null;
  const match = ref.match(/^refs\/pull\/(\d+)\/merge$/);
  if (!match) return null;
  return Number.parseInt(match[1] as string, 10);
}

/**
 * Detects the current CI environment by inspecting environment variables.
 *
 * Supports GitHub Actions, GitLab CI, CircleCI, and generic CI detection.
 * Returns structured context including provider-specific information like
 * PR numbers and step summary paths.
 *
 * @param env - Environment variables to inspect (defaults to process.env).
 * @returns The detected CI environment.
 */
export function detectCIEnvironment(
  env: Record<string, string | undefined> = process.env,
): CIEnvironment {
  // GitHub Actions
  if (env["GITHUB_ACTIONS"] === "true") {
    const isPullRequest = env["GITHUB_EVENT_NAME"] === "pull_request";
    const pullRequestNumber = parsePRNumberFromRef(env["GITHUB_REF"]);

    return {
      isCI: true,
      provider: "github-actions",
      suggestedFormat: "markdown",
      stepSummaryPath: env["GITHUB_STEP_SUMMARY"] ?? null,
      isPullRequest,
      pullRequestNumber,
      repository: env["GITHUB_REPOSITORY"] ?? null,
    };
  }

  // GitLab CI
  if (env["GITLAB_CI"] === "true") {
    const mrIid = env["CI_MERGE_REQUEST_IID"];
    return {
      isCI: true,
      provider: "gitlab-ci",
      suggestedFormat: "markdown",
      stepSummaryPath: null,
      isPullRequest: mrIid !== undefined && mrIid !== "",
      pullRequestNumber: mrIid ? Number.parseInt(mrIid, 10) : null,
      repository: null,
    };
  }

  // CircleCI
  if (env["CIRCLECI"] === "true") {
    const prUrl = env["CIRCLE_PULL_REQUEST"];
    return {
      isCI: true,
      provider: "circleci",
      suggestedFormat: "json",
      stepSummaryPath: null,
      isPullRequest: prUrl !== undefined && prUrl !== "",
      pullRequestNumber: null,
      repository: null,
    };
  }

  // Generic CI (fallback)
  if (env["CI"] === "true") {
    return {
      isCI: true,
      provider: "generic",
      suggestedFormat: "json",
      stepSummaryPath: null,
      isPullRequest: false,
      pullRequestNumber: null,
      repository: null,
    };
  }

  // Not CI
  return {
    isCI: false,
    provider: null,
    suggestedFormat: "json",
    stepSummaryPath: null,
    isPullRequest: false,
    pullRequestNumber: null,
    repository: null,
  };
}

/** Upper bound for one step summary write, below GitHub's 1 MiB limit. */
export const STEP_SUMMARY_MAX_BYTES = 900 * 1024;

const TRUNCATION_NOTE =
  "\n\n_Report truncated to fit the step summary size limit; see the job log for the full output._\n";

/**
 * Appends a markdown report to the CI step summary without ever failing the run.
 *
 * A summary is a side channel: a write error must not turn a contract result
 * into a tool error, and an oversized summary must not be silently dropped by
 * the CI provider. The content is truncated below the provider limit with an
 * explicit note, and any write failure is reported on stderr.
 *
 * @param path - The step summary file path.
 * @param markdown - The report to append.
 * @returns True when the write succeeded.
 */
export function appendStepSummary(path: string, markdown: string): boolean {
  let content = markdown;
  if (Buffer.byteLength(content, "utf-8") > STEP_SUMMARY_MAX_BYTES) {
    const budget = STEP_SUMMARY_MAX_BYTES - Buffer.byteLength(TRUNCATION_NOTE, "utf-8");
    content =
      Buffer.from(content, "utf-8")
        .subarray(0, budget)
        .toString("utf-8")
        .replace(/\uFFFD$/, "") + TRUNCATION_NOTE;
  }
  try {
    appendFileSync(path, `${content}\n`);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Warning: Failed to write step summary: ${message}\n`);
    return false;
  }
}
