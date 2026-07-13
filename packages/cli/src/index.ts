/**
 * mcpdiff CLI entry point.
 *
 * This is a thin wrapper around @mcp-contracts/core.
 * All business logic lives in core; this file handles I/O, argument parsing,
 * and output formatting.
 */

import { Command } from "commander";
import { createBaselineCommand } from "./commands/baseline.js";
import { createCheckCommand } from "./commands/check.js";
import { createCheckConflictsCommand } from "./commands/check-conflicts.js";
import { createCiCommand } from "./commands/ci.js";
import { createDiffCommand } from "./commands/diff.js";
import { createGraphCommand } from "./commands/graph.js";
import { createInspectCommand } from "./commands/inspect.js";
import { createSignCommand } from "./commands/sign.js";
import { createSnapshotCommand } from "./commands/snapshot.js";
import { createUpdateCommand } from "./commands/update.js";
import { createVerifyCommand } from "./commands/verify.js";
import { createVerifyHashCommand } from "./commands/verify-hash.js";
import { createWatchCommand } from "./commands/watch.js";

const program = new Command();

program
  .name("mcpdiff")
  .description("Capture, diff, and inspect MCP server tool schemas")
  .version("0.6.0")
  .option("--format <format>", "Output format: terminal | json | markdown")
  .option("--no-color", "Disable colored output")
  .option("-o, --output <path>", "Output file path")
  .option("--quiet", "Suppress non-essential output")
  .option("--verbose", "Show detailed information")
  .option(
    "--project <path>",
    "Path to mcpcontracts.json (default: discovered by walking up from the CWD)",
  );

program.addCommand(createCheckCommand());
program.addCommand(createUpdateCommand());
program.addCommand(createBaselineCommand(), { hidden: true });
program.addCommand(createCheckConflictsCommand());
program.addCommand(createCiCommand(), { hidden: true });
program.addCommand(createDiffCommand());
program.addCommand(createGraphCommand());
program.addCommand(createInspectCommand());
program.addCommand(createSignCommand());
program.addCommand(createSnapshotCommand());
program.addCommand(createVerifyCommand());
program.addCommand(createVerifyHashCommand(), { hidden: true });
program.addCommand(createWatchCommand(), { hidden: true });

program.parse();
