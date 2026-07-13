# mcp-contracts

**Your MCP server updated. Did the tool schemas change? Did descriptions get rewritten with hidden instructions? You'd never know — until now.**

`mcpdiff` captures versioned snapshots of MCP server tool schemas and detects breaking changes, drift, and potential [tool poisoning](https://owasp.org/www-project-mcp-top-10/2025/MCP03-2025%E2%80%93Tool-Poisoning) vectors.

Pin your contracts. Diff your tools. Ship with confidence.

## The Problem

MCP servers expose tools, resources, and prompts to AI agents. These interfaces are defined by JSON schemas — but there's no mechanism to version, diff, or validate them. When a server updates:

- **Breaking changes go unnoticed.** A new required parameter silently breaks every agent using the tool.
- **Description changes are invisible.** Tool descriptions are the primary vector for [tool poisoning attacks](https://owasp.org/www-project-mcp-top-10/2025/MCP03-2025%E2%80%93Tool-Poisoning) — and nobody reviews them.
- **There's no contract to pin.** Agents trust whatever schema the server serves at runtime, with no way to detect drift.

`mcpdiff` solves this by treating MCP tool schemas as **contracts** — versionable, diffable, and auditable artifacts.

## Quick Start

```bash
# Capture a baseline snapshot of your MCP server
npx @mcp-contracts/cli baseline update --command "node ./my-server/dist/index.js"
# → writes contracts/baseline.mcpc.json

# Later, verify nothing has changed
npx @mcp-contracts/cli baseline verify --command "node ./my-server/dist/index.js"

# Or diff two snapshots manually
npx @mcp-contracts/cli snapshot --command "node ./my-server/dist/index.js" -o v1.mcpc.json
# ... make changes ...
npx @mcp-contracts/cli snapshot --command "node ./my-server/dist/index.js" -o v2.mcpc.json
npx @mcp-contracts/cli diff v1.mcpc.json v2.mcpc.json
```

Tired of repeating `--command`? Put it in a [project config](#project-config-mcpcontractsjson) once and run `mcpdiff baseline verify` with zero flags.

Output:
```
  mcp-contracts diff — acme-server v1.0.0 → v1.1.0

  🔴 BREAKING  tool "create_contact" — required parameter "phone" added
  🟡 WARNING   tool "search_contacts" — description changed
  🟢 SAFE      tool "export_csv" — new tool added

  Summary: 1 breaking · 1 warning · 1 safe
```

## Commands

### `mcpdiff snapshot`

Connects to an MCP server and captures its complete tool/resource/prompt interface as a `.mcpc.json` file.

```bash
# Via stdio transport
mcpdiff snapshot --command "node server.js" -o snapshot.mcpc.json

# Via HTTP transport
mcpdiff snapshot --url http://localhost:3000/mcp -o snapshot.mcpc.json

# From an mcp.json config file
mcpdiff snapshot --config ./mcp.json --server my-server -o snapshot.mcpc.json

# Snapshot every server in the config at once (one file per server)
mcpdiff snapshot --config ./mcp.json --all --out-dir contracts/
```

### `mcpdiff diff`

Compares two snapshots and classifies every change as breaking, warning, or safe.

```bash
mcpdiff diff before.mcpc.json after.mcpc.json

# Diff a baseline against a live server
mcpdiff diff baseline.mcpc.json --live --command "node server.js"

# Fail CI on warnings too (stricter)
mcpdiff diff before.mcpc.json after.mcpc.json --fail-on warning

# Output as JSON for programmatic use
mcpdiff diff before.mcpc.json after.mcpc.json --format json

# Send results to a webhook
mcpdiff diff before.mcpc.json after.mcpc.json --webhook https://example.com/hook

# Diff every server in an mcp.json config against its baseline in one report
mcpdiff diff --config ./mcp.json --baseline contracts/
```

**Exit codes:** `0` = no breaking changes, `1` = breaking changes detected, `2` = error.

### `mcpdiff check-conflicts`

Detects duplicate tool names across the servers of an mcp.json config. Duplicates with
identical schemas are reported as `exact`; same-named tools with different schemas are
`conflicting` — dangerous for agents that route tool calls by bare tool name.

```bash
mcpdiff check-conflicts --config ./mcp.json

# Only fail CI on schema conflicts, tolerate identical duplicates
mcpdiff check-conflicts --config ./mcp.json --fail-on conflicting
```

**Exit codes:** `0` = no collisions, `1` = collisions found, `2` = error.

### `mcpdiff graph`

Renders a dependency graph of all servers in an mcp.json config: every server with its
tools, plus overlap edges where two servers expose the same tool name.

```bash
mcpdiff graph --config ./mcp.json

# Mermaid or Graphviz output for docs
mcpdiff --format mermaid graph --config ./mcp.json
mcpdiff --format dot graph --config ./mcp.json
```

### `mcpdiff baseline`

Manage contract baselines — capture and verify snapshots against a committed baseline.

```bash
# Capture a baseline (default: contracts/baseline.mcpc.json)
mcpdiff baseline update --command "node server.js"

# Write to a custom path
mcpdiff -o custom/path.mcpc.json baseline update --command "node server.js"

# Verify the server still matches the baseline
mcpdiff baseline verify --command "node server.js"
mcpdiff baseline verify --baseline custom/path.mcpc.json --url http://localhost:3000/mcp
```

### `mcpdiff ci`

All-in-one CI command: captures a snapshot, diffs against a baseline, outputs the report, and sets the exit code.

```bash
# Basic usage
mcpdiff ci --baseline contracts/baseline.mcpc.json --command "node server.js"

# Fail on warnings too (stricter)
mcpdiff ci --baseline contracts/baseline.mcpc.json --command "node server.js" --fail-on warning

# Only show breaking changes
mcpdiff ci --baseline contracts/baseline.mcpc.json --command "node server.js" --severity breaking

# Send results to a webhook
mcpdiff ci --baseline contracts/baseline.mcpc.json --command "node server.js" --webhook https://example.com/hook
```

Auto-detects CI environments (GitHub Actions, GitLab CI, CircleCI) and selects the appropriate output format. Writes to `GITHUB_STEP_SUMMARY` when running in GitHub Actions.

### `mcpdiff watch`

Watch for file changes and re-diff against a baseline on every change. Useful during development.

```bash
mcpdiff watch --baseline contracts/baseline.mcpc.json --command "node server.js"

# Watch specific paths with custom debounce
mcpdiff watch --baseline contracts/baseline.mcpc.json --command "node server.js" \
  --watch-paths src lib --debounce 1000

# Send diffs to a webhook on each cycle
mcpdiff watch --baseline contracts/baseline.mcpc.json --command "node server.js" \
  --webhook https://example.com/hook
```

### `mcpdiff sign`

Signs a snapshot with a private key, producing a detached `.mcpc.sig` file.

```bash
# Sign with Ed25519
mcpdiff sign contracts/baseline.mcpc.json --key ./private.pem

# Sign with RSA
mcpdiff sign contracts/baseline.mcpc.json --key ./rsa-private.pem

# Write signature to a custom path
mcpdiff sign snapshot.mcpc.json --key ./private.pem -o custom/path.mcpc.sig
```

The sign command verifies the content hash before signing — it will refuse to sign a snapshot whose content has been tampered with.

### `mcpdiff verify`

Verifies a snapshot's signature using a public key.

```bash
# Verify (auto-discovers .mcpc.sig file next to the snapshot)
mcpdiff verify contracts/baseline.mcpc.json --key ./public.pem

# Explicit signature path
mcpdiff verify snapshot.mcpc.json --key ./public.pem --signature custom/path.mcpc.sig
```

Performs three checks: content hash integrity, hash binding (signature matches this snapshot), and cryptographic verification. Exit code 0 on success, 1 on failure.

### `mcpdiff verify-hash`

Quick integrity check — recomputes the content hash and compares to the stored value. No keys needed.

```bash
mcpdiff verify-hash snapshot.mcpc.json

# JSON output
mcpdiff verify-hash snapshot.mcpc.json --format json
```

### `mcpdiff inspect`

Summarizes a snapshot file.

```bash
mcpdiff inspect snapshot.mcpc.json
mcpdiff inspect snapshot.mcpc.json --tools
mcpdiff inspect snapshot.mcpc.json --schema create_contact
```

## Transport Options

All commands that connect to a live server accept these transport options:

```bash
# SSE transport (instead of default streamable-http)
mcpdiff snapshot --url http://localhost:3000/sse --sse -o snapshot.mcpc.json

# Custom HTTP headers (repeatable)
mcpdiff snapshot --url http://localhost:3000/mcp \
  --header "Authorization: Bearer token" \
  --header "X-Custom: value" \
  -o snapshot.mcpc.json
```

| Flag | Description |
|------|-------------|
| `--command <cmd>` | Server command to run via stdio transport |
| `--url <url>` | Server URL for streamable-http or SSE transport |
| `--sse` | Use SSE transport instead of streamable-http (requires `--url`) |
| `--header <header...>` | Custom HTTP headers as `"Key: Value"` (repeatable) |
| `--config <path>` | Path to `mcp.json` config file |
| `--server <name>` | Server name from config file |

## Project Config (`mcpcontracts.json`)

Instead of repeating transport and baseline flags on every invocation, put them in an `mcpcontracts.json` at your project root. It is discovered by walking up from the current directory (like `tsconfig.json`), or passed explicitly with the global `--project <path>` option.

```jsonc
{
  // How to reach your server — exactly one of the three transport shapes:
  "server": {
    "command": "node",
    "args": ["dist/index.js"],
    "env": { "API_KEY": "..." }
    // or: "url": "http://localhost:3000/mcp", "sse": true, "headers": { "Authorization": "..." }
    // or: "config": "./mcp.json", "name": "my-server"
  },
  "baseline": "contracts/baseline.mcpc.json",
  "failOn": "breaking",
  "watch": { "paths": ["src"], "debounce": 500 }
}
```

With the config in place, the repeated commands need no flags at all:

```bash
mcpdiff baseline update        # knows the server + baseline path
mcpdiff baseline verify        # zero flags locally
mcpdiff ci                     # zero flags in CI
mcpdiff watch                  # zero flags in dev
```

The config is read by every command that connects to a live server: `snapshot`, `diff --live`, `baseline update`, `baseline verify`, `ci`, and `watch`. Pure file commands (`diff a b`, `inspect`, `sign`, `verify`, `verify-hash`) ignore it.

**Precedence:** explicit CLI flags > config file > built-in defaults. Passing any transport flag (`--command`, `--url`, `--config`, …) ignores the config's `server` block entirely — the two sources are never partially merged. `failOn` applies to `ci` and `watch`; the `watch` block applies to `watch` only.

**Paths** in the config (`baseline`, `watch.paths`, `server.config`) are resolved relative to the config file's directory, so commands behave the same from any subdirectory.

**Validation** is strict: unknown keys are an error (catching typos like `"failon"`), and an invalid config exits with code `2` and a message naming the file and the offending key — even when flags would have overridden it.

## Why Description Changes are Warnings

Tool descriptions aren't just documentation — they're instructions to the model. A changed description can embed hidden prompt injections that alter how an agent uses the tool, without changing the schema at all. This is [OWASP MCP03:2025 — Tool Poisoning](https://owasp.org/www-project-mcp-top-10/2025/MCP03-2025%E2%80%93Tool-Poisoning).

`mcpdiff` flags **every description change** as a warning and shows you a readable diff of what changed, so you can review it before deploying.

## CI Integration

### GitHub Action

The easiest way to integrate with GitHub is the official action:

```yaml
# .github/workflows/mcp-contract.yml
name: MCP Contract Check
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: mcp-contracts/github-action@v0
        with:
          baseline: contracts/baseline.mcpc.json
          command: node dist/index.js
          fail-on: breaking        # or "warning" / "safe"
          comment-on-pr: true
          github-token: ${{ secrets.GITHUB_TOKEN }}
          # Optional: verify baseline signature before diffing
          verify-signature: true
          signature-key: ${{ secrets.MCP_PUBLIC_KEY }}
```

**Outputs:** `has-changes`, `has-breaking`, `summary`, `exit-code` — use them in subsequent steps.

### CLI in CI

Use `mcpdiff ci` directly in any CI system:

```yaml
# .github/workflows/mcp-contract.yml
name: MCP Contract Check
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g @mcp-contracts/cli
      - run: mcpdiff ci --baseline contracts/baseline.mcpc.json --command "node dist/index.js"

      # Or with signature verification
      - run: >
          mcpdiff ci
          --baseline contracts/baseline.mcpc.json
          --command "node dist/index.js"
          --verify-signature
          --signature-key ./public.pem
```

The `ci` command auto-detects the CI environment and selects the right output format (markdown for GitHub Actions, JSON otherwise). It also writes to `GITHUB_STEP_SUMMARY` automatically.

## Packages

| Package | Description |
|---------|-------------|
| [`@mcp-contracts/core`](./packages/core) | Snapshot types, diff engine, classification logic |
| [`@mcp-contracts/cli`](./packages/cli) | The `mcpdiff` CLI tool |

---

*mcp-contracts is an open-source project (MIT license). It's community tooling for the MCP ecosystem, not affiliated with Anthropic or the MCP project. Contributions and feedback are welcome.*

## License

MIT
