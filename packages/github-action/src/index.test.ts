import { createSnapshot } from "@mcp-contracts/core";
import type { MCPContractSnapshot } from "@mcp-contracts/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock @actions/core
const mockGetInput = vi.fn();
const mockGetBooleanInput = vi.fn();
const mockSetOutput = vi.fn();
const mockSetFailed = vi.fn();
const mockWarning = vi.fn();
const mockSummaryAddRaw = vi.fn().mockReturnThis();
const mockSummaryWrite = vi.fn().mockResolvedValue(undefined);

vi.mock("@actions/core", () => ({
  getInput: (...args: unknown[]) => mockGetInput(...args),
  getBooleanInput: (...args: unknown[]) => mockGetBooleanInput(...args),
  setOutput: (...args: unknown[]) => mockSetOutput(...args),
  setFailed: (...args: unknown[]) => mockSetFailed(...args),
  warning: (...args: unknown[]) => mockWarning(...args),
  summary: {
    addRaw: (...args: unknown[]) => mockSummaryAddRaw(...args),
    write: () => mockSummaryWrite(),
  },
}));

const mockGithubContext = {
  eventName: "push",
  repo: { owner: "test-owner", repo: "test-repo" },
  payload: {} as Record<string, unknown>,
};

vi.mock("@actions/github", () => ({
  getOctokit: vi.fn(),
  context: mockGithubContext,
}));

const mockPostOrUpdatePRComment = vi.fn().mockResolvedValue(undefined);

vi.mock("./comment.js", () => ({
  postOrUpdatePRComment: (...args: unknown[]) => mockPostOrUpdatePRComment(...args),
}));

// Mock MCP SDK transports
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    getServerVersion: () => ({ name: "test-server", version: "1.0.0" }),
    getServerCapabilities: () => ({ tools: {} }),
    listTools: vi.fn().mockResolvedValue({
      tools: [
        {
          name: "test_tool",
          description: "A test tool",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    }),
    close: vi.fn(),
  })),
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation(() => ({
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@modelcontextprotocol/sdk/types.js", () => ({
  LATEST_PROTOCOL_VERSION: "2025-03-26",
}));

// Create fixture data for tests
function createFixtureBaseline(): MCPContractSnapshot {
  return createSnapshot({
    server: {
      name: "test-server",
      version: "1.0.0",
      protocolVersion: "2025-03-26",
      capabilities: {},
    },
    tools: [
      {
        name: "test_tool",
        description: "A test tool",
        inputSchema: { type: "object", properties: {} },
      },
    ],
    resources: [],
    resourceTemplates: [],
    prompts: [],
    capture: { transport: "stdio", source: "node server.js", tool: "test/1.0.0" },
  });
}

function createDifferentBaseline(): MCPContractSnapshot {
  return createSnapshot({
    server: {
      name: "test-server",
      version: "1.0.0",
      protocolVersion: "2025-03-26",
      capabilities: {},
    },
    tools: [
      {
        name: "old_tool",
        description: "An old tool",
        inputSchema: { type: "object", properties: {} },
      },
    ],
    resources: [],
    resourceTemplates: [],
    prompts: [],
    capture: { transport: "stdio", source: "node server.js", tool: "test/1.0.0" },
  });
}

// Mock fs.readFileSync for baseline reading
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: vi.fn().mockImplementation((path: string, encoding?: string) => {
      if (typeof path === "string" && path.endsWith("different-baseline.mcpc.json")) {
        return JSON.stringify(createDifferentBaseline());
      }
      if (typeof path === "string" && path.endsWith("baseline.mcpc.json")) {
        return JSON.stringify(createFixtureBaseline());
      }
      return actual.readFileSync(path, encoding as BufferEncoding);
    }),
  };
});

describe("GitHub Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGithubContext.eventName = "push";
    mockGithubContext.payload = {};
    mockGetBooleanInput.mockReturnValue(false);
  });

  it("parses inputs correctly", async () => {
    mockGetInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        baseline: "contracts/baseline.mcpc.json",
        command: "node server.js",
        args: "",
        url: "",
        "fail-on": "breaking",
      };
      return inputs[name] ?? "";
    });

    const { run } = await import("./index.js");
    await run();

    expect(mockGetInput).toHaveBeenCalledWith("baseline", { required: true });
    expect(mockGetInput).toHaveBeenCalledWith("command");
    expect(mockGetInput).toHaveBeenCalledWith("url");
    expect(mockGetInput).toHaveBeenCalledWith("fail-on");
  });

  it("validates exactly one transport", async () => {
    mockGetInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        baseline: "contracts/baseline.mcpc.json",
        command: "",
        args: "",
        url: "",
        "fail-on": "breaking",
      };
      return inputs[name] ?? "";
    });

    const { run } = await import("./index.js");
    await run();

    expect(mockSetFailed).toHaveBeenCalledWith(
      expect.stringContaining("required"),
    );
  });

  it("sets outputs correctly when no changes", async () => {
    mockGetInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        baseline: "contracts/baseline.mcpc.json",
        command: "node server.js",
        args: "",
        url: "",
        "fail-on": "breaking",
      };
      return inputs[name] ?? "";
    });

    const { run } = await import("./index.js");
    await run();

    expect(mockSetOutput).toHaveBeenCalledWith("has-changes", "false");
    expect(mockSetOutput).toHaveBeenCalledWith("has-breaking", "false");
    expect(mockSetOutput).toHaveBeenCalledWith("exit-code", "0");
    expect(mockSetOutput).toHaveBeenCalledWith(
      "summary",
      expect.any(String),
    );
  });

  it("sets outputs correctly when breaking changes detected", async () => {
    mockGetInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        baseline: "contracts/different-baseline.mcpc.json",
        command: "node server.js",
        args: "",
        url: "",
        "fail-on": "breaking",
      };
      return inputs[name] ?? "";
    });

    const { run } = await import("./index.js");
    await run();

    expect(mockSetOutput).toHaveBeenCalledWith("has-changes", "true");
    expect(mockSetOutput).toHaveBeenCalledWith("has-breaking", "true");
    expect(mockSetOutput).toHaveBeenCalledWith("exit-code", "1");
    expect(mockSetFailed).toHaveBeenCalledWith(
      "Breaking MCP contract changes detected",
    );
  });

  it("does not call setFailed for warnings when fail-on is breaking", async () => {
    // Use same baseline → no changes → no failure
    mockGetInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        baseline: "contracts/baseline.mcpc.json",
        command: "node server.js",
        args: "",
        url: "",
        "fail-on": "breaking",
      };
      return inputs[name] ?? "";
    });

    const { run } = await import("./index.js");
    await run();

    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  it("writes step summary", async () => {
    mockGetInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        baseline: "contracts/baseline.mcpc.json",
        command: "node server.js",
        args: "",
        url: "",
        "fail-on": "breaking",
      };
      return inputs[name] ?? "";
    });

    const { run } = await import("./index.js");
    await run();

    expect(mockSummaryAddRaw).toHaveBeenCalled();
    expect(mockSummaryWrite).toHaveBeenCalled();
  });

  it("handles setFailed on error", async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === "baseline") throw new Error("test error");
      return "";
    });

    const { run } = await import("./index.js");
    await run();

    expect(mockSetFailed).toHaveBeenCalledWith(expect.stringContaining("test error"));
  });

  describe("PR comments", () => {
    it("skips commenting when not a PR event", async () => {
      mockGetInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          baseline: "contracts/baseline.mcpc.json",
          command: "node server.js",
          args: "",
          url: "",
          "fail-on": "breaking",
          "github-token": "test-token",
        };
        return inputs[name] ?? "";
      });
      mockGetBooleanInput.mockReturnValue(true);
      mockGithubContext.eventName = "push";

      const { run } = await import("./index.js");
      await run();

      expect(mockPostOrUpdatePRComment).not.toHaveBeenCalled();
    });

    it("skips commenting when comment-on-pr is false", async () => {
      mockGetInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          baseline: "contracts/baseline.mcpc.json",
          command: "node server.js",
          args: "",
          url: "",
          "fail-on": "breaking",
          "github-token": "test-token",
        };
        return inputs[name] ?? "";
      });
      mockGetBooleanInput.mockReturnValue(false);
      mockGithubContext.eventName = "pull_request";
      mockGithubContext.payload = { pull_request: { number: 42 } };

      const { run } = await import("./index.js");
      await run();

      expect(mockPostOrUpdatePRComment).not.toHaveBeenCalled();
    });

    it("posts comment on PR when enabled", async () => {
      mockGetInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          baseline: "contracts/baseline.mcpc.json",
          command: "node server.js",
          args: "",
          url: "",
          "fail-on": "breaking",
          "github-token": "test-token",
        };
        return inputs[name] ?? "";
      });
      mockGetBooleanInput.mockReturnValue(true);
      mockGithubContext.eventName = "pull_request";
      mockGithubContext.payload = { pull_request: { number: 42 } };

      const { run } = await import("./index.js");
      await run();

      expect(mockPostOrUpdatePRComment).toHaveBeenCalledWith(
        expect.any(String),
        "test-token",
        42,
      );
    });

    it("warns when no token available", async () => {
      const originalToken = process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_TOKEN;

      mockGetInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          baseline: "contracts/baseline.mcpc.json",
          command: "node server.js",
          args: "",
          url: "",
          "fail-on": "breaking",
          "github-token": "",
        };
        return inputs[name] ?? "";
      });
      mockGetBooleanInput.mockReturnValue(true);
      mockGithubContext.eventName = "pull_request";
      mockGithubContext.payload = { pull_request: { number: 42 } };

      const { run } = await import("./index.js");
      await run();

      expect(mockPostOrUpdatePRComment).not.toHaveBeenCalled();
      expect(mockWarning).toHaveBeenCalledWith(
        expect.stringContaining("No GitHub token"),
      );

      process.env.GITHUB_TOKEN = originalToken;
    });
  });
});
