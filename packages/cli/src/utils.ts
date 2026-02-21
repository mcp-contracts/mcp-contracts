import { readFileSync, writeFileSync } from "node:fs";
import type { MCPContractSnapshot } from "@mcp-contracts/core";

/** Output format for CLI commands. */
export type OutputFormat = "terminal" | "json" | "markdown";

/**
 * Reads and validates a snapshot file from disk.
 *
 * Performs structural validation to catch corrupt or non-snapshot files early
 * with descriptive error messages.
 *
 * @param filePath - Path to the .mcpc.json file.
 * @returns The parsed snapshot object.
 */
export function readSnapshotFile(filePath: string): MCPContractSnapshot {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read snapshot file "${filePath}": ${message}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in snapshot file "${filePath}"`);
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(`Snapshot file "${filePath}" must contain a JSON object`);
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.snapshotVersion !== "string") {
    throw new Error(`Snapshot file "${filePath}" is missing "snapshotVersion"`);
  }

  if (typeof obj.server !== "object" || obj.server === null) {
    throw new Error(`Snapshot file "${filePath}" is missing "server" object`);
  }

  const server = obj.server as Record<string, unknown>;
  if (typeof server.name !== "string") {
    throw new Error(`Snapshot file "${filePath}" is missing "server.name"`);
  }

  if (typeof obj.tools !== "object" || obj.tools === null || Array.isArray(obj.tools)) {
    throw new Error(`Snapshot file "${filePath}" is missing "tools" object`);
  }

  if (typeof obj.resources !== "object" || obj.resources === null || Array.isArray(obj.resources)) {
    throw new Error(`Snapshot file "${filePath}" is missing "resources" object`);
  }

  if (typeof obj.prompts !== "object" || obj.prompts === null || Array.isArray(obj.prompts)) {
    throw new Error(`Snapshot file "${filePath}" is missing "prompts" object`);
  }

  if (typeof obj.contentHash !== "string" || !obj.contentHash.startsWith("sha256:")) {
    throw new Error(
      `Snapshot file "${filePath}" has invalid "contentHash" (expected "sha256:..." format)`,
    );
  }

  return data as MCPContractSnapshot;
}

/**
 * Resolves the output format from the CLI option, defaulting based on TTY detection.
 *
 * @param formatOption - The --format value from the CLI, if provided.
 * @returns The resolved output format.
 */
export function resolveFormat(formatOption: string | undefined): OutputFormat {
  if (formatOption === "terminal" || formatOption === "json" || formatOption === "markdown") {
    return formatOption;
  }
  return process.stdout.isTTY ? "terminal" : "json";
}

/**
 * Writes content to a file or stdout.
 *
 * @param content - The string content to write.
 * @param outputPath - File path to write to, or undefined for stdout.
 */
export function writeOutput(content: string, outputPath: string | undefined): void {
  if (outputPath) {
    writeFileSync(outputPath, content, "utf-8");
  } else {
    process.stdout.write(content);
  }
}

/**
 * Strips ANSI escape codes from a string.
 *
 * @param str - The string potentially containing ANSI codes.
 * @returns The string with ANSI codes removed.
 */
export function stripAnsi(str: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI escape sequence matching
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Error class for intentional non-error exits (e.g., exit code 1 for breaking changes).
 * Used to signal that the process should exit with a specific code without
 * being caught by the generic error handler.
 */
export class CliExitError extends Error {
  constructor(public readonly exitCode: number) {
    super(`exit(${exitCode})`);
    this.name = "CliExitError";
  }
}

/**
 * Wraps an async command action handler with error handling.
 *
 * Catches errors, prints to stderr, and exits with code 2.
 * Re-throws CliExitError so intentional exits are not treated as errors.
 *
 * @param fn - The async action function to wrap.
 * @returns A wrapped function that handles errors gracefully.
 */
export function handleErrors<T extends (...args: never[]) => Promise<void>>(fn: T): T {
  const wrapped = async (...args: Parameters<T>): Promise<void> => {
    try {
      await fn(...args);
    } catch (err) {
      if (err instanceof CliExitError) {
        process.exit(err.exitCode);
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: ${message}\n`);
      process.exit(2);
    }
  };
  return wrapped as unknown as T;
}

/**
 * Parses environment variable pairs from CLI --env arguments.
 *
 * @param pairs - Array of "KEY=VALUE" strings.
 * @returns Record of environment variables.
 */
export function parseEnvPairs(pairs: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of pairs) {
    const eqIndex = pair.indexOf("=");
    if (eqIndex === -1) {
      throw new Error(`Invalid environment variable "${pair}": expected KEY=VALUE format`);
    }
    result[pair.slice(0, eqIndex)] = pair.slice(eqIndex + 1);
  }
  return result;
}
