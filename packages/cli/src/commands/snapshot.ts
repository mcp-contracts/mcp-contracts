import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { listConfigServers } from "../mcp-config.js";
import type { TransportOptions } from "../transport.js";
import { addTransportOptions, resolveTransport } from "../transport.js";
import { handleErrors, writeOutput } from "../utils.js";
import { captureSnapshot } from "./capture.js";
import { captureAllServers } from "./capture-all.js";

/**
 * Converts a server name into a safe snapshot file name.
 *
 * @param serverName - The server name from the config.
 * @returns The name with unsafe path characters replaced by "-", plus the .mcpc.json extension.
 */
export function snapshotFileName(serverName: string): string {
  return `${serverName.replace(/[^a-zA-Z0-9._-]/g, "-")}.mcpc.json`;
}

/**
 * Captures every server in the config and writes one snapshot file per server.
 *
 * @param configPath - Path to the mcp.json config file.
 * @param outDir - Directory to write the .mcpc.json files into.
 * @param quiet - Suppress non-essential output.
 */
async function snapshotAll(configPath: string, outDir: string, quiet: boolean): Promise<void> {
  const servers = listConfigServers(configPath);
  const { entries, failures } = await captureAllServers(servers, quiet);

  mkdirSync(outDir, { recursive: true });
  for (const entry of entries) {
    const filePath = join(outDir, snapshotFileName(entry.serverName));
    writeFileSync(filePath, `${JSON.stringify(entry.snapshot, null, 2)}\n`, "utf-8");
    if (!quiet) {
      process.stderr.write(`Snapshot written to ${filePath}\n`);
    }
  }

  if (!quiet) {
    process.stderr.write(`\n${entries.length}/${servers.length} servers captured\n`);
  }

  if (failures.length > 0) {
    const failed = failures.map((f) => `${f.serverName} (${f.error})`).join(", ");
    throw new Error(`Failed to capture ${failures.length} server(s): ${failed}`);
  }
}

/**
 * Creates the `snapshot` subcommand for the mcpdiff CLI.
 *
 * @returns A Commander Command instance for the snapshot subcommand.
 */
export function createSnapshotCommand(): Command {
  const cmd = new Command("snapshot").description("Capture a snapshot from a live MCP server");

  addTransportOptions(cmd);
  cmd
    .option("--all", "Snapshot every server in the config file (requires --config)")
    .option("--out-dir <dir>", "Directory for --all snapshot files", "contracts");

  cmd.action(
    handleErrors(async (options: Record<string, unknown>) => {
      const parentOpts = cmd.parent?.opts() ?? {};
      const outputPath = parentOpts["output"] as string | undefined;
      const quiet = parentOpts["quiet"] === true;

      if (options["all"] === true) {
        const configPath = options["config"] as string | undefined;
        if (!configPath) {
          throw new Error("--all requires --config");
        }
        await snapshotAll(configPath, options["outDir"] as string, quiet);
        return;
      }

      const transportOpts: TransportOptions = {
        command: options["command"] as string | undefined,
        url: options["url"] as string | undefined,
        config: options["config"] as string | undefined,
        server: options["server"] as string | undefined,
        args: options["args"] as string[] | undefined,
        env: options["env"] as string[] | undefined,
        sse: options["sse"] === true ? true : undefined,
        header: options["header"] as string[] | undefined,
      };
      const config = resolveTransport(transportOpts);

      const { snapshot } = await captureSnapshot({ transport: config, quiet });

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
