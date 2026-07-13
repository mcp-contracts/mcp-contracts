import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
  return runCliIn(process.cwd(), ...args);
}

/**
 * Runs the CLI with the given arguments from a specific working directory.
 *
 * Strips GITHUB_STEP_SUMMARY so `ci` runs don't write to a real step summary
 * when the test suite itself runs in GitHub Actions.
 *
 * @param cwd - Working directory for the CLI process.
 * @param args - CLI arguments to pass.
 * @returns stdout, stderr, and exitCode.
 */
async function runCliIn(
  cwd: string,
  ...args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const env = { ...process.env };
  delete env["GITHUB_STEP_SUMMARY"];
  try {
    const { stdout, stderr } = await execFileAsync("node", [CLI_PATH, ...args], { cwd, env });
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
      expect(stdout).toContain("mcpdiff");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("check");
      expect(stdout).toContain("update");
      expect(stdout).toContain("snapshot");
      expect(stdout).toContain("diff");
      expect(stdout).toContain("inspect");
    });

    it("hides deprecated commands from usage info", async () => {
      const { stdout } = await runCli("--help");
      expect(stdout).not.toMatch(/^ {2}ci\b/m);
      expect(stdout).not.toMatch(/^ {2}watch\b/m);
      expect(stdout).not.toMatch(/^ {2}baseline\b/m);
      expect(stdout).not.toMatch(/^ {2}verify-hash\b/m);
    });
  });

  describe("--version", () => {
    it("exits 0 and prints version", async () => {
      const { stdout, exitCode } = await runCli("--version");
      expect(exitCode).toBe(0);
      expect(stdout.trim()).toBe("0.6.0");
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

    it("diff --help shows --live and --webhook options", async () => {
      const { stdout, exitCode } = await runCli("diff", "--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("--live");
      expect(stdout).toContain("--webhook");
      expect(stdout).toContain("--sse");
      expect(stdout).toContain("--header");
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
      expect(stdout).toContain("--sse");
      expect(stdout).toContain("--header");
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
    it("mcpdiff ci --help shows baseline, transport, fail-on, and webhook options", async () => {
      const { stdout, exitCode } = await runCli("ci", "--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("--baseline");
      expect(stdout).toContain("--command");
      expect(stdout).toContain("--url");
      expect(stdout).toContain("--fail-on");
      expect(stdout).toContain("--severity");
      expect(stdout).toContain("--webhook");
    });
  });

  describe("snapshot", () => {
    it("mcpdiff snapshot --help shows --sse and --header options", async () => {
      const { stdout, exitCode } = await runCli("snapshot", "--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("--sse");
      expect(stdout).toContain("--header");
    });
  });

  describe("watch", () => {
    it("mcpdiff watch --help shows all watch options", async () => {
      const { stdout, exitCode } = await runCli("watch", "--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("--baseline");
      expect(stdout).toContain("--watch-paths");
      expect(stdout).toContain("--debounce");
      expect(stdout).toContain("--severity");
      expect(stdout).toContain("--fail-on");
      expect(stdout).toContain("--webhook");
      expect(stdout).toContain("--clear");
      expect(stdout).toContain("--command");
      expect(stdout).toContain("--url");
      expect(stdout).toContain("--sse");
      expect(stdout).toContain("--header");
    });
  });
});

describe("integration: project config (mcpcontracts.json)", () => {
  const FIXTURE_SERVER = resolve(import.meta.dirname, "fixtures/fixture-server.mjs");
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), "mcpc-integration-"));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  function writeProjectConfig(config: unknown): void {
    writeFileSync(join(projectDir, "mcpcontracts.json"), JSON.stringify(config, null, 2), "utf-8");
  }

  it("root --help shows the --project option", async () => {
    const { stdout, exitCode } = await runCli("--help");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--project");
  });

  it("runs baseline update, verify, and ci with zero flags", async () => {
    writeProjectConfig({
      server: { command: "node", args: [FIXTURE_SERVER] },
      baseline: "contracts/baseline.mcpc.json",
    });

    const update = await runCliIn(projectDir, "baseline", "update");
    expect(update.exitCode).toBe(0);
    expect(existsSync(join(projectDir, "contracts", "baseline.mcpc.json"))).toBe(true);

    const verify = await runCliIn(projectDir, "baseline", "verify");
    expect(verify.exitCode).toBe(0);
    expect(verify.stderr).toContain("Baseline verified");

    const ci = await runCliIn(projectDir, "ci", "--format", "json");
    expect(ci.exitCode).toBe(0);
    const report = JSON.parse(ci.stdout);
    expect(report.summary).toMatchObject({ breaking: 0, warning: 0, safe: 0 });
  });

  it("discovers the config from a subdirectory", async () => {
    writeProjectConfig({
      server: { command: "node", args: [FIXTURE_SERVER] },
      baseline: "contracts/baseline.mcpc.json",
    });
    const sub = join(projectDir, "src", "nested");
    mkdirSync(sub, { recursive: true });

    const update = await runCliIn(sub, "baseline", "update");
    expect(update.exitCode).toBe(0);
    expect(existsSync(join(projectDir, "contracts", "baseline.mcpc.json"))).toBe(true);

    const verify = await runCliIn(sub, "baseline", "verify");
    expect(verify.exitCode).toBe(0);
  });

  it("spawns relative stdio commands from the config directory", async () => {
    // A launcher that only resolves if the server spawns with the config
    // file's directory as its cwd, not the invoking subdirectory.
    const launcher = join(projectDir, "srv.mjs");
    writeFileSync(
      launcher,
      `await import(${JSON.stringify(`file://${FIXTURE_SERVER}`)});\n`,
      "utf-8",
    );
    writeProjectConfig({
      server: { command: "node", args: ["srv.mjs"] },
      baseline: "contracts/baseline.mcpc.json",
    });
    const sub = join(projectDir, "deeply", "nested");
    mkdirSync(sub, { recursive: true });

    const update = await runCliIn(sub, "baseline", "update");
    expect(update.exitCode).toBe(0);

    const verify = await runCliIn(sub, "baseline", "verify");
    expect(verify.exitCode).toBe(0);
    expect(verify.stderr).toContain("Baseline verified");
  });

  it("uses --project to load a config outside the cwd", async () => {
    writeProjectConfig({
      server: { command: "node", args: [FIXTURE_SERVER] },
      baseline: "contracts/baseline.mcpc.json",
    });
    await runCliIn(projectDir, "baseline", "update");

    const elsewhere = mkdtempSync(join(tmpdir(), "mcpc-elsewhere-"));
    try {
      const verify = await runCliIn(
        elsewhere,
        "baseline",
        "verify",
        "--project",
        join(projectDir, "mcpcontracts.json"),
      );
      expect(verify.exitCode).toBe(0);
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it("lets explicit flags override the config baseline", async () => {
    writeProjectConfig({
      server: { command: "node", args: [FIXTURE_SERVER] },
      baseline: "contracts/baseline.mcpc.json",
    });
    await runCliIn(projectDir, "baseline", "update");

    const { stderr, exitCode } = await runCliIn(
      projectDir,
      "baseline",
      "verify",
      "--baseline",
      "missing.mcpc.json",
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("missing.mcpc.json");
  });

  it("exits 2 on an invalid config, naming the file and key", async () => {
    writeProjectConfig({ failon: "breaking" });
    const { stderr, exitCode } = await runCliIn(projectDir, "snapshot");
    expect(exitCode).toBe(2);
    expect(stderr).toContain("failon");
    expect(stderr).toContain("mcpcontracts.json");
  });

  it("exits 2 on an invalid config even when flags specify the transport", async () => {
    writeProjectConfig({ server: {} });
    const { stderr, exitCode } = await runCliIn(
      projectDir,
      "snapshot",
      "--command",
      "node",
      "--args",
      FIXTURE_SERVER,
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("mcpcontracts.json");
  });

  it("ci without a baseline anywhere explains both options", async () => {
    writeProjectConfig({ server: { command: "node", args: [FIXTURE_SERVER] } });
    const { stderr, exitCode } = await runCliIn(projectDir, "ci");
    expect(exitCode).toBe(2);
    expect(stderr).toContain("--baseline");
    expect(stderr).toContain("mcpcontracts.json");
  });
});

describe("integration: check and update", () => {
  const FIXTURE_SERVER = resolve(import.meta.dirname, "fixtures/fixture-server.mjs");
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), "mcpc-check-update-"));
    writeFileSync(
      join(projectDir, "mcpcontracts.json"),
      JSON.stringify(
        {
          server: { command: "node", args: [FIXTURE_SERVER] },
          baseline: "contracts/baseline.mcpc.json",
        },
        null,
        2,
      ),
      "utf-8",
    );
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("update then check succeed with zero flags", async () => {
    const update = await runCliIn(projectDir, "update");
    expect(update.exitCode).toBe(0);
    expect(update.stderr).toContain("Baseline written to");
    expect(existsSync(join(projectDir, "contracts", "baseline.mcpc.json"))).toBe(true);

    const check = await runCliIn(projectDir, "check", "--format", "json");
    expect(check.exitCode).toBe(0);
    expect(check.stderr).toContain("Contract unchanged");
    const report = JSON.parse(check.stdout);
    expect(report.changes).toHaveLength(0);
  });

  it("check exits 2 when the baseline file is missing", async () => {
    const { stderr, exitCode } = await runCliIn(projectDir, "check");
    expect(exitCode).toBe(2);
    expect(stderr).toContain("baseline.mcpc.json");
  });

  it("check --help shows the full consolidated flag surface", async () => {
    const { stdout, exitCode } = await runCli("check", "--help");
    expect(exitCode).toBe(0);
    for (const flag of [
      "--baseline",
      "--fail-on",
      "--severity",
      "--webhook",
      "--verify-signature",
      "--signature-key",
      "--watch",
      "--watch-paths",
      "--debounce",
      "--clear",
      "--command",
      "--url",
    ]) {
      expect(stdout).toContain(flag);
    }
  });

  it("deprecated spellings still work and print a notice", async () => {
    await runCliIn(projectDir, "update");

    const baselineVerify = await runCliIn(projectDir, "baseline", "verify");
    expect(baselineVerify.exitCode).toBe(0);
    expect(baselineVerify.stderr).toContain("deprecated");
    expect(baselineVerify.stderr).toContain("mcpdiff check");

    const baselineUpdate = await runCliIn(projectDir, "baseline", "update");
    expect(baselineUpdate.exitCode).toBe(0);
    expect(baselineUpdate.stderr).toContain("mcpdiff update");

    const ci = await runCliIn(projectDir, "ci", "--format", "json");
    expect(ci.exitCode).toBe(0);
    expect(ci.stderr).toContain("mcpdiff check");

    const diffLive = await runCliIn(projectDir, "diff", "--live", "--format", "json");
    expect(diffLive.exitCode).toBe(0);
    expect(diffLive.stderr).toContain("mcpdiff check");
  });
});

describe("integration: verify", () => {
  const FIXTURE_SERVER = resolve(import.meta.dirname, "fixtures/fixture-server.mjs");
  let workDir: string;
  let snapshotPath: string;

  beforeEach(async () => {
    workDir = mkdtempSync(join(tmpdir(), "mcpc-verify-"));
    snapshotPath = join(workDir, "snapshot.mcpc.json");
    const { exitCode } = await runCliIn(
      workDir,
      "snapshot",
      "--command",
      "node",
      "--args",
      FIXTURE_SERVER,
      "-o",
      snapshotPath,
    );
    expect(exitCode).toBe(0);
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it("checks only the content hash without --key and says so", async () => {
    const json = await runCli("verify", snapshotPath, "--format", "json");
    expect(json.exitCode).toBe(0);
    const result = JSON.parse(json.stdout);
    expect(result.valid).toBe(true);
    expect(result.checks).toEqual(["hash"]);

    const terminal = await runCli("verify", snapshotPath, "--format", "terminal");
    expect(terminal.exitCode).toBe(0);
    expect(terminal.stdout).toContain("Content hash verified");
    expect(terminal.stderr).toContain("only the content hash was checked");
  });

  it("verify-hash still works as a deprecated alias", async () => {
    const { stdout, stderr, exitCode } = await runCli(
      "verify-hash",
      snapshotPath,
      "--format",
      "json",
    );
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout).valid).toBe(true);
    expect(stderr).toContain("deprecated");
    expect(stderr).toContain("mcpdiff verify");
  });
});
