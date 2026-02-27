import type { Command } from "commander";
import type { ResolvedTransport } from "./commands/mcp-client.js";
import { readMcpConfig } from "./commands/mcp-client.js";
import { parseEnvPairs } from "./utils.js";

/** Options accepted by resolveTransport. */
export interface TransportOptions {
  command?: string;
  url?: string;
  config?: string;
  server?: string;
  args?: string[];
  env?: string[];
}

/**
 * Resolves transport configuration from CLI options.
 *
 * Validates that exactly one transport method is specified:
 * --command (stdio), --url (streamable-http), or --config (mcp.json).
 *
 * @param options - Object with command, url, config, server, args, env fields.
 * @returns A ResolvedTransport configuration.
 */
export function resolveTransport(options: TransportOptions): ResolvedTransport {
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
    return readMcpConfig(options.config as string, options.server);
  }

  if (hasUrl) {
    return { transport: "streamable-http", url: options.url as string };
  }

  return {
    transport: "stdio",
    command: options.command as string,
    args: options.args,
    env: options.env ? parseEnvPairs(options.env) : undefined,
  };
}

/**
 * Adds the standard transport options to a Commander command.
 *
 * Avoids repeating the 6 .option() calls across commands that need
 * transport configuration (snapshot, baseline, ci).
 *
 * @param cmd - The Commander command to add options to.
 * @returns The command with transport options added.
 */
export function addTransportOptions(cmd: Command): Command {
  return cmd
    .option("--command <cmd>", "Server command to run via stdio transport")
    .option("--args <args...>", "Arguments for the server command")
    .option("--url <url>", "Server URL for streamable-http transport")
    .option("--config <path>", "Path to mcp.json config file")
    .option("--server <name>", "Server name from config file")
    .option("--env <pairs...>", "Environment variables as KEY=VALUE pairs");
}
