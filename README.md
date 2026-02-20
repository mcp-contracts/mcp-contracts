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
# Capture a snapshot of your MCP server's tool schemas
npx mcpdiff snapshot --command "node ./my-server/dist/index.js" -o v1.mcpc.json

# Make changes to your server, then capture again
npx mcpdiff snapshot --command "node ./my-server/dist/index.js" -o v2.mcpc.json

# Diff the two snapshots
npx mcpdiff diff v1.mcpc.json v2.mcpc.json
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

Use `mcpdiff` in your CI pipeline to catch breaking changes before they reach production:

```yaml
# .github/workflows/mcp-contract.yml
name: MCP Contract Check
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: npm install -g @mcp-contracts/cli
      - run: mcpdiff snapshot --command "node dist/index.js" -o current.mcpc.json
      - run: mcpdiff diff contracts/baseline.mcpc.json current.mcpc.json
```

## Packages

| Package | Description |
|---------|-------------|
| [`@mcp-contracts/core`](./packages/core) | Snapshot types, diff engine, classification logic |
| [`@mcp-contracts/cli`](./packages/cli) | The `mcpdiff` CLI tool |

## License

MIT
