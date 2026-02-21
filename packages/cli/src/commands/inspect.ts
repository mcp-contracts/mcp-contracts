import type { MCPContractSnapshot } from "@mcp-contracts/core";
import Table from "cli-table3";
import { Command } from "commander";
import { handleErrors, readSnapshotFile, resolveFormat, stripAnsi, writeOutput } from "../utils.js";
import type { OutputFormat } from "../utils.js";

/**
 * Formats a summary table of the snapshot for terminal display.
 *
 * @param snapshot - The snapshot to summarize.
 * @returns A terminal-formatted string with server info and counts.
 */
function formatSummaryTerminal(snapshot: MCPContractSnapshot): string {
  const table = new Table();
  table.push(
    { Server: snapshot.server.name },
    { Version: snapshot.server.version },
    { Protocol: snapshot.server.protocolVersion },
    { "Captured At": snapshot.capturedAt },
    { "Content Hash": snapshot.contentHash },
    { Tools: String(Object.keys(snapshot.tools).length) },
    { Resources: String(Object.keys(snapshot.resources).length) },
    { Prompts: String(Object.keys(snapshot.prompts).length) },
  );
  return table.toString();
}

/**
 * Formats a summary of the snapshot as JSON.
 *
 * @param snapshot - The snapshot to summarize.
 * @returns JSON string with server info and counts.
 */
function formatSummaryJson(snapshot: MCPContractSnapshot): string {
  return JSON.stringify(
    {
      server: snapshot.server.name,
      version: snapshot.server.version,
      protocolVersion: snapshot.server.protocolVersion,
      capturedAt: snapshot.capturedAt,
      contentHash: snapshot.contentHash,
      tools: Object.keys(snapshot.tools).length,
      resources: Object.keys(snapshot.resources).length,
      prompts: Object.keys(snapshot.prompts).length,
    },
    null,
    2,
  );
}

/**
 * Formats a summary of the snapshot as markdown.
 *
 * @param snapshot - The snapshot to summarize.
 * @returns Markdown table string.
 */
function formatSummaryMarkdown(snapshot: MCPContractSnapshot): string {
  const lines = [
    "| Property | Value |",
    "| --- | --- |",
    `| Server | ${snapshot.server.name} |`,
    `| Version | ${snapshot.server.version} |`,
    `| Protocol | ${snapshot.server.protocolVersion} |`,
    `| Captured At | ${snapshot.capturedAt} |`,
    `| Content Hash | \`${snapshot.contentHash}\` |`,
    `| Tools | ${Object.keys(snapshot.tools).length} |`,
    `| Resources | ${Object.keys(snapshot.resources).length} |`,
    `| Prompts | ${Object.keys(snapshot.prompts).length} |`,
  ];
  return lines.join("\n");
}

/**
 * Formats the tools listing.
 *
 * @param snapshot - The snapshot containing tools.
 * @param format - The output format.
 * @returns Formatted string listing all tools.
 */
function formatTools(snapshot: MCPContractSnapshot, format: OutputFormat): string {
  const tools = Object.entries(snapshot.tools);

  if (format === "json") {
    return JSON.stringify(
      tools.map(([name, tool]) => ({ name, description: tool.description })),
      null,
      2,
    );
  }

  if (format === "markdown") {
    const lines = ["| Name | Description |", "| --- | --- |"];
    for (const [name, tool] of tools) {
      lines.push(`| ${name} | ${tool.description} |`);
    }
    return lines.join("\n");
  }

  const table = new Table({ head: ["Name", "Description"] });
  for (const [name, tool] of tools) {
    table.push([name, tool.description]);
  }
  return table.toString();
}

/**
 * Formats the resources listing.
 *
 * @param snapshot - The snapshot containing resources.
 * @param format - The output format.
 * @returns Formatted string listing all resources.
 */
function formatResources(snapshot: MCPContractSnapshot, format: OutputFormat): string {
  const resources = Object.entries(snapshot.resources);

  if (format === "json") {
    return JSON.stringify(
      resources.map(([uri, res]) => ({
        uri,
        description: res.description,
        mimeType: res.mimeType ?? null,
        isTemplate: res.isTemplate,
      })),
      null,
      2,
    );
  }

  if (format === "markdown") {
    const lines = ["| URI | Description | MIME Type | Template |", "| --- | --- | --- | --- |"];
    for (const [uri, res] of resources) {
      lines.push(
        `| ${uri} | ${res.description} | ${res.mimeType ?? ""} | ${res.isTemplate ? "Yes" : "No"} |`,
      );
    }
    return lines.join("\n");
  }

  const table = new Table({ head: ["URI", "Description", "MIME Type", "Template"] });
  for (const [uri, res] of resources) {
    table.push([uri, res.description, res.mimeType ?? "", res.isTemplate ? "Yes" : "No"]);
  }
  return table.toString();
}

/**
 * Formats the prompts listing.
 *
 * @param snapshot - The snapshot containing prompts.
 * @param format - The output format.
 * @returns Formatted string listing all prompts.
 */
function formatPrompts(snapshot: MCPContractSnapshot, format: OutputFormat): string {
  const prompts = Object.entries(snapshot.prompts);

  if (format === "json") {
    return JSON.stringify(
      prompts.map(([name, prompt]) => ({
        name,
        description: prompt.description,
        arguments: prompt.arguments.map((a) => a.name),
      })),
      null,
      2,
    );
  }

  if (format === "markdown") {
    const lines = ["| Name | Description | Arguments |", "| --- | --- | --- |"];
    for (const [name, prompt] of prompts) {
      const args = prompt.arguments.map((a) => a.name).join(", ");
      lines.push(`| ${name} | ${prompt.description} | ${args} |`);
    }
    return lines.join("\n");
  }

  const table = new Table({ head: ["Name", "Description", "Arguments"] });
  for (const [name, prompt] of prompts) {
    const args = prompt.arguments.map((a) => a.name).join(", ");
    table.push([name, prompt.description, args]);
  }
  return table.toString();
}

/**
 * Creates the `inspect` subcommand for the mcpdiff CLI.
 *
 * @returns A Commander Command instance for the inspect subcommand.
 */
export function createInspectCommand(): Command {
  const cmd = new Command("inspect")
    .description("Display summary of a snapshot file")
    .argument("<snapshot>", "Path to snapshot file (.mcpc.json)")
    .option("--tools", "List all tools with descriptions")
    .option("--resources", "List all resources")
    .option("--prompts", "List all prompts")
    .option("--schema <tool>", "Show full input schema for a specific tool")
    .action(
      handleErrors(async (snapshotPath: string, options: Record<string, unknown>) => {
        const snapshot = readSnapshotFile(snapshotPath);
        const parentOpts = cmd.parent?.opts() ?? {};
        const format = resolveFormat(parentOpts.format as string | undefined);
        const noColor = parentOpts.color === false;
        const outputPath = parentOpts.output as string | undefined;

        let output: string;

        if (options.schema) {
          const toolName = options.schema as string;
          const tool = snapshot.tools[toolName];
          if (!tool) {
            throw new Error(
              `Tool "${toolName}" not found in snapshot. Available tools: ${Object.keys(snapshot.tools).join(", ")}`,
            );
          }
          output = JSON.stringify(tool.inputSchema, null, 2);
        } else if (options.tools) {
          output = formatTools(snapshot, format);
        } else if (options.resources) {
          output = formatResources(snapshot, format);
        } else if (options.prompts) {
          output = formatPrompts(snapshot, format);
        } else if (format === "json") {
          output = formatSummaryJson(snapshot);
        } else if (format === "markdown") {
          output = formatSummaryMarkdown(snapshot);
        } else {
          output = formatSummaryTerminal(snapshot);
        }

        if (noColor && format === "terminal") {
          output = stripAnsi(output);
        }

        writeOutput(`${output}\n`, outputPath);
      }),
    );

  return cmd;
}
