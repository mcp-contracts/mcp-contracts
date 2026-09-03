/**
 * mcp-test CLI entry point.
 *
 * Thin wrapper around the @mcp-contracts/test library.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { type MCPContractSnapshot, resolveCommandString } from "@mcp-contracts/core";
import { Command } from "commander";
import { formatTestJson, formatTestMarkdown, formatTestTerminal } from "./format.js";
import { runContractTests } from "./runner.js";
import type { TestRunOptions, TestServerConfig } from "./types.js";

type OutputFormat = "terminal" | "json" | "markdown";

/**
 * Reads and validates a contract snapshot file.
 *
 * @param filePath - Path to the .mcpc.json file.
 * @returns The parsed snapshot.
 */
function readContract(filePath: string): MCPContractSnapshot {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: Failed to read contract file "${filePath}": ${message}\n`);
    process.exit(2);
  }

  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (typeof data["snapshotVersion"] !== "string") {
      throw new Error('Missing "snapshotVersion" field');
    }
    return data as unknown as MCPContractSnapshot;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: Invalid contract file "${filePath}": ${message}\n`);
    process.exit(2);
  }
}

/**
 * Parses repeatable --header "Key: Value" strings into a record.
 *
 * @param headers - Array of "Key: Value" strings.
 * @returns Record mapping header names to values.
 */
function parseHeaders(headers: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const h of headers) {
    const idx = h.indexOf(":");
    if (idx === -1) {
      throw new Error(`Invalid header "${h}": expected "Key: Value" format`);
    }
    result[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
  }
  return result;
}

/**
 * Parses repeatable --env "KEY=VALUE" strings into a record.
 *
 * @param pairs - Array of "KEY=VALUE" strings.
 * @returns Record mapping env var names to values.
 */
function parseEnvPairs(pairs: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const p of pairs) {
    const idx = p.indexOf("=");
    if (idx === -1) {
      throw new Error(`Invalid env pair "${p}": expected "KEY=VALUE" format`);
    }
    result[p.slice(0, idx)] = p.slice(idx + 1);
  }
  return result;
}

/**
 * Resolves the output format based on the --format option and TTY detection.
 *
 * @param format - The user-provided format option.
 * @returns The resolved format.
 */
function resolveFormat(format: string | undefined): OutputFormat {
  if (format === "json" || format === "markdown" || format === "terminal") return format;
  return process.stdout.isTTY ? "terminal" : "json";
}

const program = new Command();

program
  .name("mcp-test")
  .description("Contract conformance testing for MCP servers")
  .version("0.8.0");

program
  .command("run")
  .description("Run contract tests against a live MCP server")
  .argument("<contract>", "Path to the .mcpc.json contract file")
  .option("--command <cmd>", 'Server command for stdio transport (e.g. "node server.js")')
  .option("--args <args...>", "Arguments for the server command")
  .option("--url <url>", "Server URL for streamable-http transport")
  .option("--sse", "Use SSE transport instead of streamable-http")
  .option("--header <header...>", "Custom HTTP headers (repeatable, Key: Value)")
  .option("--env <pairs...>", "Environment variables (repeatable, KEY=VALUE)")
  .option("--format <format>", "Output format: terminal | json | markdown")
  .option("--no-conformance", "Skip schema conformance tests")
  .option("--no-boundary", "Skip boundary input tests")
  .option("--allow-extra-tools", "Allow tools not in the contract")
  .option("--ignore-descriptions", "Ignore description differences")
  .option("--skip-tools <names...>", "Skip specific tools")
  .option("--timeout <ms>", "Global timeout in ms", "120000")
  .option("-o, --output <path>", "Write report to file instead of stdout")
  .action(async (contractPath: string, opts: Record<string, unknown>) => {
    process.stderr.write(
      "Note: contract testing is now built into the mcpdiff CLI as 'mcpdiff test'; the mcp-test bin will be removed in a future release\n",
    );
    try {
      const contract = readContract(contractPath);

      // Resolve server config
      const hasCommand = typeof opts["command"] === "string";
      const hasUrl = typeof opts["url"] === "string";

      if (!hasCommand && !hasUrl) {
        process.stderr.write("Error: Specify --command or --url\n");
        process.exit(2);
      }

      const stdio = hasCommand
        ? resolveCommandString(opts["command"] as string, opts["args"] as string[] | undefined)
        : undefined;

      const serverConfig: TestServerConfig = {
        transport: hasCommand ? "stdio" : opts["sse"] ? "sse" : "streamable-http",
        command: stdio?.command,
        args: stdio?.args,
        url: opts["url"] as string | undefined,
        headers: opts["header"] ? parseHeaders(opts["header"] as string[]) : undefined,
        env: opts["env"] ? parseEnvPairs(opts["env"] as string[]) : undefined,
        timeoutMs: 30_000,
      };

      const skipTools = opts["skipTools"] as string[] | undefined;

      const runOptions: TestRunOptions = {
        contract,
        contractPath,
        server: serverConfig,
        conformance:
          opts["conformance"] === false
            ? false
            : {
                allowExtraTools: opts["allowExtraTools"] === true,
                ignoreDescriptions: opts["ignoreDescriptions"] === true,
                skipTools,
              },
        boundary: opts["boundary"] === false ? false : { skipTools },
        timeoutMs: Number(opts["timeout"]),
      };

      const report = await runContractTests(runOptions);

      // Format output
      const format = resolveFormat(opts["format"] as string | undefined);
      let output: string;
      switch (format) {
        case "json":
          output = formatTestJson(report);
          break;
        case "markdown":
          output = formatTestMarkdown(report);
          break;
        default:
          output = formatTestTerminal(report);
          break;
      }

      if (opts["output"]) {
        writeFileSync(opts["output"] as string, output, "utf-8");
      } else {
        process.stdout.write(`${output}\n`);
      }

      // Exit codes: 0 = all pass, 1 = failures, 2 = tool error
      if (report.summary.failed > 0 || report.summary.errors > 0) {
        process.exit(1);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: ${message}\n`);
      process.exit(2);
    }
  });

program.parse();
