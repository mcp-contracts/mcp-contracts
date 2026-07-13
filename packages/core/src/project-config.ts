/**
 * mcpcontracts.json project config: types, schema, and validation.
 *
 * The project config file lets repeated CLI invocations (locally and in CI)
 * omit transport and baseline flags. This module only defines the format and
 * validates parsed JSON data — file discovery and reading live in the CLI.
 */

import { z } from "zod/v4";
import type { Severity } from "./diff-types.js";

/** File name of the project config, discovered by walking up from the CWD. */
export const PROJECT_CONFIG_FILENAME = "mcpcontracts.json";

/** Server reached by spawning a command over stdio. */
export interface ProjectServerCommand {
  /** Executable to run (e.g. "node"). */
  command: string;
  /** Arguments for the command. */
  args?: string[];
  /** Environment variables for the spawned process. */
  env?: Record<string, string>;
}

/** Server reached over streamable-http or SSE. */
export interface ProjectServerUrl {
  /** Server URL. */
  url: string;
  /** Use SSE transport instead of streamable-http. */
  sse?: boolean;
  /** Custom HTTP headers. */
  headers?: Record<string, string>;
}

/** Server defined in an external mcp.json config file. */
export interface ProjectServerConfigRef {
  /** Path to the mcp.json file, relative to the project config. */
  config: string;
  /** Server name to select when the config defines several. */
  name?: string;
}

/** One of the three ways to reach the server. */
export type ProjectServer = ProjectServerCommand | ProjectServerUrl | ProjectServerConfigRef;

/** Watch-mode settings. */
export interface ProjectWatchSettings {
  /** Paths to watch for changes. */
  paths?: string[];
  /** Debounce interval in milliseconds. */
  debounce?: number;
}

/** Parsed mcpcontracts.json contents. */
export interface ProjectConfig {
  /** How to reach the MCP server. */
  server?: ProjectServer;
  /** Path to the baseline snapshot, relative to the project config. */
  baseline?: string;
  /** Severity threshold that triggers exit code 1. */
  failOn?: Severity;
  /** Watch-mode settings. */
  watch?: ProjectWatchSettings;
}

const serverSchema = z
  .strictObject({
    command: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    url: z.string().min(1).optional(),
    sse: z.boolean().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    config: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
  })
  .superRefine((server, ctx) => {
    const transports = [server.command, server.url, server.config].filter(
      (v) => v !== undefined,
    ).length;
    if (transports !== 1) {
      ctx.addIssue({
        code: "custom",
        message: 'specify exactly one of "command", "url", or "config"',
      });
    }
    const requires: Array<[unknown, string, string]> = [
      [server.args, "args", "command"],
      [server.env, "env", "command"],
      [server.sse, "sse", "url"],
      [server.headers, "headers", "url"],
      [server.name, "name", "config"],
    ];
    for (const [value, key, owner] of requires) {
      if (value !== undefined && server[owner as "command" | "url" | "config"] === undefined) {
        ctx.addIssue({
          code: "custom",
          message: `"${key}" is only valid with "${owner}"`,
          path: [key],
        });
      }
    }
  });

const watchSchema = z.strictObject({
  paths: z.array(z.string().min(1)).min(1).optional(),
  debounce: z.number().int().positive().optional(),
});

const projectConfigSchemaInternal = z.strictObject({
  server: serverSchema.optional(),
  baseline: z.string().min(1).optional(),
  failOn: z.enum(["safe", "warning", "breaking"]).optional(),
  watch: watchSchema.optional(),
});

/**
 * Zod schema for mcpcontracts.json.
 *
 * The runtime refinements guarantee the `ProjectServer` union invariant
 * (exactly one transport key), which the inferred type cannot express.
 */
export const projectConfigSchema =
  projectConfigSchemaInternal as unknown as z.ZodType<ProjectConfig>;

/**
 * Formats a single zod issue as "path: message".
 *
 * @param issue - The zod issue to format.
 * @returns A human-readable description naming the offending key.
 */
function formatIssue(issue: z.core.$ZodIssue): string {
  if (issue.path.length === 0) {
    return issue.message;
  }
  return `"${issue.path.join(".")}": ${issue.message}`;
}

/**
 * Validates parsed JSON data as a project config.
 *
 * Unknown keys are an error, so typos like "failon" are caught instead of
 * silently ignored.
 *
 * @param data - Parsed JSON data (e.g. from an mcpcontracts.json file).
 * @returns The validated ProjectConfig.
 */
export function parseProjectConfig(data: unknown): ProjectConfig {
  const result = projectConfigSchemaInternal.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map(formatIssue).join("; ");
    throw new Error(`Invalid project config: ${details}`);
  }
  return result.data as ProjectConfig;
}

/**
 * Narrows a ProjectServer to the stdio command variant.
 *
 * @param server - The server block to test.
 * @returns True if the server is reached by spawning a command.
 */
export function isProjectServerCommand(server: ProjectServer): server is ProjectServerCommand {
  return "command" in server && server.command !== undefined;
}

/**
 * Narrows a ProjectServer to the URL variant.
 *
 * @param server - The server block to test.
 * @returns True if the server is reached over HTTP/SSE.
 */
export function isProjectServerUrl(server: ProjectServer): server is ProjectServerUrl {
  return "url" in server && server.url !== undefined;
}

/**
 * Narrows a ProjectServer to the mcp.json reference variant.
 *
 * @param server - The server block to test.
 * @returns True if the server is defined in an external mcp.json file.
 */
export function isProjectServerConfigRef(server: ProjectServer): server is ProjectServerConfigRef {
  return "config" in server && server.config !== undefined;
}
