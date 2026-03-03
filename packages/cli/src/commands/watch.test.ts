import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { createWatchCommand } from "./watch.js";

function createProgram(): Command {
  const program = new Command();
  program
    .option("--format <format>", "Output format")
    .option("--no-color", "Disable colored output")
    .option("-o, --output <path>", "Output file path")
    .option("--quiet", "Suppress non-essential output");
  program.addCommand(createWatchCommand());
  return program;
}

describe("watch command", () => {
  it("registers with expected options", () => {
    const program = createProgram();
    const watchCmd = program.commands.find((c) => c.name() === "watch");
    expect(watchCmd).toBeDefined();

    const optionNames = watchCmd?.options.map((o) => o.long) ?? [];
    expect(optionNames).toContain("--baseline");
    expect(optionNames).toContain("--watch-paths");
    expect(optionNames).toContain("--debounce");
    expect(optionNames).toContain("--severity");
    expect(optionNames).toContain("--fail-on");
    expect(optionNames).toContain("--webhook");
    expect(optionNames).toContain("--clear");
    // Transport options
    expect(optionNames).toContain("--command");
    expect(optionNames).toContain("--url");
    expect(optionNames).toContain("--sse");
    expect(optionNames).toContain("--header");
  });

  it("requires --baseline option", () => {
    const program = createProgram();
    const watchCmd = program.commands.find((c) => c.name() === "watch");
    const baselineOpt = watchCmd?.options.find((o) => o.long === "--baseline");
    expect(baselineOpt?.required).toBe(true);
  });

  it("defaults --debounce to 500", () => {
    const program = createProgram();
    const watchCmd = program.commands.find((c) => c.name() === "watch");
    const debounceOpt = watchCmd?.options.find((o) => o.long === "--debounce");
    expect(debounceOpt?.defaultValue).toBe("500");
  });

  it("defaults --severity to safe", () => {
    const program = createProgram();
    const watchCmd = program.commands.find((c) => c.name() === "watch");
    const severityOpt = watchCmd?.options.find((o) => o.long === "--severity");
    expect(severityOpt?.defaultValue).toBe("safe");
  });

  it("defaults --fail-on to breaking", () => {
    const program = createProgram();
    const watchCmd = program.commands.find((c) => c.name() === "watch");
    const failOnOpt = watchCmd?.options.find((o) => o.long === "--fail-on");
    expect(failOnOpt?.defaultValue).toBe("breaking");
  });

  it("defaults --watch-paths to current directory", () => {
    const program = createProgram();
    const watchCmd = program.commands.find((c) => c.name() === "watch");
    const watchPathsOpt = watchCmd?.options.find((o) => o.long === "--watch-paths");
    expect(watchPathsOpt?.defaultValue).toEqual(["."]);
  });
});
