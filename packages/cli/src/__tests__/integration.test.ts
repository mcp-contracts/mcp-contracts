import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const CLI_PATH = resolve(import.meta.dirname, "../../dist/index.js");
const FIXTURES_DIR = resolve(import.meta.dirname, "../../../core/src/__fixtures__");
const V1 = resolve(FIXTURES_DIR, "server-v1.mcpc.json");
const V2_SAFE = resolve(FIXTURES_DIR, "server-v2-safe.mcpc.json");
const V2_BREAKING = resolve(FIXTURES_DIR, "server-v2-breaking.mcpc.json");
const V2_WARNING = resolve(FIXTURES_DIR, "server-v2-warning.mcpc.json");

/**
 * Runs the CLI with the given arguments.
 *
 * @param args - CLI arguments to pass.
 * @returns stdout, stderr, and exitCode.
 */
async function runCli(
  ...args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync("node", [CLI_PATH, ...args]);
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout: string; stderr: string; code: number };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", exitCode: e.code };
  }
}

describe("integration: CLI", () => {
  describe("--help", () => {
    it("exits 0 and shows usage info", async () => {
      const { stdout, exitCode } = await runCli("--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("mcpdiff");
      expect(stdout).toContain("snapshot");
      expect(stdout).toContain("diff");
      expect(stdout).toContain("inspect");
      expect(stdout).toContain("baseline");
      expect(stdout).toContain("ci");
    });
  });

  describe("--version", () => {
    it("exits 0 and prints version", async () => {
      const { stdout, exitCode } = await runCli("--version");
      expect(exitCode).toBe(0);
      expect(stdout.trim()).toBe("0.2.0");
    });
  });

  describe("inspect", () => {
    it("shows summary as JSON", async () => {
      const { stdout, exitCode } = await runCli("inspect", V1, "--format", "json");
      expect(exitCode).toBe(0);
      const data = JSON.parse(stdout);
      expect(data.server).toBe("contacts-server");
      expect(data.tools).toBe(3);
      expect(data.resources).toBe(1);
      expect(data.prompts).toBe(1);
    });

    it("lists tools as JSON with --tools", async () => {
      const { stdout, exitCode } = await runCli("inspect", V1, "--tools", "--format", "json");
      expect(exitCode).toBe(0);
      const data = JSON.parse(stdout);
      expect(data).toHaveLength(3);
      expect(data.map((t: { name: string }) => t.name).sort()).toEqual([
        "create_contact",
        "delete_contact",
        "search_contacts",
      ]);
    });

    it("shows schema for a specific tool with --schema", async () => {
      const { stdout, exitCode } = await runCli(
        "inspect",
        V1,
        "--schema",
        "create_contact",
        "--format",
        "json",
      );
      expect(exitCode).toBe(0);
      const schema = JSON.parse(stdout);
      expect(schema.type).toBe("object");
      expect(schema.properties).toHaveProperty("name");
      expect(schema.properties).toHaveProperty("email");
      expect(schema.required).toContain("name");
    });

    it("exits 2 on nonexistent file", async () => {
      const { stderr, exitCode } = await runCli("inspect", "/nonexistent/file.mcpc.json");
      expect(exitCode).toBe(2);
      expect(stderr).toContain("Error");
    });
  });

  describe("diff", () => {
    it("exits 0 with safe changes only", async () => {
      const { stdout, exitCode } = await runCli("diff", V1, V2_SAFE, "--format", "json");
      expect(exitCode).toBe(0);
      const report = JSON.parse(stdout);
      expect(report.summary.safe).toBeGreaterThan(0);
      expect(report.summary.breaking).toBe(0);
    });

    it("exits 1 with breaking changes", async () => {
      const { stdout, exitCode } = await runCli("diff", V1, V2_BREAKING, "--format", "json");
      expect(exitCode).toBe(1);
      const report = JSON.parse(stdout);
      expect(report.summary.breaking).toBeGreaterThan(0);
    });

    it("exits 0 with warning changes (default --fail-on breaking)", async () => {
      const { stdout, exitCode } = await runCli("diff", V1, V2_WARNING, "--format", "json");
      expect(exitCode).toBe(0);
      const report = JSON.parse(stdout);
      expect(report.summary.warning).toBeGreaterThan(0);
    });

    it("exits 1 with --fail-on warning when warnings present", async () => {
      const { exitCode } = await runCli(
        "diff",
        V1,
        V2_WARNING,
        "--fail-on",
        "warning",
        "--format",
        "json",
      );
      expect(exitCode).toBe(1);
    });

    it("exits 0 when no changes (same file)", async () => {
      const { stdout, exitCode } = await runCli("diff", V1, V1, "--format", "json");
      expect(exitCode).toBe(0);
      const report = JSON.parse(stdout);
      expect(report.changes).toHaveLength(0);
      expect(report.summary.safe).toBe(0);
      expect(report.summary.warning).toBe(0);
      expect(report.summary.breaking).toBe(0);
    });

    it("exits 2 on nonexistent file", async () => {
      const { stderr, exitCode } = await runCli("diff", "/nonexistent/file.mcpc.json", V1);
      expect(exitCode).toBe(2);
      expect(stderr).toContain("Error");
    });
  });

  describe("baseline", () => {
    it("mcpdiff baseline --help shows update/verify subcommands", async () => {
      const { stdout, exitCode } = await runCli("baseline", "--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("update");
      expect(stdout).toContain("verify");
    });

    it("mcpdiff baseline update --help shows transport options", async () => {
      const { stdout, exitCode } = await runCli("baseline", "update", "--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("--command");
      expect(stdout).toContain("--url");
      expect(stdout).toContain("--config");
    });

    it("mcpdiff baseline verify --help shows transport and baseline options", async () => {
      const { stdout, exitCode } = await runCli("baseline", "verify", "--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("--command");
      expect(stdout).toContain("--url");
      expect(stdout).toContain("--baseline");
    });
  });

  describe("ci", () => {
    it("mcpdiff ci --help shows baseline, transport, and fail-on options", async () => {
      const { stdout, exitCode } = await runCli("ci", "--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("--baseline");
      expect(stdout).toContain("--command");
      expect(stdout).toContain("--url");
      expect(stdout).toContain("--fail-on");
      expect(stdout).toContain("--severity");
    });
  });
});
