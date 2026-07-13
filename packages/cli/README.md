# @mcp-contracts/cli

The `mcpdiff` CLI tool — capture, check, test, and sign MCP server tool schemas.

Detects breaking changes, description drift, and potential [tool poisoning](https://owasp.org/www-project-mcp-top-10/2025/MCP03-2025%E2%80%93Tool-Poisoning) vectors in MCP servers.

## Install

```bash
npm install -g @mcp-contracts/cli
```

## Quick Start

```bash
# One-command setup: writes mcpcontracts.json and captures the baseline
npx @mcp-contracts/cli init --command node --args dist/index.js

# From then on — zero flags, locally and in CI
npx @mcp-contracts/cli check
```

`init` writes an `mcpcontracts.json` project config so every later invocation knows your server and baseline. The file is discovered by walking up from the current directory (like `tsconfig.json`); explicit CLI flags always override it, and passing any transport flag ignores its `server` block entirely.

```jsonc
{
  "server": { "command": "node", "args": ["dist/index.js"] },
  // or: "url": "http://localhost:3000/mcp" — or: "config": "./mcp.json", "name": "my-server"
  "baseline": "contracts/baseline.mcpc.json",
  "failOn": "breaking",
  "watch": { "paths": ["src"], "debounce": 500 }
}
```

## Global Options

Available on every command, in any position:

```
--format <format>    Output format: terminal | json | markdown
-o, --output <path>  Write output to a file instead of stdout
--no-color           Disable colored output
--quiet              Suppress non-essential output
--verbose            Show detailed information
--project <path>     Path to mcpcontracts.json (default: discovered from the CWD)
-V, --version        Print the CLI version
```

## Transport Options

Commands that connect to a live server accept:

```
--command <cmd>       Server command to run via stdio transport
--args <args...>      Arguments for the server command
--env <pairs...>      Environment variables as KEY=VALUE pairs
--url <url>           Server URL for streamable-http or SSE transport
--sse                 Use SSE transport instead of streamable-http (requires --url)
--header <header...>  Custom HTTP headers as "Key: Value" (repeatable)
--config <path>       Path to mcp.json config file
--server <name>       Server name from config file
```

Specify one of `--command`, `--url`, or `--config` — or none, with a `server` block in `mcpcontracts.json`.

## Commands

### `mcpdiff init`

One-command onboarding: writes `mcpcontracts.json`, captures the initial baseline, and prints next steps including a CI workflow snippet. Interactive on a TTY (offers servers from `./mcp.json`); fully scriptable via transport flags; `--force` to overwrite.

### `mcpdiff check`

Captures the live server, diffs it against the baseline, reports, and sets the exit code. Detects CI environments (format selection, `GITHUB_STEP_SUMMARY`).

```bash
mcpdiff check                        # zero flags with a project config
mcpdiff check --fail-on warning      # stricter threshold
mcpdiff check --severity breaking    # only show breaking changes
mcpdiff check --watch --watch-paths src --debounce 1000 --clear
mcpdiff check --verify-signature --signature-key ./public.pem
mcpdiff check --webhook https://example.com/hook
```

**Exit codes:** `0` = clean, `1` = changes at or above the `--fail-on` threshold, `2` = error.

### `mcpdiff update`

Captures the live server and writes the baseline (`--baseline <path>` to override; default `contracts/baseline.mcpc.json`).

### `mcpdiff test`

Runs the contract test suite from `@mcp-contracts/test`: schema conformance plus boundary input tests.

```bash
mcpdiff test                         # zero args with a project config
mcpdiff test contract.mcpc.json --command node --args server.js
mcpdiff test --no-boundary --no-conformance --allow-extra-tools \
  --ignore-descriptions --skip-tools dangerous_tool --timeout 60000
```

### `mcpdiff snapshot`

Captures an ad-hoc snapshot as a `.mcpc.json` file (`-o <path>`); `--all --out-dir <dir>` snapshots every server in an mcp.json config.

### `mcpdiff diff`

Compares two snapshot files and classifies every change as breaking, warning, or safe (`--severity`, `--fail-on`, `--webhook`). `mcpdiff diff --config ./mcp.json --baseline <dir>` diffs a whole composition against per-server baselines.

### `mcpdiff check-conflicts`

Detects duplicate tool names across the servers of an mcp.json config (`--fail-on conflicting` to tolerate identical duplicates).

### `mcpdiff graph`

Renders a dependency graph of all servers in an mcp.json config (`--format mermaid | dot | json`).

### `mcpdiff sign` / `mcpdiff verify`

Sign a snapshot with an Ed25519 or RSA private key (detached `.mcpc.sig`); verify integrity/authenticity. `verify` without `--key` checks the content hash only and says so; with `--key` it verifies hash, binding, and signature. `--signature <path>` overrides the derived sig path.

### `mcpdiff inspect`

Summarizes a snapshot file (`--tools`, `--resources`, `--prompts`, `--schema <tool>`).

> **Deprecated:** `ci`, `watch`, `baseline update`, `baseline verify`, `diff --live`, and `verify-hash` still work but are hidden and print a notice — replaced by `check` (with `--watch`), `update`, and `verify`.

## CI Integration

```yaml
name: MCP Contract Check
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g @mcp-contracts/cli
      - run: mcpdiff check   # reads the committed mcpcontracts.json
```

Full documentation: [mcp-contracts on GitHub](https://github.com/mcp-contracts/mcp-contracts#readme)

---
*mcp-contracts is an open-source project (MIT license). It's community tooling for the MCP ecosystem, not affiliated with Anthropic or the MCP project. Contributions and feedback are welcome.*

## License

MIT
