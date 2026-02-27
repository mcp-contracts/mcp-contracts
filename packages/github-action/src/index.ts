import { readFileSync } from "node:fs";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { SEVERITY_ORDER, createSnapshot, diffSnapshots, formatMarkdown } from "@mcp-contracts/core";
import type {
  DiffReport,
  MCPContractSnapshot,
  RawPrompt,
  RawResource,
  RawResourceTemplate,
  RawTool,
  Severity,
  SnapshotCapture,
  SnapshotServer,
} from "@mcp-contracts/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { postOrUpdatePRComment } from "./comment.js";

const VALID_SEVERITIES = new Set<string>(["safe", "warning", "breaking"]);

/**
 * Reads and validates a baseline snapshot file.
 *
 * @param filePath - Path to the .mcpc.json file.
 * @returns The parsed snapshot object.
 */
function readBaseline(filePath: string): MCPContractSnapshot {
  const raw = readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw) as Record<string, unknown>;

  if (typeof data.snapshotVersion !== "string") {
    throw new Error(`Invalid baseline: missing "snapshotVersion"`);
  }
  if (typeof data.contentHash !== "string" || !data.contentHash.startsWith("sha256:")) {
    throw new Error(`Invalid baseline: missing or invalid "contentHash"`);
  }

  return data as unknown as MCPContractSnapshot;
}

/** Data captured from a live MCP server. */
interface CapturedData {
  tools: RawTool[];
  resources: RawResource[];
  resourceTemplates: RawResourceTemplate[];
  prompts: RawPrompt[];
}

/**
 * Connects to an MCP server and returns the client and transport.
 *
 * @param options - Connection options (command or url).
 * @returns The connected client and transport.
 */
async function connectToServer(options: {
  command?: string;
  args?: string[];
  url?: string;
}): Promise<{ client: Client; transport: Transport; protocolVersion: string }> {
  const client = new Client({ name: "mcp-contracts-action", version: "0.2.0" });

  let transport: Transport;
  if (options.command) {
    const args = options.args ?? [];
    transport = new StdioClientTransport({ command: options.command, args });
  } else if (options.url) {
    transport = new StreamableHTTPClientTransport(new URL(options.url));
  } else {
    throw new Error("Either 'command' or 'url' input is required");
  }

  await client.connect(transport, { signal: AbortSignal.timeout(30_000) });

  return { client, transport, protocolVersion: LATEST_PROTOCOL_VERSION };
}

/**
 * Captures tools, resources, and prompts from a connected MCP server.
 *
 * @param client - The connected MCP client.
 * @returns Captured server data.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: pagination loops
async function captureData(client: Client): Promise<CapturedData> {
  const capabilities = client.getServerCapabilities() ?? {};

  const tools: RawTool[] = [];
  const resources: RawResource[] = [];
  const resourceTemplates: RawResourceTemplate[] = [];
  const prompts: RawPrompt[] = [];

  if (capabilities.tools) {
    let cursor: string | undefined;
    do {
      const result = await client.listTools(cursor ? { cursor } : undefined);
      for (const tool of result.tools) {
        tools.push({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema as RawTool["inputSchema"],
          ...(tool.outputSchema && {
            outputSchema: tool.outputSchema as Record<string, unknown>,
          }),
          ...(tool.annotations && {
            annotations: tool.annotations as Record<string, unknown>,
          }),
        });
      }
      cursor = result.nextCursor;
    } while (cursor);
  }

  if (capabilities.resources) {
    let cursor: string | undefined;
    do {
      const result = await client.listResources(cursor ? { cursor } : undefined);
      for (const resource of result.resources) {
        resources.push({
          uri: resource.uri,
          name: resource.name,
          description: resource.description,
          mimeType: resource.mimeType,
        });
      }
      cursor = result.nextCursor;
    } while (cursor);

    cursor = undefined;
    do {
      const result = await client.listResourceTemplates(cursor ? { cursor } : undefined);
      for (const template of result.resourceTemplates) {
        resourceTemplates.push({
          uriTemplate: template.uriTemplate,
          name: template.name,
          description: template.description,
          mimeType: template.mimeType,
        });
      }
      cursor = result.nextCursor;
    } while (cursor);
  }

  if (capabilities.prompts) {
    let cursor: string | undefined;
    do {
      const result = await client.listPrompts(cursor ? { cursor } : undefined);
      for (const prompt of result.prompts) {
        prompts.push({
          name: prompt.name,
          description: prompt.description,
          arguments: prompt.arguments,
        });
      }
      cursor = result.nextCursor;
    } while (cursor);
  }

  return { tools, resources, resourceTemplates, prompts };
}

/**
 * Checks whether any changes meet the fail-on severity threshold.
 *
 * @param report - The diff report to check.
 * @param failOn - The severity threshold.
 * @returns True if any change meets or exceeds the threshold.
 */
function exceedsThreshold(report: DiffReport, failOn: Severity): boolean {
  const threshold = SEVERITY_ORDER[failOn];
  return report.changes.some((c) => SEVERITY_ORDER[c.severity] >= threshold);
}

/**
 * Main entry point for the GitHub Action.
 *
 * Reads inputs, connects to MCP server, diffs against baseline,
 * sets outputs, writes step summary, and optionally fails the action.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestration function
export async function run(): Promise<void> {
  let transport: Transport | undefined;

  try {
    // Read inputs
    const baselinePath = core.getInput("baseline", { required: true });
    const command = core.getInput("command") || undefined;
    const argsStr = core.getInput("args") || undefined;
    const url = core.getInput("url") || undefined;
    const failOnStr = core.getInput("fail-on") || "breaking";

    if (!VALID_SEVERITIES.has(failOnStr)) {
      throw new Error(
        `Invalid fail-on value "${failOnStr}". Must be one of: safe, warning, breaking`,
      );
    }
    const failOn = failOnStr as Severity;

    const args = argsStr ? argsStr.split(/\s+/) : undefined;

    // Read baseline
    const baseline = readBaseline(baselinePath);

    // Connect and capture
    const connection = await connectToServer({ command, args, url });
    transport = connection.transport;

    const serverVersion = connection.client.getServerVersion();
    const serverCapabilities = connection.client.getServerCapabilities() ?? {};

    const data = await captureData(connection.client);
    await transport.close();
    transport = undefined;

    // Create current snapshot
    const server: SnapshotServer = {
      name: serverVersion?.name ?? "unknown",
      version: serverVersion?.version ?? "unknown",
      protocolVersion: connection.protocolVersion,
      capabilities: serverCapabilities as Record<string, unknown>,
    };

    const source = command ? [command, ...(args ?? [])].join(" ") : url;

    const capture: SnapshotCapture = {
      transport: command ? "stdio" : "streamable-http",
      source,
      tool: "mcp-contracts-action/0.2.0",
    };

    const current = createSnapshot({
      server,
      tools: data.tools,
      resources: data.resources,
      resourceTemplates: data.resourceTemplates,
      prompts: data.prompts,
      capture,
    });

    // Diff
    const report = diffSnapshots(baseline, current);

    // Format as markdown
    const markdown = formatMarkdown(report);

    // Write step summary
    core.summary.addRaw(markdown);
    await core.summary.write();

    // PR comment
    const commentOnPr = core.getBooleanInput("comment-on-pr");
    if (commentOnPr && github.context.eventName === "pull_request") {
      const token = core.getInput("github-token", { required: false }) || process.env.GITHUB_TOKEN;
      if (token) {
        const prNumber = github.context.payload.pull_request?.number;
        if (prNumber) {
          await postOrUpdatePRComment(markdown, token, prNumber);
        }
      } else {
        core.warning("No GitHub token available — skipping PR comment");
      }
    }

    // Set outputs
    const hasChanges = report.changes.length > 0;
    const hasBreaking = report.summary.breaking > 0;
    const shouldFail = exceedsThreshold(report, failOn);

    core.setOutput("has-changes", String(hasChanges));
    core.setOutput("has-breaking", String(hasBreaking));
    core.setOutput("summary", JSON.stringify(report.summary));
    core.setOutput("exit-code", shouldFail ? "1" : "0");

    if (shouldFail) {
      core.setFailed("Breaking MCP contract changes detected");
    }
  } catch (error) {
    if (transport) {
      try {
        await transport.close();
      } catch {
        // ignore close errors
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(message);
  }
}

run();
