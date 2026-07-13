import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import type { MCPContractSnapshot, ProjectConfig, ProjectServer } from "@mcp-contracts/core";
import { PROJECT_CONFIG_FILENAME, parseProjectConfig } from "@mcp-contracts/core";
import { Command } from "commander";
import { listConfigServers } from "../mcp-config.js";
import { DEFAULT_BASELINE_PATH, resolveProjectTransport } from "../project-config.js";
import type { TransportOptions } from "../transport.js";
import {
  addTransportOptions,
  extractTransportOptions,
  hasTransportFlags,
  parseHeaders,
} from "../transport.js";
import { getRootOpts, handleErrors, parseEnvPairs } from "../utils.js";
import { captureSnapshot } from "./capture.js";

/** CI workflow snippet printed as part of the next steps. */
const CI_SNIPPET = `# .github/workflows/mcp-contract.yml
name: MCP Contract Check
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g @mcp-contracts/cli
      - run: mcpdiff check
`;

/**
 * Builds the config file's server block from explicit transport flags.
 *
 * @param flags - The extracted transport options.
 * @returns The server block to write into mcpcontracts.json.
 */
export function buildServerFromFlags(flags: TransportOptions): ProjectServer {
  const transports = [flags.command, flags.url, flags.config].filter((v) => v !== undefined);
  if (transports.length === 0) {
    throw new Error("Specify one of: --command, --url, or --config");
  }
  if (transports.length > 1) {
    throw new Error("Specify only one of: --command, --url, or --config");
  }

  if (flags.config !== undefined) {
    return {
      config: flags.config,
      ...(flags.server !== undefined && { name: flags.server }),
    };
  }
  if (flags.url !== undefined) {
    return {
      url: flags.url,
      ...(flags.sse === true && { sse: true }),
      ...(flags.header !== undefined && { headers: parseHeaders(flags.header) }),
    };
  }
  return {
    command: flags.command as string,
    ...(flags.args !== undefined && { args: flags.args }),
    ...(flags.env !== undefined && { env: parseEnvPairs(flags.env) }),
  };
}

/**
 * Interactively asks for the server, offering mcp.json entries when present.
 *
 * @param cwd - The directory being initialized.
 * @returns The server block to write into mcpcontracts.json.
 */
async function promptForServer(cwd: string): Promise<ProjectServer> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const mcpJsonPath = ["mcp.json", ".mcp.json"].map((f) => join(cwd, f)).find(existsSync);
    if (mcpJsonPath) {
      const fileName = basename(mcpJsonPath);
      const servers = listConfigServers(mcpJsonPath);
      process.stderr.write(`Found ${fileName} with ${servers.length} server(s):\n`);
      servers.forEach((s, i) => {
        process.stderr.write(`  ${i + 1}. ${s.name}\n`);
      });
      const answer = (
        await rl.question(`Use which server? [1-${servers.length}, or "m" to enter manually]: `)
      ).trim();
      if (answer.toLowerCase() !== "m") {
        const index = Number.parseInt(answer, 10);
        const chosen = servers[index - 1];
        if (!Number.isInteger(index) || !chosen) {
          throw new Error(`Invalid selection "${answer}"`);
        }
        return { config: `./${fileName}`, name: chosen.name };
      }
    }

    const input = (await rl.question('Server command (e.g. "node dist/index.js") or URL: ')).trim();
    if (!input) {
      throw new Error("No server specified");
    }
    if (/^https?:\/\//.test(input)) {
      return { url: input };
    }
    const [command, ...args] = input.split(/\s+/);
    return args.length > 0 ? { command: command as string, args } : { command: command as string };
  } finally {
    rl.close();
  }
}

/**
 * Prints the post-init summary and next steps, including the CI snippet.
 *
 * @param snapshot - The captured baseline snapshot.
 */
function printNextSteps(snapshot: MCPContractSnapshot): void {
  const tools = Object.keys(snapshot.tools).length;
  const resources = Object.keys(snapshot.resources).length;
  const prompts = Object.keys(snapshot.prompts).length;
  const parts = [`${tools} tools`];
  if (resources > 0) parts.push(`${resources} resources`);
  if (prompts > 0) parts.push(`${prompts} prompts`);

  process.stderr.write(
    `✓ Wrote ${PROJECT_CONFIG_FILENAME}\n` +
      `✓ Wrote ${DEFAULT_BASELINE_PATH} (${parts.join(", ")})\n` +
      "\nNext steps:\n" +
      `  1. Commit ${PROJECT_CONFIG_FILENAME} and ${DEFAULT_BASELINE_PATH}\n` +
      "  2. Run `mcpdiff check` to verify the server against the baseline\n" +
      "  3. Add contract checking to CI:\n\n" +
      `${CI_SNIPPET}`,
  );
}

/**
 * Creates the `init` subcommand for the mcpdiff CLI.
 *
 * One-command onboarding: writes mcpcontracts.json with the chosen server,
 * captures the initial baseline, and prints next steps. Fully scriptable via
 * transport flags; prompts interactively on a TTY when no flags are given.
 *
 * @returns A Commander Command instance for the init subcommand.
 */
export function createInitCommand(): Command {
  const cmd = new Command("init").description(
    "Set up contract checking: write mcpcontracts.json and capture the baseline",
  );

  addTransportOptions(cmd);

  cmd.option("--force", "Overwrite an existing mcpcontracts.json").action(
    handleErrors(async (options: Record<string, unknown>) => {
      const rootOpts = getRootOpts(cmd);
      const quiet = rootOpts["quiet"] === true;
      const cwd = process.cwd();
      const configPath = join(cwd, PROJECT_CONFIG_FILENAME);

      if (existsSync(configPath) && options["force"] !== true) {
        throw new Error(
          `"${PROJECT_CONFIG_FILENAME}" already exists in this directory (use --force to overwrite)`,
        );
      }

      const flags = extractTransportOptions(options);
      let server: ProjectServer;
      if (hasTransportFlags(flags)) {
        server = buildServerFromFlags(flags);
      } else if (process.stdin.isTTY === true) {
        server = await promptForServer(cwd);
      } else {
        throw new Error(
          "No server specified. Pass --command, --url, or --config (interactive prompts require a TTY)",
        );
      }

      const config: ProjectConfig = parseProjectConfig({
        server,
        baseline: DEFAULT_BASELINE_PATH,
        failOn: "breaking",
      });

      // Capture first: nothing is written if the server is unreachable.
      const transport = resolveProjectTransport({ path: configPath, dir: cwd, config });
      const { snapshot } = await captureSnapshot({ transport, quiet });

      writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
      const baselinePath = join(cwd, DEFAULT_BASELINE_PATH);
      mkdirSync(dirname(baselinePath), { recursive: true });
      writeFileSync(baselinePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf-8");

      printNextSteps(snapshot);
    }),
  );

  return cmd;
}
