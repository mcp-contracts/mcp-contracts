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

## Example: CI Usage

See `examples/ci/` for a GitHub Actions workflow example that uses `mcpdiff` to check for breaking changes on every PR.
