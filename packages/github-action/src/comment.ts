import * as github from "@actions/github";

const COMMENT_MARKER = "<!-- mcp-contracts-diff -->";

/**
 * Posts or updates a PR comment with the diff report.
 *
 * Uses a hidden HTML marker to find and update existing comments
 * rather than creating duplicates on re-runs.
 *
 * @param markdown - The formatted diff report markdown.
 * @param token - GitHub token for API access.
 * @param prNumber - The pull request number.
 */
export async function postOrUpdatePRComment(
  markdown: string,
  token: string,
  prNumber: number,
): Promise<void> {
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;

  const body = `${COMMENT_MARKER}\n${markdown}`;

  // Find existing comment by marker
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
  });

  const existing = comments.find((c) => c.body?.includes(COMMENT_MARKER));

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
  } else {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
  }
}

export { COMMENT_MARKER };
