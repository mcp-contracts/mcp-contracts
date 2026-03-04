/**
 * mcpdiff CLI entry point.
 *
 * This is a thin wrapper around @mcp-contracts/core.
 * All business logic lives in core; this file handles I/O, argument parsing,
 * and output formatting.
 */

import { Command } from "commander";
import { createBaselineCommand } from "./commands/baseline.js";
import { createCiCommand } from "./commands/ci.js";
import { createDiffCommand } from "./commands/diff.js";
import { createInspectCommand } from "./commands/inspect.js";
import { createSnapshotCommand } from "./commands/snapshot.js";
import { createWatchCommand } from "./commands/watch.js";

const program = new Command();

program
  .name("mcpdiff")
  .description("Capture, diff, and inspect MCP server tool schemas")
  .version("0.3.0")
  .option("--format <format>", "Output format: terminal | json | markdown")
  .option("--no-color", "Disable colored output")
  .option("-o, --output <path>", "Output file path")
  .option("--quiet", "Suppress non-essential output")
  .option("--verbose", "Show detailed information");

program.addCommand(createBaselineCommand());
program.addCommand(createCiCommand());
program.addCommand(createDiffCommand());
program.addCommand(createInspectCommand());
program.addCommand(createSnapshotCommand());
program.addCommand(createWatchCommand());

program.parse();
