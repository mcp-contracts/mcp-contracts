# @mcp-contracts/cli

The `mcpdiff` CLI tool — capture, diff, and inspect MCP server tool schemas.

Detects breaking changes, description drift, and potential [tool poisoning](https://owasp.org/www-project-mcp-top-10/2025/MCP03-2025%E2%80%93Tool-Poisoning) vectors in MCP servers.

## Install

```bash
npm install -g @mcp-contracts/cli
```

Or run directly with npx:

```bash
npx @mcp-contracts/cli snapshot --command "node server.js" -o snapshot.mcpc.json
```

## Global Options

```
--format <format>    Output format: terminal | json | markdown
--no-color           Disable colored output
-o, --output <path>  Output file path
--quiet              Suppress non-essential output
--verbose            Show detailed information
```

## Transport Options

Most commands accept transport options to connect to a live MCP server:

```
--command <cmd>       Server command to run via stdio transport
--args <args...>      Arguments for the server command
--url <url>           Server URL for streamable-http or SSE transport
--sse                 Use SSE transport instead of streamable-http (requires --url)
--header <header...>  Custom HTTP headers as "Key: Value" (repeatable)
--config <path>       Path to mcp.json config file
--server <name>       Server name from config file
--env <pairs...>      Environment variables as KEY=VALUE pairs
```

Exactly one of `--command`, `--url`, or `--config` must be specified.

## Commands

### `mcpdiff snapshot`

Connects to an MCP server and captures its tool/resource/prompt interface as a `.mcpc.json` file.

```bash
# Via stdio transport
mcpdiff snapshot --command "node server.js" -o snapshot.mcpc.json

# Via HTTP transport
mcpdiff snapshot --url http://localhost:3000/mcp -o snapshot.mcpc.json

# Via SSE transport with custom headers
mcpdiff snapshot --url http://localhost:3000/sse --sse --header "Authorization: Bearer token" -o snapshot.mcpc.json

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

# Fail CI on warnings too
mcpdiff diff before.mcpc.json after.mcpc.json --fail-on warning

# Output as JSON
mcpdiff diff before.mcpc.json after.mcpc.json --format json

# Send results to a webhook
mcpdiff diff before.mcpc.json after.mcpc.json --webhook https://example.com/hook
```

**Options:**

```
--live               Diff baseline against a live server instead of a file
--baseline <dir>     Diff all config servers against baselines in this directory (requires --config)
--severity <level>   Minimum severity to display: safe | warning | breaking (default: "safe")
--fail-on <level>    Exit code 1 threshold: safe | warning | breaking (default: "breaking")
--webhook <url>      POST diff results to a webhook URL
```

**Exit codes:** `0` = no breaking changes, `1` = breaking changes detected, `2` = error.

Composition mode diffs every server in an mcp.json config against its baseline directory:

```bash
mcpdiff diff --config ./mcp.json --baseline contracts/
```

### `mcpdiff check-conflicts`

Detects duplicate tool names across the servers of an mcp.json config.

```bash
mcpdiff check-conflicts --config ./mcp.json

# Only fail on schema conflicts, tolerate identical duplicates
mcpdiff check-conflicts --config ./mcp.json --fail-on conflicting
```

**Exit codes:** `0` = no collisions, `1` = collisions found, `2` = error.

### `mcpdiff graph`

Renders a dependency graph of all servers in an mcp.json config.

```bash
mcpdiff graph --config ./mcp.json
mcpdiff --format mermaid graph --config ./mcp.json   # also: dot, json
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

All-in-one CI command: captures a snapshot, diffs against a baseline, outputs the report, and sets the exit code. Auto-detects CI environments (GitHub Actions, GitLab CI, CircleCI).

```bash
mcpdiff ci --baseline contracts/baseline.mcpc.json --command "node server.js"

# Fail on warnings too
mcpdiff ci --baseline contracts/baseline.mcpc.json --command "node server.js" --fail-on warning

# Only show breaking changes
mcpdiff ci --baseline contracts/baseline.mcpc.json --command "node server.js" --severity breaking

# Send results to a webhook
mcpdiff ci --baseline contracts/baseline.mcpc.json --command "node server.js" --webhook https://example.com/hook
```

**Options:**

```
--baseline <path>    Path to baseline snapshot (required)
--fail-on <level>    Severity threshold for exit code 1 (default: "breaking")
--severity <level>   Minimum severity to display (default: "safe")
--webhook <url>      POST diff results to a webhook URL
```

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

**Options:**

```
--baseline <path>         Path to baseline snapshot (required)
--watch-paths <paths...>  Paths to watch for changes (default: ["."])
--debounce <ms>           Debounce interval in milliseconds (default: 500)
--severity <level>        Minimum severity to display (default: "safe")
--fail-on <level>         Severity threshold (default: "breaking")
--webhook <url>           POST diffs on each cycle
--clear                   Clear screen between diffs (auto-enabled if stdout is TTY)
```

### `mcpdiff inspect`

Summarizes a snapshot file.

```bash
mcpdiff inspect snapshot.mcpc.json
mcpdiff inspect snapshot.mcpc.json --tools
mcpdiff inspect snapshot.mcpc.json --schema create_contact
```

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
      - run: mcpdiff ci --baseline contracts/baseline.mcpc.json --command "node dist/index.js"
```
---
*mcp-contracts is an open-source project (MIT license). It's community tooling for the MCP ecosystem, not affiliated with Anthropic or the MCP project. Contributions and feedback are welcome.*

## License

MIT
