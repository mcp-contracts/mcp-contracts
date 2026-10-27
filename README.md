<div align="center">

# mcp-contracts

### Contract safety for MCP servers

**Pin your tool schemas. Diff every change. Catch breaking changes and tool poisoning before your agents do.**

[![npm version](https://img.shields.io/npm/v/%40mcp-contracts%2Fcli?label=npm&color=cb3837)](https://www.npmjs.com/package/@mcp-contracts/cli)
[![CI](https://github.com/mcp-contracts/mcp-contracts/actions/workflows/ci.yml/badge.svg)](https://github.com/mcp-contracts/mcp-contracts/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![node >= 20](https://img.shields.io/badge/node-%3E%3D%2020-brightgreen)](https://nodejs.org)

[Quick Start](#quick-start) · [Commands](#commands) · [Project Config](#project-config-mcpcontractsjson) · [CI Integration](#ci-integration) · [Packages](#packages)

<br>

```
  mcpdiff diff — acme-server v1.0.0 → v1.1.0

  🔴 BREAKING  tool "create_contact" — required parameter "phone" added
  🟡 WARNING   tool "search_contacts" — description changed
  🟢 SAFE      tool "export_csv" — new tool added

  Summary: 1 breaking · 1 warning · 1 safe
```

</div>

MCP servers expose tools, resources and prompts to AI agents through JSON schemas, but nothing versions, diffs or validates those schemas. A new required parameter silently breaks every agent that calls the tool. A rewritten description, the primary vector for [tool poisoning](https://owasp.org/www-project-mcp-top-10/2025/MCP03-2025%E2%80%93Tool-Poisoning), goes unreviewed.

`mcpdiff` treats MCP tool schemas as contracts: capture a baseline once, then every change to the server's interface is diffed, classified and gated before it ships.

- **Semantic diff.** Every change is classified as breaking, warning or safe, with CI-friendly exit codes. A change the engine has no rule for is still reported, as a warning, never swallowed.
- **Description changes are never silent.** Descriptions are instructions to the model, so every change is a warning with a readable text diff ([OWASP MCP03](https://owasp.org/www-project-mcp-top-10/2025/MCP03-2025%E2%80%93Tool-Poisoning)).
- **Contract testing.** `mcpdiff test` verifies that a live server conforms to its contract, including boundary inputs.
- **Signed baselines.** Ed25519 or RSA detached signatures, enforceable in CI with `check --verify-signature`.
- **Multi-server aware.** Snapshot, diff and conflict-check whole mcp.json compositions, and render their dependency graph.
- **CI-native.** Detects GitHub Actions, GitLab CI and CircleCI, writes step summaries, and ships a [GitHub Action](https://github.com/mcp-contracts/github-action).

## Quick Start

```bash
# One-command setup: writes mcpcontracts.json and captures the baseline
npx @mcp-contracts/cli init --command node --args ./my-server/dist/index.js

# From then on, zero flags, locally and in CI
npx @mcp-contracts/cli check
```

`init` writes a [project config](#project-config-mcpcontractsjson) so every later invocation knows your server and baseline, captures `contracts/baseline.mcpc.json`, and prints the CI snippet to paste into your workflow.

Two snapshots can also be diffed by hand:

```bash
npx @mcp-contracts/cli snapshot --command "node ./my-server/dist/index.js" -o v1.mcpc.json
# ... make changes ...
npx @mcp-contracts/cli snapshot --command "node ./my-server/dist/index.js" -o v2.mcpc.json
npx @mcp-contracts/cli diff v1.mcpc.json v2.mcpc.json
```

## Commands

| Command | What it does |
|---------|--------------|
| `init` | Writes `mcpcontracts.json` and captures the initial baseline |
| `check` | Captures the live server, diffs it against the baseline and sets the exit code; `--watch` re-runs on file changes |
| `update` | Captures the live server and writes the baseline |
| `test` | Runs schema conformance and boundary input tests against a live server |
| `snapshot` | Captures an ad-hoc snapshot file |
| `diff` | Compares two snapshot files, or a whole mcp.json composition against a baseline directory |
| `inspect` | Summarizes a snapshot file |
| `sign`, `verify` | Signs a snapshot with a private key; verifies its content hash and signature |
| `check-conflicts` | Finds duplicate tool names across the servers of an mcp.json |
| `graph` | Renders the servers and tools of an mcp.json as a dependency graph |

Every command exits `0` when clean, `1` when findings reach the `--fail-on` threshold and `2` on error. Flags, transport options and output formats are documented in the [command reference](./packages/cli/README.md).

## Project Config (`mcpcontracts.json`)

Instead of repeating transport and baseline flags on every invocation, put them in an `mcpcontracts.json` at your project root. It is discovered by walking up from the current directory to the repository root (the first directory containing `.git`), or passed explicitly with the global `--project <path>` option.

> **Never commit literal secrets.** `env`, `headers` and `url` values may reference environment variables as `${NAME}`; they are expanded at run time and a missing variable is an error.

> **The config executes a command.** `server.command`, `args` and `env` are run by every command that captures a live server. Treat `mcpcontracts.json` like `package.json` scripts: only run `mcpdiff` in repositories you trust, and review changes to it in pull requests. See the [trust model](./SECURITY.md#trust-model).

```jsonc
{
  // How to reach your server, exactly one of the three transport shapes:
  "server": {
    "command": "node",
    "args": ["dist/index.js"],
    "env": { "API_KEY": "${CONTACTS_API_KEY}" }
    // or: "url": "http://localhost:3000/mcp", "sse": true, "headers": { "Authorization": "Bearer ${CONTACTS_TOKEN}" }
    // or: "config": "./mcp.json", "name": "my-server"
  },
  "baseline": "contracts/baseline.mcpc.json",
  "failOn": "breaking",
  "watch": { "paths": ["src"], "debounce": 500 }
}
```

The config is read by every command that connects to a live server (`check`, `update`, `test`, `snapshot`). Pure file commands (`diff a b`, `inspect`, `sign`, `verify`) ignore it.

- **Precedence:** explicit CLI flags, then the config file, then built-in defaults. Passing any transport flag (`--command`, `--url`, `--config`) ignores the config's `server` block entirely; the two sources are never partially merged.
- **Paths** (`baseline`, `watch.paths`, `server.config`) are resolved relative to the config file, so commands behave the same from any subdirectory. A path that resolves outside the project directory is warned about and will be rejected in a future release.
- **Validation** is strict: unknown keys are an error, and an invalid config exits with code `2` naming the file and the offending key.

## CI Integration

### GitHub Action

```yaml
# .github/workflows/mcp-contract.yml
name: MCP Contract Check
on: [pull_request]
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: mcp-contracts/github-action@v0.7.0
        with:
          baseline: contracts/baseline.mcpc.json
          command: node dist/index.js
          fail-on: breaking        # or "warning" / "safe"
          comment-on-pr: true
          github-token: ${{ secrets.GITHUB_TOKEN }}
          # Optional: verify the baseline signature before diffing
          verify-signature: true
          signature-key: ${{ secrets.MCP_PUBLIC_KEY }}
```

The action exposes `has-changes`, `has-breaking`, `summary` and `exit-code` as outputs. All inputs are listed in the [action's README](https://github.com/mcp-contracts/github-action#inputs).

### CLI in any CI system

```yaml
steps:
  - uses: actions/checkout@v4
  - run: npm install -g @mcp-contracts/cli@0.9.0   # pin to a release
  - run: mcpdiff check                              # reads the committed mcpcontracts.json

  # With signature verification. The public key comes from a secret, never
  # from the checkout: a pull request could otherwise replace key, baseline
  # and signature together.
  - run: mcpdiff check --verify-signature
    env:
      MCP_SIGNATURE_KEY: ${{ secrets.MCP_PUBLIC_KEY }}
```

`check` detects the CI environment and picks the output format (markdown for GitHub Actions, JSON otherwise). On GitHub Actions the report is also appended to the job's step summary; text that comes from the server is escaped before rendering, so a server cannot change how the report reads or hide findings.

Run contract checks on `pull_request`, never `pull_request_target`: the config executes a command, and on `pull_request` a fork's config runs with a read-only token and no secrets. The [security policy](./SECURITY.md) has the details.

## Packages

| Package | Description |
|---------|-------------|
| [`@mcp-contracts/cli`](./packages/cli) | The `mcpdiff` CLI and its command reference |
| [`@mcp-contracts/core`](./packages/core) | Snapshot types, diff engine, classification logic, formatters |
| [`@mcp-contracts/test`](./packages/test) | Contract testing library: conformance and boundary runner, vitest matchers |

The snapshot format and the classification rules are specified in [SPEC.md](./SPEC.md). Design decisions and the contribution workflow are in [CONTRIBUTING.md](./CONTRIBUTING.md).

---

*mcp-contracts is an open-source project (MIT license). It is community tooling for the MCP ecosystem, not affiliated with Anthropic or the MCP project. Contributions and feedback are welcome.*

## License

MIT
