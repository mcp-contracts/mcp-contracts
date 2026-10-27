# @mcp-contracts/cli

The `mcpdiff` CLI: capture, check, test and sign MCP server tool schemas.

Detects breaking changes, description drift and potential [tool poisoning](https://owasp.org/www-project-mcp-top-10/2025/MCP03-2025%E2%80%93Tool-Poisoning) vectors in MCP servers. This README is the command reference; the [project README](https://github.com/mcp-contracts/mcp-contracts#readme) covers the motivation, the project config and CI integration.

## Install

```bash
npm install -g @mcp-contracts/cli
```

## Quick Start

```bash
# One-command setup: writes mcpcontracts.json and captures the baseline
npx @mcp-contracts/cli init --command node --args dist/index.js

# From then on, zero flags, locally and in CI
npx @mcp-contracts/cli check
```

`init` writes an `mcpcontracts.json` project config so every later invocation knows your server and baseline. The file is discovered by walking up from the current directory to the repository root; explicit CLI flags always override it, and passing any transport flag ignores its `server` block entirely. The config executes the server command it names, so only run `mcpdiff` in repositories you trust (see the [trust model](https://github.com/mcp-contracts/mcp-contracts/blob/main/SECURITY.md#trust-model)).

```jsonc
{
  "server": { "command": "node", "args": ["dist/index.js"] },
  // or: "url": "http://localhost:3000/mcp"  or: "config": "./mcp.json", "name": "my-server"
  "baseline": "contracts/baseline.mcpc.json",
  "failOn": "breaking",
  "watch": { "paths": ["src"], "debounce": 500 }
}
```

## Global Options

Available on every command, in any position (`mcpdiff check --format json` and `mcpdiff --format json check` both work):

```
--format <format>    Output format: terminal | json | markdown (default: terminal on a TTY, json otherwise)
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

Specify one of `--command`, `--url` or `--config`, or none of them with a `server` block in `mcpcontracts.json`.

## Commands

Every command exits `0` when clean, `1` when findings reach the failure threshold and `2` on error (bad input, connection failure, invalid config).

### `mcpdiff init`

Writes `mcpcontracts.json`, captures the initial baseline and prints next steps including a CI workflow snippet. Interactive on a TTY (offers servers from `./mcp.json`); fully scriptable via transport flags; `--force` overwrites an existing config. Without a TTY, missing information exits with code `2` instead of prompting. Nothing is written unless the initial capture succeeds.

### `mcpdiff check`

Captures the live server, diffs it against the baseline, reports and sets the exit code. When the content hashes match, the diff engine is skipped entirely. Detects CI environments: markdown output and a `GITHUB_STEP_SUMMARY` entry on GitHub Actions, JSON elsewhere.

```bash
mcpdiff check                        # zero flags with a project config
mcpdiff check --command "node server.js" --baseline contracts/baseline.mcpc.json
mcpdiff check --fail-on warning      # stricter threshold
mcpdiff check --severity breaking    # only show breaking changes
mcpdiff check --watch --watch-paths src --debounce 1000 --clear
mcpdiff check --verify-signature --signature-key ./public.pem
mcpdiff check --webhook https://example.com/hook
```

The baseline's content hash is verified on read; a file whose stored hash does not match its content is refused. With `--verify-signature` the public key comes from `--signature-key` or the `MCP_SIGNATURE_KEY` environment variable, and in watch mode the signature is re-verified every cycle.

**Webhooks.** `--webhook <url>` POSTs a JSON payload (`event`, `timestamp`, `source`, `report`) after each diff. Delivery is best-effort and never changes the exit code. The URL must be `https`, except for loopback hosts; set `MCP_WEBHOOK_ALLOW_INSECURE=1` to override. Redirects are not followed. Set `MCP_WEBHOOK_SECRET` to have the body signed: the receiver recomputes `sha256=<HMAC-SHA256 of the raw body>` and compares it to the `X-MCP-Signature` header.

### `mcpdiff update`

Captures the live server and writes the baseline (`--baseline <path>` to override the default `contracts/baseline.mcpc.json`). The counterpart to `check`.

### `mcpdiff test`

Runs the contract test suite from `@mcp-contracts/test` against a live server: schema conformance (every tool in the contract exists with a matching schema) plus boundary input tests.

```bash
mcpdiff test                         # zero arguments with a project config
mcpdiff test contract.mcpc.json --command node --args server.js
mcpdiff test contract.mcpc.json --url http://localhost:3000/mcp --allow-extra-tools
mcpdiff test --no-boundary --skip-tools delete_contact --timeout 60000
mcpdiff test --no-conformance        # boundary tests only
mcpdiff test --ignore-descriptions   # tolerate description drift
```

### `mcpdiff snapshot`

Captures an ad-hoc snapshot as a `.mcpc.json` file. For baselines, use `update`.

```bash
mcpdiff snapshot --command "node server.js" -o snapshot.mcpc.json
mcpdiff snapshot --url http://localhost:3000/mcp -o snapshot.mcpc.json
mcpdiff snapshot --config ./mcp.json --server my-server -o snapshot.mcpc.json
mcpdiff snapshot --config ./mcp.json --all --out-dir contracts/   # one file per server
```

Discovery is bounded: at most 1000 pages and 10 000 items per list, a repeated pagination cursor is refused, and the whole capture must finish within five minutes. Exceeding a bound, or any failing list call for a capability the server advertises, is an error (exit `2`). A partial interface is never written as a snapshot.

### `mcpdiff diff`

Compares two snapshot files and classifies every change as breaking, warning or safe.

```bash
mcpdiff diff before.mcpc.json after.mcpc.json
mcpdiff diff before.mcpc.json after.mcpc.json --fail-on warning
mcpdiff diff before.mcpc.json after.mcpc.json --format json
mcpdiff diff before.mcpc.json after.mcpc.json --webhook https://example.com/hook

# Diff every server in an mcp.json against its baseline in one report
mcpdiff diff --config ./mcp.json --baseline contracts/
```

A change the engine has no rule for (for example a JSON Schema keyword it does not model) is reported as a warning named `<category>.<name>.unclassified`, so a changed contract is never reported as unchanged. Tool `annotations` changes are warnings too.

### `mcpdiff check-conflicts`

Detects duplicate tool names across the servers of an mcp.json config. Duplicates with identical schemas are `exact`; same-named tools with different schemas are `conflicting`, which is dangerous for agents that route tool calls by bare name. `--fail-on conflicting` tolerates identical duplicates.

### `mcpdiff graph`

Renders a dependency graph of all servers in an mcp.json config: every server with its tools, plus overlap edges where two servers expose the same tool name. `--format terminal | mermaid | dot | json`.

### `mcpdiff sign` and `mcpdiff verify`

```bash
mcpdiff sign contracts/baseline.mcpc.json --key ./private.pem          # Ed25519 or RSA, writes .mcpc.sig
mcpdiff verify snapshot.mcpc.json                                       # content hash only, no keys
mcpdiff verify contracts/baseline.mcpc.json --key ./public.pem          # hash, binding and signature
mcpdiff verify snapshot.mcpc.json --key ./public.pem --signature custom/path.mcpc.sig
```

`sign` verifies the content hash first and refuses to sign a tampered snapshot. `verify` without `--key` recomputes the content hash only and says so, so the weaker check is never mistaken for the stronger one. With `--key` three checks run: hash integrity, hash binding (the signature belongs to this snapshot) and cryptographic verification; `--format json` lists which checks ran.

### `mcpdiff inspect`

Summarizes a snapshot file (`--tools`, `--resources`, `--prompts`, `--schema <tool>`).

> **Deprecated:** `ci`, `watch`, `baseline update`, `baseline verify`, `diff --live` and `verify-hash` still work but are hidden and print a notice. They are replaced by `check` (with `--watch`), `update` and `verify`, and will be removed in a future release.

## CI Integration

```yaml
name: MCP Contract Check
on: [pull_request]
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g @mcp-contracts/cli@0.10.0   # pin to a release
      - run: mcpdiff check   # reads the committed mcpcontracts.json
```

There is also a [GitHub Action](https://github.com/mcp-contracts/github-action) that posts the report as a PR comment.

---

*mcp-contracts is an open-source project (MIT license). It is community tooling for the MCP ecosystem, not affiliated with Anthropic or the MCP project. Contributions and feedback are welcome.*

## License

MIT
