import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createSnapshot, diffSnapshots } from "@mcp-contracts/core";
import type { SnapshotCapture, SnapshotServer } from "@mcp-contracts/core";
import { Command } from "commander";
import { addTransportOptions, resolveTransport } from "../transport.js";
import type { TransportOptions } from "../transport.js";
import { CliExitError, handleErrors, readSnapshotFile, writeOutput } from "../utils.js";
import { captureServerData, connectToServer } from "./mcp-client.js";

const DEFAULT_BASELINE_PATH = "contracts/baseline.mcpc.json";

/**
 * Resolves the root program options from a deeply nested subcommand.
 *
 * @param cmd - The current Command instance.
 * @returns The root program's parsed options.
 */
function getRootOpts(cmd: Command): Record<string, unknown> {
  let current: Command | null = cmd;
  while (current.parent) {
    current = current.parent;
  }
  return current.opts();
}

/**
 * Creates the `baseline update` subcommand.
 *
 * Captures a snapshot from a live server and writes it to a baseline path.
 * Uses the global --output option from the root program, defaulting to
 * contracts/baseline.mcpc.json if not specified.
 *
 * @returns A Commander Command instance.
 */
export function createBaselineUpdateCommand(): Command {
  const cmd = new Command("update").description(
    "Capture a snapshot and write it as a baseline file",
  );

  addTransportOptions(cmd);

  cmd.action(
    handleErrors(async (options: Record<string, unknown>) => {
      const rootOpts = getRootOpts(cmd);
      const quiet = rootOpts.quiet === true;
      const outputPath = (rootOpts.output as string | undefined) ?? DEFAULT_BASELINE_PATH;

      const transportOpts: TransportOptions = {
        command: options.command as string | undefined,
        url: options.url as string | undefined,
        config: options.config as string | undefined,
        server: options.server as string | undefined,
        args: options.args as string[] | undefined,
        env: options.env as string[] | undefined,
      };
      const config = resolveTransport(transportOpts);

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

      const source =
        config.transport === "stdio"
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

      mkdirSync(dirname(outputPath), { recursive: true });
      const json = JSON.stringify(snapshot, null, 2);
      writeOutput(`${json}\n`, outputPath);

      if (!quiet) {
        process.stderr.write(`Baseline written to ${outputPath}\n`);
      }
    }),
  );

  return cmd;
}

/**
 * Creates the `baseline verify` subcommand.
 *
 * Verifies the current server matches a committed baseline by comparing content hashes.
 *
 * @returns A Commander Command instance.
 */
export function createBaselineVerifyCommand(): Command {
  const cmd = new Command("verify").description(
    "Verify the current server matches a committed baseline",
  );

  addTransportOptions(cmd);

  cmd.option("--baseline <path>", "Path to baseline file", DEFAULT_BASELINE_PATH).action(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestration function
    handleErrors(async (options: Record<string, unknown>) => {
      const rootOpts = getRootOpts(cmd);
      const quiet = rootOpts.quiet === true;
      const baselinePath = (options.baseline as string) ?? DEFAULT_BASELINE_PATH;

      const baseline = readSnapshotFile(baselinePath);

      const transportOpts: TransportOptions = {
        command: options.command as string | undefined,
        url: options.url as string | undefined,
        config: options.config as string | undefined,
        server: options.server as string | undefined,
        args: options.args as string[] | undefined,
        env: options.env as string[] | undefined,
      };
      const config = resolveTransport(transportOpts);

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

      const source =
        config.transport === "stdio"
          ? [config.command, ...(config.args ?? [])].join(" ")
          : config.url;

      const capture: SnapshotCapture = {
        transport: config.transport,
        source,
        tool: "mcpdiff/0.1.0",
      };

      const current = createSnapshot({
        server,
        tools: data.tools,
        resources: data.resources,
        resourceTemplates: data.resourceTemplates,
        prompts: data.prompts,
        capture,
      });

      if (baseline.contentHash === current.contentHash) {
        if (!quiet) {
          process.stderr.write("Baseline verified: contract unchanged\n");
        }
        return;
      }

      const report = diffSnapshots(baseline, current);
      const { breaking, warning, safe } = report.summary;
      const parts: string[] = [];
      if (breaking > 0) parts.push(`${breaking} breaking`);
      if (warning > 0) parts.push(`${warning} warning`);
      if (safe > 0) parts.push(`${safe} safe`);
      const summary = parts.length > 0 ? parts.join(", ") : "0";

      process.stderr.write(`Baseline mismatch: contract has changed (${summary} changes)\n`);
      throw new CliExitError(1);
    }),
  );

  return cmd;
}

/**
 * Creates the `baseline` command group with `update` and `verify` subcommands.
 *
 * @returns A Commander Command instance.
 */
export function createBaselineCommand(): Command {
  const baseline = new Command("baseline").description("Manage contract baselines");

  baseline.addCommand(createBaselineUpdateCommand());
  baseline.addCommand(createBaselineVerifyCommand());

  return baseline;
}
