import { Command } from "commander";
import type { TransportOptions } from "../transport.js";
import { addTransportOptions, resolveTransport } from "../transport.js";
import { handleErrors, writeOutput } from "../utils.js";
import { captureSnapshot } from "./capture.js";

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
        sse: options.sse === true ? true : undefined,
        header: options.header as string[] | undefined,
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
