import type { TestReport, TestRunOptions, TestServerConfig } from "@mcp-contracts/test";
import {
  formatTestJson,
  formatTestMarkdown,
  formatTestTerminal,
  runContractTests,
} from "@mcp-contracts/test";
import { Command } from "commander";
import {
  DEFAULT_BASELINE_PATH,
  loadProjectConfig,
  resolveBaselinePath,
  resolveTransportOrProject,
} from "../project-config.js";
import { addTransportOptions } from "../transport.js";
import {
  CliExitError,
  getRootOpts,
  handleErrors,
  type OutputFormat,
  readSnapshotFile,
  resolveFormat,
  writeOutput,
} from "../utils.js";
import type { ResolvedTransport } from "./mcp-client.js";

/**
 * Maps a resolved transport to the test runner's server config.
 *
 * @param transport - The resolved transport from flags or project config.
 * @returns The equivalent TestServerConfig.
 */
function toTestServerConfig(transport: ResolvedTransport): TestServerConfig {
  return {
    transport: transport.transport,
    command: transport.command,
    args: transport.args,
    env: transport.env,
    url: transport.url,
    headers: transport.headers,
    timeoutMs: 30_000,
  };
}

/**
 * Formats a test report in the requested output format.
 *
 * @param report - The test report to format.
 * @param format - The output format.
 * @returns The formatted report string.
 */
function formatTestReport(report: TestReport, format: OutputFormat): string {
  if (format === "json") {
    return formatTestJson(report);
  }
  if (format === "markdown") {
    return formatTestMarkdown(report);
  }
  return formatTestTerminal(report);
}

/**
 * Creates the `test` subcommand for the mcpdiff CLI.
 *
 * Runs the contract test suite (schema conformance + boundary inputs) from
 * @mcp-contracts/test against a live server. With an mcpcontracts.json
 * present, `mcpdiff test` with no arguments tests the configured baseline
 * against the configured server.
 *
 * @returns A Commander Command instance for the test subcommand.
 */
export function createTestCommand(): Command {
  const cmd = new Command("test")
    .description("Run contract conformance and boundary tests against a live server")
    .argument("[contract]", `Path to the contract file (default: "${DEFAULT_BASELINE_PATH}")`);

  addTransportOptions(cmd);

  cmd
    .option("--no-conformance", "Skip schema conformance tests")
    .option("--no-boundary", "Skip boundary input tests")
    .option("--allow-extra-tools", "Allow tools not in the contract")
    .option("--ignore-descriptions", "Ignore description differences")
    .option("--skip-tools <names...>", "Skip specific tools")
    .option("--timeout <ms>", "Global timeout in ms", "120000")
    .action(
      handleErrors(async (contractArg: string | undefined, options: Record<string, unknown>) => {
        const rootOpts = getRootOpts(cmd);
        const project = loadProjectConfig(rootOpts["project"] as string | undefined);

        const contractPath =
          contractArg ?? resolveBaselinePath(undefined, project) ?? DEFAULT_BASELINE_PATH;
        const contract = readSnapshotFile(contractPath);

        const transport = resolveTransportOrProject(options, project);
        const skipTools = options["skipTools"] as string[] | undefined;

        const runOptions: TestRunOptions = {
          contract,
          contractPath,
          server: toTestServerConfig(transport),
          conformance:
            options["conformance"] === false
              ? false
              : {
                  allowExtraTools: options["allowExtraTools"] === true,
                  ignoreDescriptions: options["ignoreDescriptions"] === true,
                  skipTools,
                },
          boundary: options["boundary"] === false ? false : { skipTools },
          timeoutMs: Number(options["timeout"]),
        };

        const report = await runContractTests(runOptions);

        const format = resolveFormat(rootOpts["format"] as string | undefined);
        const output = formatTestReport(report, format);
        writeOutput(`${output}\n`, rootOpts["output"] as string | undefined);

        // Exit codes: 0 = all pass, 1 = failures, 2 = tool error
        if (report.summary.failed > 0 || report.summary.errors > 0) {
          throw new CliExitError(1);
        }
      }),
    );

  return cmd;
}
