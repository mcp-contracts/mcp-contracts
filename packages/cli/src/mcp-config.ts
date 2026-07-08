/**
 * MCP client config (mcp.json / claude_desktop_config.json) reading.
 *
 * Both formats share the same shape: a top-level `mcpServers` object keyed
 * by server name, each entry declaring either a stdio `command` or a
 * remote `url`.
 */

import { readFileSync } from "node:fs";
import type { ResolvedTransport } from "./commands/mcp-client.js";

/** Shape of a single server entry in mcp.json. */
interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

/** A named server from an mcp.json config with its resolved transport. */
export interface ConfigServer {
  /** The server's name (its key in the `mcpServers` object). */
  name: string;
  /** The resolved transport configuration for connecting to it. */
  transport: ResolvedTransport;
}

/**
 * Reads and parses the `mcpServers` object from a config file.
 *
 * @param configPath - Path to the mcp.json config file.
 * @returns The raw server entries keyed by server name.
 */
function parseConfigFile(configPath: string): Record<string, McpServerConfig> {
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read config file "${configPath}": ${message}`);
  }

  let config: unknown;
  try {
    config = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in config file "${configPath}"`);
  }

  if (typeof config !== "object" || config === null) {
    throw new Error(`Config file "${configPath}" must contain a JSON object`);
  }

  const servers = (config as Record<string, unknown>)["mcpServers"];
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    throw new Error(`Config file "${configPath}" is missing "mcpServers" object`);
  }

  return servers as Record<string, McpServerConfig>;
}

/**
 * Resolves a single config entry into a transport configuration.
 *
 * @param name - The server's name (used in error messages).
 * @param entry - The raw config entry.
 * @returns The resolved transport configuration.
 */
function resolveServerEntry(name: string, entry: McpServerConfig): ResolvedTransport {
  if (entry.url) {
    return { transport: "streamable-http", url: entry.url };
  }
  if (entry.command) {
    return {
      transport: "stdio",
      command: entry.command,
      args: entry.args,
      env: entry.env,
    };
  }
  throw new Error(`Server "${name}" has neither "command" nor "url" configured`);
}

/**
 * Reads and resolves a single server configuration from an mcp.json file.
 *
 * If only one server is defined and no --server is given, it's auto-selected.
 * If multiple servers exist, --server must be specified.
 *
 * @param configPath - Path to the mcp.json config file.
 * @param serverName - Optional server name to select.
 * @returns The resolved transport configuration.
 */
export function readMcpConfig(
  configPath: string,
  serverName: string | undefined,
): ResolvedTransport {
  const servers = parseConfigFile(configPath);
  const serverNames = Object.keys(servers);
  if (serverNames.length === 0) {
    throw new Error(`Config file "${configPath}" has no server entries`);
  }

  let selectedName: string;
  if (serverName) {
    if (!servers[serverName]) {
      throw new Error(
        `Server "${serverName}" not found in config. Available: ${serverNames.join(", ")}`,
      );
    }
    selectedName = serverName;
  } else if (serverNames.length === 1) {
    selectedName = serverNames[0] as string;
  } else {
    throw new Error(
      `Multiple servers in config. Use --server to select one: ${serverNames.join(", ")}`,
    );
  }

  const entry = servers[selectedName];
  if (!entry) {
    throw new Error(`Server "${selectedName}" not found in config`);
  }

  return resolveServerEntry(selectedName, entry);
}

/**
 * Reads all server configurations from an mcp.json file.
 *
 * Used by multi-server commands (snapshot --all, composition diff,
 * check-conflicts, graph) to operate on the entire composition.
 *
 * @param configPath - Path to the mcp.json config file.
 * @returns All servers with resolved transports, ordered by name.
 */
export function listConfigServers(configPath: string): ConfigServer[] {
  const servers = parseConfigFile(configPath);
  const serverNames = Object.keys(servers);
  if (serverNames.length === 0) {
    throw new Error(`Config file "${configPath}" has no server entries`);
  }

  return serverNames
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      transport: resolveServerEntry(name, servers[name] as McpServerConfig),
    }));
}
