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
  sse?: boolean;
  header?: string[];
}

/**
 * Parses repeatable --header "Key: Value" strings into a record.
 *
 * @param headers - Array of "Key: Value" strings.
 * @returns Record mapping header names to values.
 */
export function parseHeaders(headers: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const h of headers) {
    const colonIndex = h.indexOf(":");
    if (colonIndex === -1) {
      throw new Error(`Invalid header "${h}": expected "Key: Value" format`);
    }
    const key = h.slice(0, colonIndex).trim();
    const value = h.slice(colonIndex + 1).trim();
    if (!key) {
      throw new Error(`Invalid header "${h}": empty header name`);
    }
    result[key] = value;
  }
  return result;
}

/**
 * Resolves transport configuration from CLI options.
 *
 * Validates that exactly one transport method is specified:
 * --command (stdio), --url (streamable-http or sse), or --config (mcp.json).
 *
 * @param options - Object with command, url, config, server, args, env, sse, header fields.
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

  if (options.sse && !hasUrl) {
    throw new Error("--sse requires --url");
  }

  const headers = options.header ? parseHeaders(options.header) : undefined;

  if (hasConfig) {
    const resolved = readMcpConfig(options.config as string, options.server);
    if (headers) {
      resolved.headers = headers;
    }
    return resolved;
  }

  if (hasUrl) {
    const transport = options.sse ? "sse" : "streamable-http";
    return { transport, url: options.url as string, headers };
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
 * Avoids repeating the option calls across commands that need
 * transport configuration (snapshot, baseline, ci, etc.).
 *
 * @param cmd - The Commander command to add options to.
 * @returns The command with transport options added.
 */
export function addTransportOptions(cmd: Command): Command {
  return cmd
    .option("--command <cmd>", "Server command to run via stdio transport")
    .option("--args <args...>", "Arguments for the server command")
    .option("--url <url>", "Server URL for streamable-http or SSE transport")
    .option("--sse", "Use SSE transport instead of streamable-http (requires --url)")
    .option("--header <header...>", "Custom headers as \"Key: Value\" (repeatable)")
    .option("--config <path>", "Path to mcp.json config file")
    .option("--server <name>", "Server name from config file")
    .option("--env <pairs...>", "Environment variables as KEY=VALUE pairs");
}
