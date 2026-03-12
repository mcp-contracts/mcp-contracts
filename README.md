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
```

### `mcpdiff diff`

Compares two snapshots and classifies every change as breaking, warning, or safe.

```bash
mcpdiff diff before.mcpc.json after.mcpc.json

# Fail CI on warnings too (stricter)
mcpdiff diff before.mcpc.json after.mcpc.json --fail-on warning

# Output as JSON for programmatic use
mcpdiff diff before.mcpc.json after.mcpc.json --format json
```

**Exit codes:** `0` = no breaking changes, `1` = breaking changes detected, `2` = error.

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
```

Auto-detects CI environments (GitHub Actions, GitLab CI, CircleCI) and selects the appropriate output format. Writes to `GITHUB_STEP_SUMMARY` when running in GitHub Actions.

### `mcpdiff inspect`

Summarizes a snapshot file.

```bash
mcpdiff inspect snapshot.mcpc.json
mcpdiff inspect snapshot.mcpc.json --tools
mcpdiff inspect snapshot.mcpc.json --schema create_contact
```

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
