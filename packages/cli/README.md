# @mcp-contracts/cli

The `mcpdiff` CLI tool — capture, diff, and inspect MCP server tool schemas.

Detects breaking changes, description drift, and potential [tool poisoning](https://owasp.org/www-project-mcp-top-10/2025/MCP03-2025%E2%80%93Tool-Poisoning) vectors in MCP servers.

## Install

```bash
npm install -g @mcp-contracts/cli
```

Or run directly with npx:

```bash
npx mcpdiff snapshot --command "node server.js" -o snapshot.mcpc.json
```

## Commands

### `mcpdiff snapshot`

Connects to an MCP server and captures its tool/resource/prompt interface as a `.mcpc.json` file.

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

# Fail CI on warnings too
mcpdiff diff before.mcpc.json after.mcpc.json --fail-on warning

# Output as JSON
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

## CI Integration

```yaml
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
---
*mcp-contracts is an open-source project (MIT license). It's community tooling for the MCP ecosystem, not affiliated with Anthropic or the MCP project. Contributions and feedback are welcome.*

## License

MIT
