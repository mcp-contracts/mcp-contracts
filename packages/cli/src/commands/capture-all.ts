/**
 * Multi-server capture.
 *
 * Connects to every server of an mcp.json composition in parallel and
 * captures a snapshot per server. Shared by snapshot --all, composition
 * diff, check-conflicts, and graph.
 */

import type { ServerSnapshotEntry } from "@mcp-contracts/core";
import type { ConfigServer } from "../mcp-config.js";
import { captureSnapshot } from "./capture.js";

/** A server that could not be captured. */
export interface CaptureFailure {
  /** The server's name from the config. */
  serverName: string;
  /** The error message. */
  error: string;
}

/** Result of capturing an entire composition. */
export interface MultiCaptureResult {
  /** Successfully captured snapshots, ordered by server name. */
  entries: ServerSnapshotEntry[];
  /** Servers that failed to connect or capture, ordered by server name. */
  failures: CaptureFailure[];
}

/**
 * Captures snapshots from all configured servers in parallel.
 *
 * Failures are collected rather than thrown so that one unreachable server
 * does not prevent capturing the rest of the composition.
 *
 * @param servers - The composition's servers with resolved transports.
 * @param quiet - Suppress per-server progress output on stderr.
 * @returns Captured snapshots and per-server failures.
 */
export async function captureAllServers(
  servers: ConfigServer[],
  quiet: boolean,
): Promise<MultiCaptureResult> {
  if (!quiet) {
    process.stderr.write(`Connecting to ${servers.length} servers...\n`);
  }

  const settled = await Promise.allSettled(
    servers.map((server) => captureSnapshot({ transport: server.transport, quiet: true })),
  );

  const entries: ServerSnapshotEntry[] = [];
  const failures: CaptureFailure[] = [];

  settled.forEach((result, index) => {
    const server = servers[index] as ConfigServer;
    if (result.status === "fulfilled") {
      entries.push({ serverName: server.name, snapshot: result.value.snapshot });
      if (!quiet) {
        const toolCount = Object.keys(result.value.snapshot.tools).length;
        process.stderr.write(`✓ ${server.name}: captured (${toolCount} tools)\n`);
      }
    } else {
      const message =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      failures.push({ serverName: server.name, error: message });
      if (!quiet) {
        process.stderr.write(`✗ ${server.name}: ${message}\n`);
      }
    }
  });

  entries.sort((a, b) => a.serverName.localeCompare(b.serverName));
  failures.sort((a, b) => a.serverName.localeCompare(b.serverName));

  return { entries, failures };
}
