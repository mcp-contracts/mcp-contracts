# Examples

Self-contained demos of `mcpdiff` in action. Each example includes a minimal MCP server and pre-captured snapshots so you can try things immediately.

## Quick Demo (No Server Required)

If you just want to see what a diff looks like, use the pre-captured snapshots:

```bash
# From the repo root (after building)
pnpm -r build

# Diff two pre-captured snapshots
node packages/cli/dist/index.js diff \
  examples/contacts-server/snapshots/v1.0.0.mcpc.json \
  examples/contacts-server/snapshots/v2.0.0.mcpc.json

# Inspect a snapshot
node packages/cli/dist/index.js inspect \
  examples/contacts-server/snapshots/v1.0.0.mcpc.json --tools
```

## Full Walkthrough (Live Server)

This runs an actual MCP server, captures snapshots, and diffs them.

### Prerequisites

- Node.js >= 20
- pnpm installed
- Repo built (`pnpm -r build` from root)
- Example server dependencies installed (`cd examples/contacts-server && npm install`)

### Steps

```bash
# 1. Capture a snapshot of the v1 server
node packages/cli/dist/index.js snapshot \
  --command node --args examples/contacts-server/v1/server.js \
  -o /tmp/contacts-v1.mcpc.json

# 2. Capture a snapshot of the v2 server (has breaking + warning changes)
node packages/cli/dist/index.js snapshot \
  --command node --args examples/contacts-server/v2/server.js \
  -o /tmp/contacts-v2.mcpc.json

# 3. Diff them
node packages/cli/dist/index.js diff \
  /tmp/contacts-v1.mcpc.json \
  /tmp/contacts-v2.mcpc.json

# 4. Diff with JSON output
node packages/cli/dist/index.js diff \
  /tmp/contacts-v1.mcpc.json \
  /tmp/contacts-v2.mcpc.json \
  --format json

# 5. Diff with strict mode (fail on warnings too)
node packages/cli/dist/index.js diff \
  /tmp/contacts-v1.mcpc.json \
  /tmp/contacts-v2.mcpc.json \
  --fail-on warning
echo "Exit code: $?"
```

Or use the automated demo script:

```bash
./examples/contacts-server/demo.sh
```

## Baseline Workflow

The baseline commands let you pin a contract and verify it hasn't drifted:

```bash
# 1. Capture a baseline from the live server
node packages/cli/dist/index.js baseline update \
  --command node --args examples/contacts-server/v1/server.js

# → writes contracts/baseline.mcpc.json

# 2. Verify the server still matches (should pass)
node packages/cli/dist/index.js baseline verify \
  --command node --args examples/contacts-server/v1/server.js

# 3. Verify against the v2 server (should fail — contract changed)
node packages/cli/dist/index.js baseline verify \
  --command node --args examples/contacts-server/v2/server.js
echo "Exit code: $?"
```

## CI Command

The `ci` command is an all-in-one for CI pipelines — capture, diff, format, and exit code in a single step:

```bash
# Run against a baseline
node packages/cli/dist/index.js ci \
  --baseline examples/contacts-server/snapshots/v1.0.0.mcpc.json \
  --command node --args examples/contacts-server/v2/server.js

# It auto-detects CI environments and selects the right output format.
# In GitHub Actions, it writes to GITHUB_STEP_SUMMARY automatically.
```

## What Changes Between v1 and v2

The contacts server simulates a realistic version upgrade with multiple change types:

| Change | Severity | Description |
|--------|----------|-------------|
| `create_contact` — required param `phone` added | 🔴 breaking | Existing agents calling without `phone` will fail |
| `search_contacts` — description changed | 🟡 warning | Potential tool poisoning vector — review the diff |
| `delete_contact` — tool removed | 🔴 breaking | Agents relying on deletion will fail |
| `export_contacts` — new tool added | 🟢 safe | New capability, backward-compatible |
| `get_contact` — optional param `include_notes` added | 🟢 safe | Backward-compatible addition |
| `update_contact` — `email` type narrowed | 🔴 breaking | Previously accepted formats may now fail |

This gives you a realistic example hitting all three severity levels.

## Live Diff

Diff a baseline snapshot against a live server in one command — no need to capture a second snapshot first:

```bash
# Diff baseline file against a live stdio server
node packages/cli/dist/index.js diff --live \
  examples/contacts-server/snapshots/v1.0.0.mcpc.json \
  --command node --args examples/contacts-server/v2/server.js

# Diff baseline against a remote SSE server with custom headers
node packages/cli/dist/index.js diff --live \
  contracts/baseline.mcpc.json \
  --url https://mcp.example.com/sse --sse \
  --header "Authorization: Bearer $TOKEN"
```

## Watch Mode

Re-diffs your server automatically whenever source files change — ideal during development:

```bash
# Watch for changes and re-diff
node packages/cli/dist/index.js watch \
  --command node --args examples/contacts-server/v1/server.js \
  --baseline examples/contacts-server/snapshots/v1.0.0.mcpc.json \
  --watch-paths examples/contacts-server/ \
  --clear

# Watch with webhook notifications on each change
node packages/cli/dist/index.js watch \
  --command node --args src/server.js \
  --baseline contracts/baseline.mcpc.json \
  --webhook http://localhost:8080/webhook \
  --debounce 1000
```

## Webhooks

Send diff results to any HTTP endpoint. Works with `diff`, `ci`, and `watch`:

```bash
# Webhook on diff
node packages/cli/dist/index.js diff \
  examples/contacts-server/snapshots/v1.0.0.mcpc.json \
  examples/contacts-server/snapshots/v2.0.0.mcpc.json \
  --webhook http://localhost:8080/webhook

# Webhook on ci
node packages/cli/dist/index.js ci \
  --baseline contracts/baseline.mcpc.json \
  --command node --args dist/index.js \
  --webhook https://hooks.slack.com/services/XXX

# Webhook on watch (fires on every re-diff)
node packages/cli/dist/index.js watch \
  --command node --args src/server.js \
  --baseline contracts/baseline.mcpc.json \
  --webhook http://localhost:8080/webhook
```

### Webhook Receiver

A minimal webhook receiver is included for testing. It pretty-prints every payload it receives:

```bash
node examples/webhook-receiver/server.js
# → Listening on http://localhost:8080

# In another terminal:
node packages/cli/dist/index.js diff \
  examples/contacts-server/snapshots/v1.0.0.mcpc.json \
  examples/contacts-server/snapshots/v2.0.0.mcpc.json \
  --webhook http://localhost:8080/webhook
```

Set a custom port with `PORT=9090 node examples/webhook-receiver/server.js`.

## SSE Transport & Custom Headers

Connect to remote MCP servers over SSE with optional authentication headers:

```bash
# Snapshot a remote SSE server
node packages/cli/dist/index.js snapshot \
  --url https://mcp.example.com/sse --sse

# With custom headers (repeatable)
node packages/cli/dist/index.js snapshot \
  --url https://mcp.example.com/sse --sse \
  --header "Authorization: Bearer $TOKEN" \
  --header "X-Custom: value"

# CI check against an SSE server
node packages/cli/dist/index.js ci \
  --baseline contracts/baseline.mcpc.json \
  --url https://mcp.example.com/sse --sse \
  --header "Authorization: Bearer $TOKEN"
```

## Example: CI Usage

See `examples/ci/` for GitHub Actions workflow examples showing three approaches:

- **GitHub Action** — one-step integration with PR comments and step summary
- **`mcpdiff ci` CLI** — works in any CI system (GitHub, GitLab, CircleCI, etc.)
- **Scheduled monitoring** — use `mcpdiff diff --live` on a cron to watch deployed servers
