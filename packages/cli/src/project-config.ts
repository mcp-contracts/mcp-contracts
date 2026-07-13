/**
 * mcpcontracts.json discovery, loading, and option resolution.
 *
 * The schema and validation live in @mcp-contracts/core; this module handles
 * the I/O side: finding the file by walking up from the CWD, reading it, and
 * resolving CLI options with flags > config file > built-in defaults
 * precedence.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { ProjectConfig } from "@mcp-contracts/core";
import {
  isProjectServerCommand,
  isProjectServerUrl,
  PROJECT_CONFIG_FILENAME,
  parseProjectConfig,
} from "@mcp-contracts/core";
import type { ResolvedTransport } from "./commands/mcp-client.js";
import { readMcpConfig } from "./mcp-config.js";
import { extractTransportOptions, hasTransportFlags, resolveTransport } from "./transport.js";

/** Default baseline path used when neither flags nor config specify one. */
export const DEFAULT_BASELINE_PATH = "contracts/baseline.mcpc.json";

/** A project config together with where it was found. */
export interface LoadedProjectConfig {
  /** Absolute path to the config file. */
  path: string;
  /** Directory containing the config file; base for its relative paths. */
  dir: string;
  /** The validated config contents. */
  config: ProjectConfig;
}

/**
 * Finds the nearest mcpcontracts.json by walking up from a directory.
 *
 * @param startDir - Directory to start the search from.
 * @returns Absolute path to the config file, or null if none exists.
 */
export function discoverProjectConfig(startDir: string): string | null {
  let dir = resolve(startDir);
  while (true) {
    const candidate = join(dir, PROJECT_CONFIG_FILENAME);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

/**
 * Loads and validates the project config.
 *
 * With an explicit path (--project), the file must exist. Otherwise the file
 * is discovered by walking up from the CWD, and its absence is not an error.
 * A file that exists but fails to parse or validate always throws, so typos
 * are surfaced even when flags would have overridden the config.
 *
 * @param explicitPath - Path from the --project option, if given.
 * @param cwd - Directory to resolve and discover from (defaults to process.cwd()).
 * @returns The loaded config, or null when no config file exists.
 */
export function loadProjectConfig(
  explicitPath: string | undefined,
  cwd: string = process.cwd(),
): LoadedProjectConfig | null {
  let path: string;
  if (explicitPath) {
    path = resolve(cwd, explicitPath);
    if (!existsSync(path)) {
      throw new Error(`Project config file "${path}" not found`);
    }
  } else {
    const discovered = discoverProjectConfig(cwd);
    if (!discovered) {
      return null;
    }
    path = discovered;
  }

  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read project config "${path}": ${message}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in project config "${path}"`);
  }

  let config: ProjectConfig;
  try {
    config = parseProjectConfig(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${message} (in "${path}")`);
  }

  return { path, dir: dirname(path), config };
}

/**
 * Resolves a possibly-relative path against the config file's directory.
 *
 * @param project - The loaded project config.
 * @param path - Path from the config file.
 * @returns An absolute path.
 */
export function resolveProjectPath(project: LoadedProjectConfig, path: string): string {
  return isAbsolute(path) ? path : resolve(project.dir, path);
}

/**
 * Resolves the project config's server block into a transport.
 *
 * Stdio servers spawn with the config file's directory as their working
 * directory, so relative command args (e.g. "node server.js") work no matter
 * which subdirectory the CLI runs from.
 *
 * @param project - The loaded project config.
 * @returns The resolved transport configuration.
 */
export function resolveProjectTransport(project: LoadedProjectConfig): ResolvedTransport {
  const server = project.config.server;
  if (!server) {
    throw new Error(`Project config "${project.path}" has no "server" block`);
  }
  if (isProjectServerCommand(server)) {
    return {
      transport: "stdio",
      command: server.command,
      args: server.args,
      env: server.env,
      cwd: project.dir,
    };
  }
  if (isProjectServerUrl(server)) {
    return {
      transport: server.sse ? "sse" : "streamable-http",
      url: server.url,
      headers: server.headers,
    };
  }
  const mcpConfigPath = resolveProjectPath(project, server.config);
  const resolved = readMcpConfig(mcpConfigPath, server.name);
  if (resolved.transport === "stdio") {
    resolved.cwd = dirname(mcpConfigPath);
  }
  return resolved;
}

/**
 * Resolves the transport from CLI flags or the project config's server block.
 *
 * Any transport flag on the command line means the config's server block is
 * ignored entirely; the two sources are never partially merged.
 *
 * @param options - The raw parsed options record from a command action.
 * @param project - The loaded project config, if any.
 * @returns The resolved transport configuration.
 */
export function resolveTransportOrProject(
  options: Record<string, unknown>,
  project: LoadedProjectConfig | null,
): ResolvedTransport {
  const flags = extractTransportOptions(options);
  if (hasTransportFlags(flags)) {
    return resolveTransport(flags);
  }
  if (project?.config.server) {
    return resolveProjectTransport(project);
  }
  const hint = project
    ? `add a "server" block to "${project.path}"`
    : `create an ${PROJECT_CONFIG_FILENAME} with a "server" block`;
  throw new Error(`Specify one of: --command, --url, or --config (or ${hint})`);
}

/**
 * Resolves the baseline path from a CLI flag or the project config.
 *
 * A relative baseline in the config resolves against the config file's
 * directory, so commands behave the same from any subdirectory.
 *
 * @param flagValue - The --baseline (or --output) value, if given.
 * @param project - The loaded project config, if any.
 * @returns The resolved baseline path, or undefined if neither source has one.
 */
export function resolveBaselinePath(
  flagValue: string | undefined,
  project: LoadedProjectConfig | null,
): string | undefined {
  if (flagValue) {
    return flagValue;
  }
  if (project?.config.baseline) {
    return resolveProjectPath(project, project.config.baseline);
  }
  return undefined;
}
