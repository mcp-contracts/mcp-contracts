/**
 * mcpdiff CLI entry point.
 *
 * This is a thin wrapper around @mcp-contracts/core.
 * All business logic lives in core; this file handles I/O, argument parsing,
 * and output formatting.
 */

import { Command } from "commander";

const program = new Command();

program
  .name("mcpdiff")
  .description("Capture, diff, and inspect MCP server tool schemas")
  .version("0.1.0");

// --- snapshot command ---
// TODO: implement in ./commands/snapshot.ts
// program.addCommand(snapshotCommand);

// --- diff command ---
// TODO: implement in ./commands/diff.ts
// program.addCommand(diffCommand);

// --- inspect command ---
// TODO: implement in ./commands/inspect.ts
// program.addCommand(inspectCommand);

program.parse();
