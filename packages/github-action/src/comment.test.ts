import { beforeEach, describe, expect, it, vi } from "vitest";
import { COMMENT_MARKER, postOrUpdatePRComment } from "./comment.js";

const mockListComments = vi.fn();
const mockCreateComment = vi.fn();
const mockUpdateComment = vi.fn();

vi.mock("@actions/github", () => ({
  getOctokit: vi.fn().mockReturnValue({
    rest: {
      issues: {
        listComments: (...args: unknown[]) => mockListComments(...args),
        createComment: (...args: unknown[]) => mockCreateComment(...args),
        updateComment: (...args: unknown[]) => mockUpdateComment(...args),
      },
    },
  }),
  context: {
    repo: { owner: "test-owner", repo: "test-repo" },
    eventName: "pull_request",
    payload: {
      pull_request: { number: 42 },
    },
  },
}));

describe("postOrUpdatePRComment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListComments.mockResolvedValue({ data: [] });
    mockCreateComment.mockResolvedValue({ data: { id: 1 } });
    mockUpdateComment.mockResolvedValue({ data: { id: 1 } });
  });

  it("creates new comment when none exists", async () => {
    mockListComments.mockResolvedValue({ data: [] });

    await postOrUpdatePRComment("## Diff Report\nNo changes", "test-token", 42);

    expect(mockCreateComment).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      issue_number: 42,
      body: expect.stringContaining(COMMENT_MARKER),
    });
    expect(mockUpdateComment).not.toHaveBeenCalled();
  });

  it("updates existing comment (finds by marker)", async () => {
    mockListComments.mockResolvedValue({
      data: [
        { id: 100, body: "Some other comment" },
        { id: 200, body: `${COMMENT_MARKER}\n## Old Diff Report` },
      ],
    });

    await postOrUpdatePRComment("## New Diff Report", "test-token", 42);

    expect(mockUpdateComment).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      comment_id: 200,
      body: expect.stringContaining(COMMENT_MARKER),
    });
    expect(mockCreateComment).not.toHaveBeenCalled();
  });

  it("comment body includes the marker for future updates", async () => {
    await postOrUpdatePRComment("## Report", "test-token", 42);

    const call = mockCreateComment.mock.calls[0] as [{ body: string }];
    expect(call[0].body).toContain(COMMENT_MARKER);
    expect(call[0].body).toContain("## Report");
  });

  it("uses correct owner and repo from context", async () => {
    await postOrUpdatePRComment("Report", "test-token", 7);

    expect(mockListComments).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 7,
      }),
    );
  });
});
