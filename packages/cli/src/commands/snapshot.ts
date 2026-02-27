import { createSnapshot } from "@mcp-contracts/core";
import type { SnapshotCapture, SnapshotServer } from "@mcp-contracts/core";
import { Command } from "commander";
import { addTransportOptions, resolveTransport } from "../transport.js";
import type { TransportOptions } from "../transport.js";
import { handleErrors, writeOutput } from "../utils.js";
import { captureServerData, connectToServer } from "./mcp-client.js";

/**
 * Creates the `snapshot` subcommand for the mcpdiff CLI.
 *
 * @returns A Commander Command instance for the snapshot subcommand.
 */
export function createSnapshotCommand(): Command {
  const cmd = new Command("snapshot").description("Capture a snapshot from a live MCP server");

  addTransportOptions(cmd);

  cmd.action(
    handleErrors(async (options: Record<string, unknown>) => {
      const parentOpts = cmd.parent?.opts() ?? {};
      const outputPath = parentOpts.output as string | undefined;
      const quiet = parentOpts.quiet === true;

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

      const prettyPrint = outputPath !== undefined || process.stdout.isTTY;
      const json = prettyPrint ? JSON.stringify(snapshot, null, 2) : JSON.stringify(snapshot);

      writeOutput(`${json}\n`, outputPath);

      if (!quiet && outputPath) {
        process.stderr.write(`Snapshot written to ${outputPath}\n`);
      }
    }),
  );

  return cmd;
}
