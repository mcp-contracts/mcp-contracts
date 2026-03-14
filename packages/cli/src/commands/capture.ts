import type { MCPContractSnapshot, SnapshotCapture, SnapshotServer } from "@mcp-contracts/core";
import { createSnapshot } from "@mcp-contracts/core";
import type { ResolvedTransport } from "./mcp-client.js";
import { captureServerData, connectToServer } from "./mcp-client.js";

/** Result of capturing a snapshot from a live server. */
export interface CaptureResult {
  snapshot: MCPContractSnapshot;
  serverName: string;
  serverVersion: string;
}

/** Options for the captureSnapshot helper. */
export interface CaptureOptions {
  transport: ResolvedTransport;
  quiet?: boolean;
}

/**
 * Connects to an MCP server, captures all data, and returns a snapshot.
 *
 * Encapsulates the full connect → capture → close lifecycle so that
 * commands do not need to duplicate this boilerplate.
 *
 * @param options - Transport config and quiet flag.
 * @returns The snapshot plus server name and version.
 */
export async function captureSnapshot(options: CaptureOptions): Promise<CaptureResult> {
  const { transport: config, quiet } = options;

  if (!quiet) {
    process.stderr.write("Connecting to MCP server...\n");
  }

  const { client, transport, protocolVersion } = await connectToServer(config);

  const serverVersion = client.getServerVersion();
  const serverCapabilities = client.getServerCapabilities() ?? {};

  const name = serverVersion?.name ?? "unknown";
  const version = serverVersion?.version ?? "unknown";

  if (!quiet && serverVersion) {
    process.stderr.write(`Connected to ${name} v${version}\n`);
  }

  const data = await captureServerData(client);
  await transport.close();

  const server: SnapshotServer = {
    name,
    version,
    protocolVersion,
    capabilities: serverCapabilities as Record<string, unknown>,
  };

  const source =
    config.transport === "stdio" ? [config.command, ...(config.args ?? [])].join(" ") : config.url;

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

  return { snapshot, serverName: name, serverVersion: version };
}
