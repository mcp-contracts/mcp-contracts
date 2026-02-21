import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { createInspectCommand } from "./inspect.js";

const FIXTURES_DIR = resolve(import.meta.dirname, "../../../core/src/__fixtures__");
const V1_PATH = resolve(FIXTURES_DIR, "server-v1.mcpc.json");

function createProgram(): Command {
  const program = new Command();
  program
    .option("--format <format>", "Output format")
    .option("--no-color", "Disable colored output")
    .option("-o, --output <path>", "Output file");
  program.addCommand(createInspectCommand());
  return program;
}

describe("inspect command", () => {
  let stdoutData: string;
  let stderrData: string;
  let exitCode: number | undefined;

  beforeEach(() => {
    stdoutData = "";
    stderrData = "";
    exitCode = undefined;
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutData += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrData += String(chunk);
      return true;
    });
    vi.spyOn(process, "exit").mockImplementation((code) => {
      exitCode = code as number;
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows summary with server name and counts (json)", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "mcpdiff", "inspect", V1_PATH, "--format", "json"]);
    const output = JSON.parse(stdoutData);
    expect(output.server).toBe("contacts-server");
    expect(output.version).toBe("1.0.0");
    expect(output.tools).toBe(3);
    expect(output.resources).toBe(1);
    expect(output.prompts).toBe(1);
  });

  it("shows summary in terminal format", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "mcpdiff", "inspect", V1_PATH, "--format", "terminal"]);
    expect(stdoutData).toContain("contacts-server");
    expect(stdoutData).toContain("1.0.0");
  });

  it("shows summary in markdown format", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "mcpdiff", "inspect", V1_PATH, "--format", "markdown"]);
    expect(stdoutData).toContain("| Server | contacts-server |");
    expect(stdoutData).toContain("| Tools | 3 |");
  });

  it("lists tools with --tools flag (json)", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "mcpdiff", "inspect", V1_PATH, "--tools", "--format", "json"]);
    const output = JSON.parse(stdoutData);
    expect(output).toHaveLength(3);
    const names = output.map((t: { name: string }) => t.name);
    expect(names).toContain("create_contact");
    expect(names).toContain("search_contacts");
    expect(names).toContain("delete_contact");
  });

  it("lists tools with --tools flag (terminal)", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "mcpdiff", "inspect", V1_PATH, "--tools", "--format", "terminal"]);
    expect(stdoutData).toContain("create_contact");
    expect(stdoutData).toContain("search_contacts");
    expect(stdoutData).toContain("delete_contact");
  });

  it("lists resources with --resources flag (json)", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "mcpdiff", "inspect", V1_PATH, "--resources", "--format", "json"]);
    const output = JSON.parse(stdoutData);
    expect(output).toHaveLength(1);
    expect(output[0].uri).toBe("contacts://list");
    expect(output[0].mimeType).toBe("application/json");
  });

  it("lists prompts with --prompts flag (json)", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "mcpdiff", "inspect", V1_PATH, "--prompts", "--format", "json"]);
    const output = JSON.parse(stdoutData);
    expect(output).toHaveLength(1);
    expect(output[0].name).toBe("summarize_contact");
  });

  it("shows schema for a specific tool with --schema", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "mcpdiff", "inspect", V1_PATH, "--schema", "create_contact", "--format", "json"]);
    const schema = JSON.parse(stdoutData);
    expect(schema.type).toBe("object");
    expect(schema.properties.name).toBeDefined();
    expect(schema.properties.email).toBeDefined();
    expect(schema.required).toContain("name");
  });

  it("errors on nonexistent tool with --schema", async () => {
    const program = createProgram();
    try {
      await program.parseAsync(["node", "mcpdiff", "inspect", V1_PATH, "--schema", "nonexistent", "--format", "json"]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(2);
    expect(stderrData).toContain('Tool "nonexistent" not found');
  });

  it("errors on invalid file path", async () => {
    const program = createProgram();
    try {
      await program.parseAsync(["node", "mcpdiff", "inspect", "/nonexistent/path.json", "--format", "json"]);
    } catch {
      // expected process.exit
    }
    expect(exitCode).toBe(2);
    expect(stderrData).toContain("Failed to read snapshot file");
  });
});
