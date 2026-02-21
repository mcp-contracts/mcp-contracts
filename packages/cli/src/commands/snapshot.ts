import { Command } from "commander";
import { createSnapshot } from "@mcp-contracts/core";
import type { SnapshotCapture, SnapshotServer } from "@mcp-contracts/core";
import { handleErrors, parseEnvPairs, writeOutput } from "../utils.js";
import { captureServerData, connectToServer, readMcpConfig } from "./mcp-client.js";
import type { ResolvedTransport } from "./mcp-client.js";

/**
 * Resolves transport configuration from CLI options.
 *
 * Validates that exactly one transport method is specified.
 *
 * @param options - The parsed CLI options.
 * @returns A ResolvedTransport configuration.
 */
function resolveTransport(options: Record<string, unknown>): ResolvedTransport {
  const hasCommand = typeof options.command === "string";
  const hasUrl = typeof options.url === "string";
  const hasConfig = typeof options.config === "string";

  const count = [hasCommand, hasUrl, hasConfig].filter(Boolean).length;

  if (count === 0) {
    throw new Error("Specify one of: --command, --url, or --config");
  }
  if (count > 1) {
    throw new Error("Specify only one of: --command, --url, or --config");
  }

  if (hasConfig) {
    return readMcpConfig(options.config as string, options.server as string | undefined);
  }

  if (hasUrl) {
    return { transport: "streamable-http", url: options.url as string };
  }

  const args = options.args as string[] | undefined;
  const envPairs = options.env as string[] | undefined;

  return {
    transport: "stdio",
    command: options.command as string,
    args,
    env: envPairs ? parseEnvPairs(envPairs) : undefined,
  };
}

/**
 * Creates the `snapshot` subcommand for the mcpdiff CLI.
 *
 * @returns A Commander Command instance for the snapshot subcommand.
 */
export function createSnapshotCommand(): Command {
  const cmd = new Command("snapshot")
    .description("Capture a snapshot from a live MCP server")
    .option("--command <cmd>", "stdio transport: command to run")
    .option("--args <args...>", "stdio transport: arguments for the command")
    .option("--url <url>", "streamable-http transport: server URL")
    .option("--config <path>", "Path to mcp.json config file")
    .option("--server <name>", "Server name from config file")
    .option("--env <pairs...>", "Environment variables (KEY=VALUE)")
    .action(
      handleErrors(async (options: Record<string, unknown>) => {
        const parentOpts = cmd.parent?.opts() ?? {};
        const outputPath = parentOpts.output as string | undefined;
        const quiet = parentOpts.quiet === true;

        const config = resolveTransport(options);

        if (!quiet) {
          process.stderr.write("Connecting to MCP server...\n");
        }

        const { client, transport, protocolVersion } = await connectToServer(config);

        const serverVersion = client.getServerVersion();
        const serverCapabilities = client.getServerCapabilities() ?? {};

        if (!quiet && serverVersion) {
          process.stderr.write(`Connected to ${serverVersion.name} v${serverVersion.version}\n`);
        }

        const data = await captureServerData(client);

        await transport.close();

        const server: SnapshotServer = {
          name: serverVersion?.name ?? "unknown",
          version: serverVersion?.version ?? "unknown",
          protocolVersion,
          capabilities: serverCapabilities as Record<string, unknown>,
        };

        const source = config.transport === "stdio"
          ? [config.command, ...(config.args ?? [])].join(" ")
          : config.url;

        const capture: SnapshotCapture = {
          transport: config.transport,
          source,
          tool: "mcpdiff/0.1.0",
        };

        const snapshot = createSnapshot({
          server,
          tools: data.tools,
          resources: data.resources,
          resourceTemplates: data.resourceTemplates,
          prompts: data.prompts,
          capture,
        });

        const prettyPrint = outputPath !== undefined || process.stdout.isTTY;
        const json = prettyPrint
          ? JSON.stringify(snapshot, null, 2)
          : JSON.stringify(snapshot);

        writeOutput(`${json}\n`, outputPath);

        if (!quiet && outputPath) {
          process.stderr.write(`Snapshot written to ${outputPath}\n`);
        }
      }),
    );

  return cmd;
}
